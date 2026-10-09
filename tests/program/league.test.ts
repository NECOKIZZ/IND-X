// The league program end to end on LiteSVM: entries, settlement checks,
// claims, basket returns and voids.

import { describe, expect, it, beforeAll } from "vitest";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { settleRound, teamKeyFromWeights, type ChainEntry, type Snapshot } from "@indx/core";
import { leagueFixture, openRound, send, SHARE, STAKE, USDC, type Fixture } from "../helpers/fixture";
import { submitSettlement } from "../../server/src/chain/settle";

const W3 = [5000, 3000, 2000];

async function enterCreator(f: Fixture, user: Keypair, roundId: bigint, mints: PublicKey[], weights: number[], shares: bigint[], name = "My ETF", fee = 100) {
  const key = teamKeyFromWeights(mints.map((m) => m.toBase58()), weights);
  const legs = mints.map((mint, i) => ({ mint, amount: shares[i], weightBps: weights[i] }));
  await send(f, [user], [await f.b.enterCreator(user.publicKey, roundId, key, legs, name, fee)]);
  return key;
}

async function players(f: Fixture, n: number) {
  const out: Keypair[] = [];
  for (let i = 0; i < n; i++) out.push(await f.player());
  return out;
}

const bal = (f: Fixture, ata: PublicKey) => f.reader.tokenBalance(ata);
const usdcOf = (f: Fixture, owner: PublicKey) => bal(f, getAssociatedTokenAddressSync(f.stakeMint, owner, true, TOKEN_PROGRAM_ID));
const shareOf = (f: Fixture, owner: PublicKey, mint: PublicKey) => bal(f, getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID));

/** Snapshots where every stock is $100 per whole token, then end prices per stock. */
function snaps(f: Fixture, endUsd: number[]) {
  const mk = (usd: number[]) =>
    new Map<string, Snapshot>(f.stocks.map((m, i) => [m.toBase58(), { token: m.toBase58(), value: BigInt(Math.round(usd[i] * 1e6)) * 10n ** 12n, decimals: 8, samples: 3 }]));
  return { start: mk(f.stocks.map(() => 100)), end: mk(endUsd) };
}

async function settleWithEngine(f: Fixture, roundId: bigint, endUsd: number[]) {
  const round = (await f.reader.round(roundId))!;
  const entries = await f.reader.entries(roundId);
  const chainEntries: ChainEntry[] = entries.map((e) => ({
    index: e.index,
    wallet: e.wallet.toBase58(),
    teamKey: e.teamKey,
    isCreator: e.isCreator,
    basket: e.isCreator ? { mints: e.basket.map((l) => l.mint.toBase58()), amounts: e.basket.map((l) => l.amount), weightsBps: e.basket.map((l) => l.weightBps) } : undefined,
  }));
  const cfg = (await f.reader.config())!;
  const { start, end } = snaps(f, endUsd);
  const s = settleRound({ roundId, stake: round.stake, capMultiple: round.capMultiple, maxBackers: round.maxBackers, seasonPot: cfg.seasonPot, entries: chainEntries, start, end, priceProblems: [], bonus: round.bonus });
  const table = await f.io.lookupTable(f.lookupTable);
  await submitSettlement(f.io, f.b, f.keeper, roundId, s, entries, { lookupTables: table ? [table] : [] });
  return s;
}

async function expectFail(p: Promise<unknown>, msg: RegExp) {
  await expect(p).rejects.toThrow(msg);
}

describe("league program", () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await leagueFixture();
  });

  it("initializes with the keeper, stake mint and registered tokens", async () => {
    const cfg = await f.reader.config();
    expect(cfg!.keeper.equals(f.keeper.publicKey)).toBe(true);
    expect(cfg!.stakeMint.equals(f.stakeMint)).toBe(true);
    const reg = await f.reader.registry();
    expect(reg).toHaveLength(f.stocks.length + 1);
    expect(reg.at(-1)!.isCrypto).toBe(true);
  });

  it("only the keeper or admin can open a round", async () => {
    const p = await f.player();
    const now = await f.io.now();
    await expectFail(send(f, [p], [await f.b.openRound(p.publicKey, 1n, now + 100, now + 200, STAKE, 100, 20)]), /NotKeeper|ConstraintRaw|0x/);
  });

  it("a creator locks a basket and a ticket; a clone and a backer join the team", async () => {
    const id = await openRound(f);
    const [a, clone, backer] = [await f.player(), await f.player(), await f.player()];
    const mints = f.stocks.slice(0, 3);
    const before = await usdcOf(f, a.publicKey);
    const key = await enterCreator(f, a, id, mints, W3, [5n * SHARE, 3n * SHARE, 2n * SHARE], "Big Tech");
    expect(await usdcOf(f, a.publicKey)).toBe(before - STAKE);
    expect(await shareOf(f, a.publicKey, mints[0])).toBe(995n * SHARE);
    expect(await bal(f, f.b.pdas.vault(mints[0], TOKEN_2022_PROGRAM_ID))).toBeGreaterThanOrEqual(5n * SHARE);

    const team = (await f.reader.team(id, key))!;
    expect(team.captain.equals(a.publicKey)).toBe(true);
    expect(team.name).toBe("Big Tech");
    expect(team.legs.map((l) => l.weightBps)).toEqual(W3);

    // Same tokens, same weights, double size: a clone.
    await enterCreator(f, clone, id, mints, W3, [10n * SHARE, 6n * SHARE, 4n * SHARE], "ignored");
    await send(f, [backer], [await f.b.enterBacker(backer.publicKey, id, key)]);
    const t2 = (await f.reader.team(id, key))!;
    expect(t2.members).toBe(2);
    expect(t2.name).toBe("Big Tech");
    const round = (await f.reader.round(id))!;
    expect(round.entryCount).toBe(3);
    expect(round.teamCount).toBe(1);
    expect(round.totalStakes).toBe(3n * STAKE);
    const entries = await f.reader.entries(id);
    expect(entries.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(entries[2].isCreator).toBe(false);

    // One entry per wallet per round.
    await expectFail(send(f, [backer], [await f.b.enterBacker(backer.publicKey, id, key)]), /already in use|0x0/);
  });

  it("rejects bad baskets", async () => {
    const id = await openRound(f);
    const p = await f.player();
    const m = f.stocks;
    // Two tokens.
    await expectFail(enterCreator(f, p, id, m.slice(0, 2), [5000, 5000], [SHARE, SHARE]), /BadBasket/);
    // Weights not summing to 10000.
    await expectFail(enterCreator(f, p, id, m.slice(0, 3), [5000, 3000, 1000], [SHARE, SHARE, SHARE]), /BadBasket/);
    // Duplicate token.
    await expectFail(enterCreator(f, p, id, [m[0], m[0], m[1]], W3, [SHARE, SHARE, SHARE]), /BadBasket/);
    // A token that isn't registered.
    const { createMint, mintTo } = await import("../../server/src/chain/setup");
    const rogue = await createMint(f.io, f.admin, 8, TOKEN_2022_PROGRAM_ID);
    await mintTo(f.io, f.admin, rogue, p.publicKey, 10n * SHARE, TOKEN_2022_PROGRAM_ID);
    await expectFail(enterCreator(f, p, id, [m[0], m[1], rogue], W3, [SHARE, SHARE, SHARE]), /TokenNotAllowed|AccountNotInitialized|0x/);
    // Name too long / fee too high.
    await expectFail(enterCreator(f, p, id, m.slice(0, 3), W3, [SHARE, SHARE, SHARE], "x".repeat(33)), /BadName/);
    await expectFail(enterCreator(f, p, id, m.slice(0, 3), W3, [SHARE, SHARE, SHARE], "ok", 201), /BadName/);
    // Backing a team that doesn't exist.
    await expectFail(send(f, [p], [await f.b.enterBacker(p.publicKey, id, "ab".repeat(32))]), /AccountNotInitialized|0xbc4|3012/);
  });

  it("a 10-token basket fits in one transaction with the lookup table", async () => {
    const g = await leagueFixture(10);
    const id = await openRound(g);
    const p = await g.player();
    const weights = Array(10).fill(1000);
    await enterCreator(g, p, id, g.stocks, weights, g.stocks.map(() => SHARE));
    expect((await g.reader.entries(id))[0].basket).toHaveLength(10);
  });

  it("closes entries at entry close and when paused", async () => {
    const id = await openRound(f);
    const p = await f.player();
    await send(f, [f.admin], [await f.b.adminSet(f.admin.publicKey, "paused", true)]);
    await expectFail(enterCreator(f, p, id, f.stocks.slice(0, 3), W3, [SHARE, SHARE, SHARE]), /Paused/);
    await send(f, [f.admin], [await f.b.adminSet(f.admin.publicKey, "paused", false)]);
    const r = (await f.reader.round(id))!;
    f.io.warpTo(r.entryClose);
    await expectFail(enterCreator(f, p, id, f.stocks.slice(0, 3), W3, [SHARE, SHARE, SHARE]), /EntriesClosed/);
  });

  it("settles a full round: winners paid, losers lose, baskets come back, money conserved", async () => {
    const g = await leagueFixture();
    const id = await openRound(g);
    const s = g.stocks;
    const ps = await players(g, 5);
    // Four disjoint-ish baskets of $10 each (stocks at $100): 0.05/0.03/0.02 shares.
    const amt = [5_000_000n, 3_000_000n, 2_000_000n];
    const keys = [
      await enterCreator(g, ps[0], id, [s[0], s[1], s[2]], W3, amt, "A"),
      await enterCreator(g, ps[1], id, [s[1], s[2], s[3]], W3, amt, "B"),
      await enterCreator(g, ps[2], id, [s[2], s[3], s[4]], W3, amt, "C"),
      await enterCreator(g, ps[3], id, [s[3], s[4], s[5]], W3, amt, "D"),
    ];
    await send(g, [ps[4]], [await g.b.enterBacker(ps[4].publicKey, id, keys[0])]);
    const vaultBefore = await bal(g, g.b.stakeVault());
    expect(vaultBefore).toBe(5n * STAKE);

    // Too early to settle.
    const r = (await g.reader.round(id))!;
    await expectFail(send(g, [g.keeper], [await g.b.settleBegin(g.keeper.publicKey, id, { totalPayout: 5n * STAKE, platformCut: 0n, seasonIn: 0n, seasonOut: 0n, inputsHash: "00".repeat(32) })]), /TooEarly/);
    g.io.warpTo(r.end);

    // Stock 0 up 10%, stock 5 down 10%.
    const st = await settleWithEngine(g, id, [110, 104, 102, 99, 97, 90]);
    expect(st.void).toBeNull();
    const round = (await g.reader.round(id))!;
    expect(round.status).toBe("settled");
    expect(round.inputsHash).toBe(st.inputsHash);
    expect(st.teams.map((t) => t.isWinner)).toEqual([true, true, false, false]);

    const usdcBefore = await Promise.all(ps.map((p) => usdcOf(g, p.publicKey)));
    for (const [i, p] of ps.entries()) {
      const ixs = [await g.b.claim(p.publicKey, id)];
      if (i < 4) ixs.push(await g.b.returnBasket(p.publicKey, p.publicKey, id, (await g.reader.entry(id, p.publicKey))!.basket.map((l) => l.mint)));
      await send(g, [p], ixs);
    }
    const got = await Promise.all(ps.map(async (p, i) => (await usdcOf(g, p.publicKey)) - usdcBefore[i]));
    expect(got).toEqual(st.payouts);
    expect(got[0] > STAKE && got[4] > STAKE).toBe(true);
    expect(got[2]).toBe(0n);
    // Baskets are back in full and entries are closed (rent back).
    expect(await shareOf(g, ps[0].publicKey, s[0])).toBe(1000n * SHARE);
    expect(await g.reader.entry(id, ps[0].publicKey)).toBeNull();
    // What's left in the vault is exactly the platform + season balances.
    const cfg = (await g.reader.config())!;
    expect(await bal(g, g.b.stakeVault())).toBe(cfg.platformBalance + cfg.seasonPot);
    expect(cfg.platformBalance + cfg.seasonPot).toBe(st.platformCut + st.seasonIn - st.seasonOut);
    // Claiming twice fails (the entry is gone).
    await expectFail(send(g, [ps[0]], [await g.b.claim(ps[0].publicKey, id)]), /AccountNotInitialized|3012|0xbc4/);

    // The admin withdraws the platform's share.
    const dest = getAssociatedTokenAddressSync(g.stakeMint, g.admin.publicKey, true, TOKEN_PROGRAM_ID);
    const { mintTo } = await import("../../server/src/chain/setup");
    await mintTo(g.io, g.admin, g.stakeMint, g.admin.publicKey, 0n);
    await send(g, [g.admin], [await g.b.withdrawPlatform(g.admin.publicKey, dest, cfg.platformBalance)]);
    expect(await bal(g, dest)).toBe(cfg.platformBalance);
  });

  it("enforces conservation, the payout ceiling and completeness", async () => {
    const g = await leagueFixture();
    const id = await openRound(g, { maxBackers: 1, cap: 2 });
    const ps = await players(g, 2);
    const key = await enterCreator(g, ps[0], id, g.stocks.slice(0, 3), W3, [SHARE, SHARE, SHARE]);
    await send(g, [ps[1]], [await g.b.enterBacker(ps[1].publicKey, id, key)]);
    g.io.warpTo((await g.reader.round(id))!.end);
    const k = g.keeper.publicKey;
    const H = "11".repeat(32);
    // Doesn't add up.
    await expectFail(send(g, [g.keeper], [await g.b.settleBegin(k, id, { totalPayout: 2n * STAKE + 1n, platformCut: 0n, seasonIn: 0n, seasonOut: 0n, inputsHash: H })]), /NotConserved/);
    // Draws on a season pot that doesn't exist.
    await expectFail(send(g, [g.keeper], [await g.b.settleBegin(k, id, { totalPayout: 3n * STAKE, platformCut: 0n, seasonIn: 0n, seasonOut: STAKE, inputsHash: H })]), /SeasonOverdrawn/);
    // A valid begin; then a payout above stake × (1 + cap × (1 + maxBackers)) = 5 × 5 = 25.
    await send(g, [g.keeper], [await g.b.settleBegin(k, id, { totalPayout: 2n * STAKE, platformCut: 0n, seasonIn: 0n, seasonOut: 0n, inputsHash: H })]);
    const es = await g.reader.entries(id);
    await expectFail(send(g, [g.keeper], [await g.b.settleWrite(k, id, [{ entry: es[0].address, payout: 5n * STAKE + 1n }])]), /PayoutTooLarge/);
    // Only one written: can't finish.
    await send(g, [g.keeper], [await g.b.settleWrite(k, id, [{ entry: es[0].address, payout: 2n * STAKE }])]);
    await expectFail(send(g, [g.keeper], [await g.b.settleFinish(k, id)]), /SettlementIncomplete/);
    // Both written but summing wrong: can't finish.
    await send(g, [g.keeper], [await g.b.settleWrite(k, id, [{ entry: es[1].address, payout: 1n }])]);
    await expectFail(send(g, [g.keeper], [await g.b.settleFinish(k, id)]), /NotConserved/);
    // Rewrite fixes it.
    await send(g, [g.keeper], [await g.b.settleWrite(k, id, [{ entry: es[0].address, payout: STAKE }, { entry: es[1].address, payout: STAKE }])]);
    // A non-keeper can't touch it.
    const rando = await g.player();
    await expectFail(send(g, [rando], [await g.b.settleFinish(rando.publicKey, id)]), /NotKeeper|ConstraintRaw/);
    // Restarting with new totals invalidates earlier writes.
    await send(g, [g.keeper], [await g.b.settleBegin(k, id, { totalPayout: 2n * STAKE, platformCut: 0n, seasonIn: 0n, seasonOut: 0n, inputsHash: H })]);
    await expectFail(send(g, [g.keeper], [await g.b.settleFinish(k, id)]), /SettlementIncomplete/);
    await send(g, [g.keeper], [await g.b.settleWrite(k, id, [{ entry: es[0].address, payout: STAKE }, { entry: es[1].address, payout: STAKE }])]);
    await send(g, [g.keeper], [await g.b.settleFinish(k, id)]);
    expect((await g.reader.round(id))!.status).toBe("settled");
  });

  it("voids: keeper any time, anyone after the grace period; stakes and baskets come back; a boost goes to the season pot", async () => {
    const g = await leagueFixture();
    const id = await openRound(g);
    const [p, q, sponsor] = [await g.player(), await g.player(), await g.player()];
    const key = await enterCreator(g, p, id, g.stocks.slice(0, 3), W3, [SHARE, SHARE, SHARE]);
    await send(g, [q], [await g.b.enterBacker(q.publicKey, id, key)]);
    await send(g, [sponsor], [await g.b.boostRound(sponsor.publicKey, id, 7n * USDC)]);
    expect((await g.reader.round(id))!.bonus).toBe(7n * USDC);

    const r = (await g.reader.round(id))!;
    g.io.warpTo(r.end + 60);
    // Anyone, before the grace period: too early.
    await expectFail(send(g, [q], [await g.b.voidRound(q.publicKey, id)]), /TooEarly/);
    g.io.warpTo(r.end + 3 * 86400);
    await send(g, [q], [await g.b.voidRound(q.publicKey, id)]);
    expect((await g.reader.round(id))!.status).toBe("voided");
    expect((await g.reader.config())!.seasonPot).toBe(7n * USDC);

    const before = await usdcOf(g, p.publicKey);
    const mints = g.stocks.slice(0, 3);
    // Return the basket first (anyone can), then claim: the entry closes on claim.
    await send(g, [q], [await g.b.returnBasket(q.publicKey, p.publicKey, id, mints)]);
    expect(await shareOf(g, p.publicKey, mints[1])).toBe(1000n * SHARE);
    expect(await g.reader.entry(id, p.publicKey)).not.toBeNull();
    await send(g, [p], [await g.b.claim(p.publicKey, id)]);
    expect(await usdcOf(g, p.publicKey)).toBe(before + STAKE);
    expect(await g.reader.entry(id, p.publicKey)).toBeNull();
  });

  it("a boost is added to the pot and conserved through settlement", async () => {
    const g = await leagueFixture();
    const id = await openRound(g);
    const s = g.stocks;
    const ps = await players(g, 4);
    const amt = [5_000_000n, 3_000_000n, 2_000_000n];
    for (let i = 0; i < 4; i++) await enterCreator(g, ps[i], id, [s[i], s[i + 1], s[i + 2]], W3, amt, `T${i}`);
    await send(g, [ps[0]], [await g.b.boostRound(ps[0].publicKey, id, 20n * USDC)]);
    g.io.warpTo((await g.reader.round(id))!.end);
    const st = await settleWithEngine(g, id, [120, 110, 100, 95, 90, 80]);
    expect(st.totalPayout + st.platformCut + st.seasonIn).toBe(4n * STAKE + 20n * USDC + st.seasonOut);
    expect((await g.reader.round(id))!.status).toBe("settled");
  });
});
