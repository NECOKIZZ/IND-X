// The HTTP API the mobile app talks to. JSON everywhere; BigInts as strings.
//
//   GET  /v1/config                       cluster, program, stake mint, rules
//   GET  /v1/assets                       basket tokens with live prices
//   GET  /v1/rounds                       recent rounds
//   GET  /v1/rounds/current               the latest round, with standings
//   GET  /v1/rounds/:id                   a round, with standings
//   GET  /v1/rounds/:id/etfs/:key         one ETF: legs, members, chart
//   GET  /v1/rounds/:id/activity          recent entries
//   GET  /v1/rounds/:id/inputs            published settlement inputs
//   GET  /v1/rounds/:id/verify            recompute the payouts from the inputs
//   GET  /v1/wallets/:wallet              balances, entries, results
//   GET  /v1/leaderboard                  best players across rounds
//   POST /v1/tx/create | back | claim | boost | buy   → TxPlan (unsigned transactions)
//   POST /v1/tx/send     { tx }           relay a signed transaction
//   POST /v1/faucet      { wallet }       test clusters only
//   POST /v1/push        { wallet, token }   register for notifications (DELETE to remove)

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_LEAGUE_PARAMS, DEFAULT_RULES, MAX_CREATOR_BUY_FEE_BPS, recomputeFromInputs, type ConfigView } from "@indx/core";
import type { League } from "../league.js";
import { publicRpcUrl } from "../config.js";
import { PRICE_SOURCE_LABEL, priceSourceFromEnv } from "../prices.js";
import { activity, assetViews, currentRoundId, etfView, HttpError, leaderboard, roundSummaries, roundView, walletView } from "./views.js";
import { faucet, planBack, planBoost, planBuy, planClaim, planCreate, relay } from "./tx.js";

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const json = (c: Context, body: unknown, status = 200) =>
  c.body(JSON.stringify(body, replacer), status as 200, { "content-type": "application/json; charset=utf-8" });

const explorer = (cluster: string) => (cluster === "mainnet" ? "https://solscan.io" : cluster === "devnet" ? "https://solscan.io/?cluster=devnet" : "");

export function createApp(L: League) {
  const app = new Hono();
  app.use("*", cors());

  app.onError((err, c) => {
    if (err instanceof HttpError) return json(c, { error: err.message }, err.status);
    console.error(err);
    return json(c, { error: (err as Error).message ?? "server error" }, 500);
  });

  app.get("/", (c) => json(c, { ok: true, cluster: L.cluster, docs: "/v1/config" }));
  app.get("/healthz", (c) => json(c, { ok: true }));

  app.get("/v1/config", (c) => {
    const p = DEFAULT_LEAGUE_PARAMS;
    const body: ConfigView = {
      cluster: L.cluster,
      programId: L.deployment.programId,
      stakeMint: L.deployment.stakeMint,
      stakeDecimals: L.deployment.stakeDecimals,
      stakeSymbol: "USDC",
      lookupTable: L.deployment.lookupTable ?? null,
      rpcUrl: publicRpcUrl(L.cluster),
      faucet: !!L.deployment.faucet && !!L.faucet,
      explorer: explorer(L.cluster),
      priceSource: PRICE_SOURCE_LABEL[priceSourceFromEnv()],
      rules: {
        minTokens: DEFAULT_RULES.minTokens,
        maxTokens: 10,
        maxWeightPct: DEFAULT_RULES.maxWeightBps / 100,
        minBasketUsd: Number(DEFAULT_RULES.minValue / 10n ** 18n),
        maxCryptoPct: (DEFAULT_RULES.maxCryptoBps ?? 0) / 100,
        takePct: p.takeRateBps / 100,
        creatorFeePct: p.creatorFeeBps / 100,
        maxBuyFeePct: MAX_CREATOR_BUY_FEE_BPS / 100,
        capMultiple: Number(p.capMultiple),
        voidGraceDays: 3,
      },
    };
    return json(c, body);
  });

  app.get("/v1/assets", async (c) => json(c, await assetViews(L)));
  app.get("/v1/rounds", async (c) => json(c, await roundSummaries(L, Math.min(50, Number(c.req.query("limit") ?? 20)))));
  app.get("/v1/rounds/current", async (c) => json(c, await roundView(L, await currentRoundId(L))));
  const rid = async (c: Context) => (c.req.param("id") === "current" ? currentRoundId(L) : BigInt(c.req.param("id")!));
  app.get("/v1/rounds/:id", async (c) => json(c, await roundView(L, await rid(c))));
  app.get("/v1/rounds/:id/etfs/:key", async (c) => json(c, await etfView(L, await rid(c), c.req.param("key"))));
  app.get("/v1/rounds/:id/activity", async (c) => json(c, await activity(L, await rid(c))));
  app.get("/v1/rounds/:id/inputs", async (c) => {
    const inputs = await L.store.loadInputs(await rid(c));
    if (!inputs) throw new HttpError(404, "not settled yet");
    return json(c, inputs);
  });
  app.get("/v1/rounds/:id/verify", async (c) => {
    const id = await rid(c);
    const [inputs, round] = await Promise.all([L.store.loadInputs(id), L.reader.round(id)]);
    if (!inputs || !round) throw new HttpError(404, "not settled yet");
    const s = recomputeFromInputs(inputs);
    const matches = s.inputsHash === round.inputsHash;
    return json(c, { roundId: id.toString(), onChainHash: round.inputsHash, recomputedHash: s.inputsHash, matches, totalPayout: s.totalPayout.toString(), onChainTotalPayout: round.totalPayout.toString() });
  });

  app.get("/v1/wallets/:wallet", async (c) => json(c, await walletView(L, c.req.param("wallet"))));
  app.get("/v1/leaderboard", async (c) => json(c, await leaderboard(L)));

  const body = async <T>(c: Context): Promise<T> => {
    try {
      return (await c.req.json()) as T;
    } catch {
      throw new HttpError(400, "JSON body required");
    }
  };
  app.post("/v1/tx/create", async (c) => json(c, await planCreate(L, await body(c))));
  app.post("/v1/tx/back", async (c) => json(c, await planBack(L, await body(c))));
  app.post("/v1/tx/claim", async (c) => {
    const b = await body<{ wallet: string; roundId: string }>(c);
    return json(c, await planClaim(L, b.wallet, b.roundId));
  });
  app.post("/v1/tx/boost", async (c) => {
    const b = await body<{ wallet: string; roundId?: string; usd: number }>(c);
    return json(c, await planBoost(L, b.wallet, b.roundId, b.usd));
  });
  app.post("/v1/tx/buy", async (c) => json(c, await planBuy(L, await body(c))));
  app.post("/v1/tx/send", async (c) => {
    const b = await body<{ tx: string }>(c);
    return json(c, { signature: await relay(L, b.tx) });
  });
  app.post("/v1/faucet", async (c) => json(c, await faucet(L, (await body<{ wallet: string }>(c)).wallet)));

  app.post("/v1/push", async (c) => {
    const b = await body<{ wallet: string; token: string }>(c);
    if (!b.wallet || !b.token?.startsWith("ExponentPushToken")) throw new HttpError(400, "wallet and an Expo push token required");
    await L.store.addPushToken(b.wallet, b.token);
    return json(c, { ok: true });
  });
  app.delete("/v1/push", async (c) => {
    const b = await body<{ wallet: string; token: string }>(c);
    await L.store.removePushToken(b.wallet, b.token);
    return json(c, { ok: true });
  });

  return app;
}
