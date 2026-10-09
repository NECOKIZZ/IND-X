// The whole backend on LiteSVM: the keeper runs rounds by itself while
// players use the HTTP API exactly as the app does (faucet, buy at the test
// desk, create, back, follow standings), then get paid automatically.

import { describe, expect, it, beforeAll } from "vitest";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import type { RoundView, TxPlan, WalletView, EtfView } from "@indx/core";
import { LiteIO } from "../../server/src/chain/liteio";
import { DEFAULT_PROGRAM_ID } from "../../server/src/chain/program";
import { bootstrapTestDeployment, makeLeague, type League } from "../../server/src/league";
import { MemoryKV, Store } from "../../server/src/store";
import { Keeper, type KeeperOptions } from "../../server/src/keeper/keeper";
import { createApp } from "../../server/src/api/app";
import { notifier, setPushSender, type PushMessage } from "../../server/src/push";
import { clearLiveCache } from "../../server/src/api/live";
import { invalidateRound, resetChainClock } from "../../server/src/api/views";

process.env.LEAGUE_PRICE_SOURCE = "demo";

const MIN = 60_000;

describe("backend end to end", () => {
  let L: League;
  let io: LiteIO;
  let app: ReturnType<typeof createApp>;
  let keeper: Keeper;
  let now: number;
  const pushed: PushMessage[] = [];

  const setTime = (ms: number) => {
    now = ms;
    io.warpTo(Math.floor(ms / 1000));
    resetChainClock();
    invalidateRound();
    clearLiveCache();
  };
  const api = async <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const res = await app.request(path, init?.body ? { method: init.method ?? "POST", body: JSON.stringify(init.body), headers: { "content-type": "application/json" } } : { method: init?.method ?? "GET" });
    const json = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(json as { error: string }).error}`);
    return json as T;
  };
  /** Sign every transaction of a plan with the player's key and relay it. */
  const signAndSend = async (plan: TxPlan, kp: Keypair) => {
    for (const b64 of plan.transactions) {
      const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
      tx.sign([kp]);
      await api("/v1/tx/send", { body: { tx: Buffer.from(tx.serialize()).toString("base64") } });
    }
  };

  beforeAll(async () => {
    io = LiteIO.withProgram(DEFAULT_PROGRAM_ID, "target/deploy/league.so");
    const admin = Keypair.generate();
    const keeperKp = Keypair.generate();
    io.airdrop(admin.publicKey, 1000);
    io.airdrop(keeperKp.publicKey, 1000);
    now = Date.UTC(2027, 0, 4, 12, 0); // a Monday
    io.warpTo(Math.floor(now / 1000));
    const d = await bootstrapTestDeployment(io, "lite", DEFAULT_PROGRAM_ID, admin, keeperKp.publicKey, ["AAPLx", "MSFTx", "NVDAx", "TSLAx", "AMZNx", "METAx", "SPYx", "cbBTC"]);
    io.warpSlots(2);
    L = makeLeague("lite", d, io, new Store(new MemoryKV()), keeperKp, admin);
    app = createApp(L);
    const opts: KeeperOptions = {
      schedule: "demo:10:30",
      samples: 2,
      everyMs: MIN,
      windowMs: 10 * MIN,
      trackMs: 5 * MIN,
      stake: 5_000_000n,
      capMultiple: 100,
      maxBackers: 20,
      source: "demo",
      autoOpen: true,
    };
    keeper = new Keeper(L, opts, () => {});
    keeper.clock = () => now;
    setPushSender(async (m) => {
      pushed.push(...m);
    });
    keeper.onEvent = notifier(L);
  });

  it("runs a round from open to paid out", async () => {
    // Someone registered for notifications before the round opened.
    const fan = Keypair.generate();
    await api("/v1/push", { body: { wallet: fan.publicKey.toBase58(), token: "ExponentPushToken[fan]" } });

    expect(await keeper.tick()).toContain("opened round 1");
    expect(pushed.some((m) => m.title === "Round 1 is open")).toBe(true);
    const cfg = await api<{ cluster: string; faucet: boolean }>("/v1/config");
    expect(cfg.faucet).toBe(true);
    const assets = await api<{ symbol: string; mint: string; price: number }[]>("/v1/assets");
    expect(assets.every((a) => a.price > 0)).toBe(true);
    const mint = (sym: string) => assets.find((a) => a.symbol === sym)!.mint;

    // Five players: faucet, buy a basket at the test desk, then create or back.
    const players = Array.from({ length: 6 }, () => Keypair.generate());
    for (const p of players) {
      await api("/v1/faucet", { body: { wallet: p.publicKey.toBase58() } });
      await api("/v1/push", { body: { wallet: p.publicKey.toBase58(), token: `ExponentPushToken[${p.publicKey.toBase58().slice(0, 6)}]` } });
    }
    const W3 = [5000, 3000, 2000];
    const baskets: [string[], number[]][] = [
      [["AAPLx", "MSFTx", "NVDAx"], W3],
      [["TSLAx", "AMZNx", "METAx"], W3],
      [["SPYx", "AAPLx", "AMZNx"], W3],
      [["NVDAx", "TSLAx", "METAx", "cbBTC"], [4000, 3000, 1500, 1500]], // crypto ≤ 20%
      [["METAx", "MSFTx", "SPYx"], W3],
    ];
    const keys: string[] = [];
    for (const [i, [syms, weights]] of baskets.entries()) {
      const legs = syms.map((s, j) => ({ mint: mint(s), weightBps: weights[j] }));
      await signAndSend(await api<TxPlan>("/v1/tx/buy", { body: { wallet: players[i].publicKey.toBase58(), legs, usd: 25 } }), players[i]);
      const plan = await api<TxPlan>("/v1/tx/create", { body: { wallet: players[i].publicKey.toBase58(), legs, usd: 20, name: `ETF ${i}`, buyFeeBps: 150 } });
      expect(plan.meta!.clone).toBe(false);
      await signAndSend(plan, players[i]);
      keys.push(plan.meta!.teamKey as string);
    }
    // The sixth backs ETF 0, after buying it (the creator earns 1.5%).
    const creatorBefore = (await api<WalletView>(`/v1/wallets/${players[0].publicKey.toBase58()}`)).usdc.uiAmount;
    await signAndSend(await api<TxPlan>("/v1/tx/buy", { body: { wallet: players[5].publicKey.toBase58(), roundId: "1", etfKey: keys[0], usd: 10 } }), players[5]);
    expect((await api<WalletView>(`/v1/wallets/${players[0].publicKey.toBase58()}`)).usdc.uiAmount).toBeCloseTo(creatorBefore + 0.15, 6);
    await signAndSend(await api<TxPlan>("/v1/tx/back", { body: { wallet: players[5].publicKey.toBase58(), etfKey: keys[0] } }), players[5]);

    // Double entry is refused before anyone signs.
    await expect(api("/v1/tx/back", { body: { wallet: players[5].publicKey.toBase58(), etfKey: keys[1] } })).rejects.toThrow(/already in this round/);

    let round = await api<RoundView>("/v1/rounds/current");
    expect(round.phase).toBe("open");
    expect(round.players).toBe(6);
    expect(round.etfCount).toBe(5);
    expect(round.pricing).toBe("preview");
    expect(round.etfs.find((e) => e.key === keys[0])!.tickets).toBe(2);
    const activity = await api<{ kind: string }[]>("/v1/rounds/1/activity");
    expect(activity[0].kind).toBe("backed");

    // Entries close: two start samples a minute apart.
    const r1 = (await L.reader.round(1n))!;
    setTime(r1.entryClose * 1000 + 1000);
    expect(await keeper.tick()).toContain("start sample round 1");
    expect(pushed.some((m) => m.title === "Round 1 is live")).toBe(true);
    setTime(now + MIN);
    expect(await keeper.tick()).toContain("start sample round 1");
    await expect(api("/v1/tx/back", { body: { wallet: Keypair.generate().publicKey.toBase58(), etfKey: keys[0] } })).rejects.toThrow(/not taking entries/);

    // Mid-round: live standings against MEDIAN, and a chart.
    setTime(now + 10 * MIN);
    await keeper.tick();
    round = await api<RoundView>("/v1/rounds/current");
    expect(round.phase).toBe("live");
    expect(round.pricing).toBe("live");
    expect(round.medianPct).not.toBeNull();
    expect(round.etfs.filter((e) => e.standing === "above").length).toBeGreaterThan(0);
    const etf = await api<EtfView>(`/v1/rounds/1/etfs/${keys[0]}`);
    expect(etf.memberList).toHaveLength(2);
    expect(etf.chart.length).toBeGreaterThanOrEqual(2);
    expect(etf.legs.map((l) => l.symbol)).toEqual(["AAPLx", "MSFTx", "NVDAx"]);

    // The round ends: end samples, settlement, automatic payout.
    setTime(r1.end * 1000 + 1000);
    await keeper.tick();
    setTime(now + MIN);
    const did = await keeper.tick();
    expect(did).toContain("settled round 1");
    const settled = (await L.reader.round(1n))!;
    expect(settled.status).toBe("settled");
    // Everyone was paid and got their basket back: no entries left open.
    expect(await L.reader.entries(1n)).toHaveLength(0);

    round = await api<RoundView>("/v1/rounds/1");
    expect(round.phase).toBe("settled");
    expect(round.pricing).toBe("final");
    const winners = round.etfs.filter((e) => e.standing === "above");
    expect(winners.length).toBe(2); // 5 teams: top 2 win, the middle draws
    expect(round.etfs.filter((e) => e.standing === "draw")).toHaveLength(1);

    // Anyone can check the keeper's work.
    const v = await api<{ matches: boolean }>("/v1/rounds/1/verify");
    expect(v.matches).toBe(true);

    // Wallets show results; winners got more than their ticket back.
    const w = await api<WalletView>(`/v1/wallets/${players[5].publicKey.toBase58()}`);
    const e = w.entries.find((x) => x.roundId === "1")!;
    expect(e.paid).toBe(true);
    expect(["won", "draw", "lost"]).toContain(e.state);
    const winnerWallet = winners[0].captain;
    const ww = await api<WalletView>(`/v1/wallets/${winnerWallet}`);
    expect(ww.entries[0].state).toBe("won");
    expect(ww.entries[0].payoutUsd!).toBeGreaterThan(5);
    expect(ww.stats.wins).toBe(1);
    expect(pushed.some((m) => m.title.startsWith("You beat MEDIAN"))).toBe(true);

    const lb = await api<{ wallet: string; netUsd: number }[]>("/v1/leaderboard");
    expect(lb[0].netUsd).toBeGreaterThan(0);
    const hist = await api<{ id: string; top: unknown[] }[]>("/v1/rounds");
    expect(hist[0].top.length).toBe(3);

    // And the next round opens by itself.
    expect(await keeper.tick()).toContain("opened round 2");
  });

  it("a round with too few ETFs settles as a void and refunds", async () => {
    const cfg = await L.reader.config();
    const id = cfg!.roundCount;
    const p = Keypair.generate();
    await api("/v1/faucet", { body: { wallet: p.publicKey.toBase58() } });
    const assets = await api<{ symbol: string; mint: string }[]>("/v1/assets");
    const legs = ["AAPLx", "MSFTx", "NVDAx"].map((s, j) => ({ mint: assets.find((a) => a.symbol === s)!.mint, weightBps: [4000, 3000, 3000][j] }));
    await signAndSend(await api<TxPlan>("/v1/tx/buy", { body: { wallet: p.publicKey.toBase58(), legs, usd: 15 } }), p);
    await signAndSend(await api<TxPlan>("/v1/tx/create", { body: { wallet: p.publicKey.toBase58(), legs, name: "Solo" } }), p);
    const before = (await api<WalletView>(`/v1/wallets/${p.publicKey.toBase58()}`)).usdc.uiAmount;
    const r = (await L.reader.round(id))!;
    setTime(r.entryClose * 1000 + 1000);
    await keeper.tick();
    setTime(now + MIN);
    await keeper.tick();
    setTime(r.end * 1000 + 1000);
    await keeper.tick();
    setTime(now + MIN);
    expect(await keeper.tick()).toContain(`settled round ${id}`);
    const round = await api<RoundView>(`/v1/rounds/${id}`);
    expect(round.voidReason).toBe("TooFewTeams");
    const after = await api<WalletView>(`/v1/wallets/${p.publicKey.toBase58()}`);
    expect(after.usdc.uiAmount).toBeCloseTo(before + 5, 6);
    expect(after.entries[0].state).toBe("voided");
    expect(after.assets.find((a) => a.symbol === "AAPLx")!.raw).not.toBe("0");
  });
});

