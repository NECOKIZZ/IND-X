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
//   POST /v1/basket/quote                 what a create would lock (same function the tx uses)
//   POST /v1/tx/create | back | claim | boost | buy   → TxPlan (unsigned transactions)
//   POST /v1/tx/send     { tx }           relay a signed transaction
//   POST /v1/faucet      { wallet }       test clusters only
//   POST /v1/push        { wallet, token }   register for notifications (DELETE to remove)
//   POST /v1/keeper/tick                  run one keeper step (Authorization: Bearer KEEPER_TICK_SECRET);
//                                         for hosts that sleep: a cron pings it every few minutes

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_LEAGUE_PARAMS, DEFAULT_RULES, MAX_CREATOR_BUY_FEE_BPS, recomputeFromInputs, type ConfigView } from "@indx/core";
import type { League } from "../league.js";
import { publicRpcUrl } from "../config.js";
import { PRICE_SOURCE_LABEL, priceSourceFromEnv } from "../prices.js";
import { normTag, planTransfer, poolView, resolveTag, tagChallenge, tagClaim } from "./social.js";
import { activity, assetViews, currentRoundId, etfView, HttpError, leaderboard, roundSummaries, roundView, walletView } from "./views.js";
import { faucet, planBack, planBoost, planBuy, planClaim, planCreate, quoteBasket, relay } from "./tx.js";
import { Keeper, keeperOptionsFromEnv } from "../keeper/keeper.js";
import { notifier } from "../push.js";
import { invalidateRound } from "./views.js";

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const json = (c: Context, body: unknown, status = 200) =>
  c.body(JSON.stringify(body, replacer), status as 200, { "content-type": "application/json; charset=utf-8" });

/** The deployed build: the host's git commit when it sets one, else "dev". */
export const serverVersion = () => (process.env.RENDER_GIT_COMMIT ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "dev").slice(0, 7);

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
      version: serverVersion(),
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
  app.get("/v1/pool", async (c) => json(c, await poolView(L)));
  app.get("/v1/tags/:tag", async (c) => {
    const wallet = await resolveTag(L, c.req.param("tag"));
    if (!wallet) throw new HttpError(404, "no one has that tag");
    return json(c, { tag: normTag(c.req.param("tag")), wallet });
  });

  const body = async <T>(c: Context): Promise<T> => {
    try {
      return (await c.req.json()) as T;
    } catch {
      throw new HttpError(400, "JSON body required");
    }
  };
  app.post("/v1/basket/quote", async (c) => {
    const b = await body<{ wallet?: string; legs: { mint: string; weightBps: number }[]; usd?: number; buy?: boolean; useHeld?: boolean }>(c);
    return json(c, await quoteBasket(L, b.wallet, b.legs, b.usd, { buy: b.buy, useHeld: b.useHeld }));
  });
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
  app.post("/v1/tx/transfer", async (c) => json(c, await planTransfer(L, await body(c))));
  app.post("/v1/tags/challenge", async (c) => json(c, await tagChallenge(L, await body(c))));
  app.post("/v1/tags/claim", async (c) => json(c, await tagClaim(L, await body(c))));
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

  // One keeper step per call, for hosts without an always-on process (a free
  // Render instance + a cron pinger). Ticks never overlap.
  let keeper: Keeper | null = null;
  let ticking: Promise<string[]> | null = null;
  app.post("/v1/keeper/tick", async (c) => {
    const secret = process.env.KEEPER_TICK_SECRET;
    if (!secret || !L.keeper) throw new HttpError(404, "keeper ticks are not enabled here");
    if (c.req.header("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "bad keeper secret");
    if (!keeper) {
      keeper = new Keeper(L, keeperOptionsFromEnv());
      keeper.onEvent = notifier(L);
    }
    if (ticking) return json(c, { ok: true, did: ["a tick is already running"] });
    ticking = keeper.tick().finally(() => {
      ticking = null;
      invalidateRound();
    });
    return json(c, { ok: true, did: await ticking });
  });

  return app;
}
