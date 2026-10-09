import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  fitBasket,
  normaliseWeights,
  recomputeFromInputs,
  settleRound,
  splitBuy,
  teamKeyFromWeights,
  toValue,
  type ChainEntry,
  type RoundInput,
  type Snapshot,
} from "@indx/core";

const STAKE = 5_000_000n;
const mints = Array.from({ length: 8 }, () => Keypair.generate().publicKey.toBase58());
const wallet = () => Keypair.generate().publicKey.toBase58();
const snap = (usd: number[]) => new Map<string, Snapshot>(mints.map((m, i) => [m, { token: m, value: toValue(usd[i] ?? 100), decimals: 8, samples: 3 }]));
const W3 = [5000, 3000, 2000];

/** A creator locking $10 at $100 a token. */
function creator(index: number, legs: number[], weights = W3): ChainEntry {
  const ms = legs.map((i) => mints[i]);
  return { index, wallet: wallet(), teamKey: teamKeyFromWeights(ms, weights), isCreator: true, basket: { mints: ms, amounts: weights.map((w) => BigInt(w) * 1000n), weightsBps: weights } };
}
const backer = (index: number, teamKey: string): ChainEntry => ({ index, wallet: wallet(), teamKey, isCreator: false });

function input(entries: ChainEntry[], end: number[]): RoundInput {
  return { roundId: 1n, stake: STAKE, capMultiple: 100, maxBackers: 20, seasonPot: 0n, entries, start: snap([]), end: snap(end), priceProblems: [] };
}

describe("team keys", () => {
  it("ignore leg order and merge weights to the nearest 1%", () => {
    const a = teamKeyFromWeights([mints[0], mints[1], mints[2]], [5000, 3000, 2000]);
    expect(teamKeyFromWeights([mints[2], mints[0], mints[1]], [2000, 5000, 3000])).toBe(a);
    expect(teamKeyFromWeights([mints[0], mints[1], mints[2]], [5020, 2990, 1990])).toBe(a);
    expect(teamKeyFromWeights([mints[0], mints[1], mints[2]], [5100, 2900, 2000])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("basket helpers", () => {
  it("normalise weights to exactly 10000 bps", () => {
    expect(normaliseWeights([1, 1, 1]).reduce((s, w) => s + w, 0)).toBe(10_000);
    expect(normaliseWeights([50, 30, 20])).toEqual([5000, 3000, 2000]);
  });
  it("split a buy by weight, dust to the largest leg", () => {
    const legs = splitBuy(mints.slice(0, 3), [3334, 3333, 3333], 10_000_001n);
    expect(legs.reduce((s, l) => s + l.amountIn, 0n)).toBe(10_000_001n);
  });
  it("fit the largest basket the balances allow, at the weights", () => {
    const f = fitBasket(
      [
        { raw: 10n * 10n ** 8n, decimals: 8, price: 100, weightBps: 5000 },
        { raw: 1n * 10n ** 8n, decimals: 8, price: 100, weightBps: 5000 },
      ],
    );
    expect(f.maxUsd).toBeCloseTo(200, 2); // the second leg caps it: $100 at 50%
    expect(f.usd).toBeCloseTo(200, 2);
    expect(fitBasket([{ raw: 10n * 10n ** 8n, decimals: 8, price: 100, weightBps: 10_000 }], 25).usd).toBeCloseTo(25, 2);
  });
});

describe("settleRound", () => {
  const entries = [creator(0, [0, 1, 2]), creator(1, [2, 3, 4]), creator(2, [4, 5, 6]), creator(3, [5, 6, 7])];
  entries.push(backer(4, entries[0].teamKey));
  const end = [120, 110, 105, 100, 98, 95, 90, 85];

  it("conserves the program's totals and pays the backer exactly its team's ticket payout", () => {
    const s = settleRound(input(entries, end));
    expect(s.void).toBeNull();
    expect(s.totalPayout + s.platformCut + s.seasonIn).toBe(5n * STAKE + s.seasonOut);
    const t0 = s.teams.find((t) => t.teamKey === entries[0].teamKey)!;
    expect(t0.isWinner).toBe(true);
    expect(s.payouts[4]).toBe(t0.ticketPayout);
  });

  it("recomputes byte for byte from the published inputs", () => {
    const s = settleRound({ ...input(entries, end), cryptoTokens: [mints[7]] });
    const again = recomputeFromInputs(JSON.parse(JSON.stringify(s.inputs)));
    expect(again.inputsHash).toBe(s.inputsHash);
    expect(again.payouts).toEqual(s.payouts);
  });

  it("refunds a basket whose weights drifted more than 5 points from the declared ones", () => {
    const drifted: ChainEntry = { ...creator(5, [0, 3, 7]), basket: { mints: [mints[0], mints[3], mints[7]], amounts: [4_000_000n, 3_000_000n, 3_000_000n], weightsBps: W3 } };
    const s = settleRound(input([...entries, drifted], end));
    expect(s.statuses[5]).toEqual({ kind: "refunded", reason: "weights-mismatch" });
    expect(s.payouts[5]).toBe(STAKE);
  });

  it("a price problem voids the round and refunds everyone", () => {
    const s = settleRound({ ...input(entries, end), priceProblems: [`${mints[0]}:not-trading`] });
    expect(s.void).toBe("PriceProblem");
    expect(s.payouts.every((p) => p === STAKE)).toBe(true);
  });

  it("requires entries indexed 0..n-1", () => {
    expect(() => settleRound(input([entries[0], { ...entries[1], index: 3 }], end))).toThrow(/indexed/);
  });
});
