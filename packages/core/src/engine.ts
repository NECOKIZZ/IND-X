// Settlement engine (shared with Median Markets / Kickoff Stocks).
//
// Weekly (or demo-length) rounds where on-chain stock baskets ("ETFs") are
// ranked by the % growth of their stocks. Teams above MEDIAN (the middle return)
// win the ticket stakes below it, split by team stake × accuracy. Rules: see
// docs/RULES.md.
//
//   - One ETF = one team. Captain = the creator; others are backers.
//   - MEDIAN (like the AVERAGE ghost team in FPL head-to-head leagues, but
//     honestly named): a ghost team whose return is
//     the median return of the round. Beat MEDIAN and you win, fall below it
//     and you lose, tie it and you draw: your ticket comes back, no gain, no
//     loss. In an odd round the middle team always draws; in an even round
//     nobody draws unless the two middle teams tie.
//     Equivalently: D = best return − return, k = n//2 + 1, m = k-th smallest
//     D; win if D < m. If at least half the teams tie at the top, those teams
//     win (coalition) and nobody draws.
//   - Accuracy a = (1 / (1 + D/m))^gamma (gamma = 6).
//   - Take = 10% of losing stakes: half platform, half season pot.
//   - Bonus: sponsor boosts (boost_round) and any ticket yield are added
//     to the pot.
//   - Thin pot: if the pot is below 5% of winning stakes, the season pot tops
//     it up to that floor (as far as the season pot allows).
//   - Pot split across winning teams by teamStake × a, water-filled under a
//     gain cap of capMultiple × teamStake. Anything left once every winner is
//     capped goes back to the season pot (top-up first), then to the losers
//     pro-rata.
//   - Inside a team: gain split by stake, then the captain takes
//     creatorFeeBps of each backer's gain.
//
// Conservation, always: Σ payouts + platform + seasonIn == Σ stakes + seasonOut + bonus.
// The platform cut is derived, so it absorbs all rounding dust.
//
// BigInt only, no floats. Amounts are in stake-token base units (any decimals);
// accuracy weights use the shared SCALE (1e6); returns use RET_SCALE (1e12).

import { SCALE, accuracyWeight } from "./fixed.js";

export { SCALE };

/** Fixed-point scale for basket returns: 1e12 = +100%. */
export const RET_SCALE = 1_000_000_000_000n;

export interface LeagueParams {
  gamma: number;           // accuracy exponent (6)
  takeRateBps: number;     // 1000 = 10% of losing stakes
  seasonShareBps: number;  // 5000 = half the take goes to the season pot
  capMultiple: bigint;     // 100n → max gain = 100× team stake
  creatorFeeBps: number;   // 1000 = captain takes 10% of backers' gains
  thinPotFloorBps: number; // 500 = pot topped up to 5% of winning stakes
  minTeams: number;        // 4 — fewer teams voids the round
}

export const DEFAULT_LEAGUE_PARAMS: LeagueParams = {
  gamma: 6,
  takeRateBps: 1000,
  seasonShareBps: 5000,
  capMultiple: 100n,
  creatorFeeBps: 1000,
  thinPotFloorBps: 500,
  minTeams: 4,
};

export interface LeagueEntry {
  stake: bigint;
  isCaptain: boolean;
}

export interface LeagueTeam {
  /** Basket return, RET_SCALE fixed point (signed). */
  ret: bigint;
  entries: LeagueEntry[];
}

export type LeagueVoidReason = "TooFewTeams" | "AllReturnsEqual";

export interface TeamOutcome {
  d: bigint;          // best return − this return (RET_SCALE)
  isWinner: boolean;
  isDraw: boolean;    // tied MEDIAN: ticket refunded
  a: bigint;          // accuracy, SCALE fixed point
  teamStake: bigint;
  weight: bigint;     // teamStake × a
  gain: bigint;       // team gain from the pot, before the in-team split
  capped: boolean;
}

export interface EntryOutcome {
  team: number;
  entry: number;
  stake: bigint;
  gain: bigint;       // after the creator fee (captain: includes fees received)
  creatorFee: bigint; // paid by this backer to the captain
  refund: bigint;     // losers: share of an unmatched pot; draws: the stake
  payout: bigint;
}

export interface LeagueResult {
  void: LeagueVoidReason | null;
  n: number;
  k: number;
  m: bigint;
  /** MEDIAN's return: the median team return (RET_SCALE, rounded toward zero). */
  median: bigint;
  coalitionMode: boolean;
  totalStakes: bigint;
  losingStakes: bigint;
  winningStakes: bigint;
  take: bigint;
  pot: bigint;            // dividend pot after take, top-up and bonus
  bonus: bigint;          // boosts added to the pot (a void sends them to the season pot)
  seasonIn: bigint;       // season pot share of the take
  seasonOut: bigint;      // thin-pot top-up drawn from the season pot
  platformCut: bigint;    // derived: absorbs all dust
  refundedToLosers: bigint;
  teams: TeamOutcome[];
  entries: EntryOutcome[];
}

const cmp = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);
const sum = (xs: bigint[]): bigint => xs.reduce((s, x) => s + x, 0n);

/**
 * Settle one round. `seasonBalance` is the season pot available before this
 * round, used only for the thin-pot top-up. `bonus` is the round's boost
 * (added to the pot; a void sends it to the season pot).
 */
export function settleLeague(
  teams: LeagueTeam[],
  params: LeagueParams = DEFAULT_LEAGUE_PARAMS,
  seasonBalance = 0n,
  bonus = 0n,
): LeagueResult {
  const n = teams.length;
  const teamStakes = teams.map((t) => sum(t.entries.map((e) => e.stake)));
  const totalStakes = sum(teamStakes);

  const entryList = (): EntryOutcome[] =>
    teams.flatMap((t, ti) =>
      t.entries.map((e, ei) => ({ team: ti, entry: ei, stake: e.stake, gain: 0n, creatorFee: 0n, refund: 0n, payout: 0n })),
    );

  const best = teams.reduce((b, t) => (t.ret > b ? t.ret : b), n ? teams[0].ret : 0n);
  const ds = teams.map((t) => best - t.ret);

  const base: LeagueResult = {
    void: null,
    n,
    k: 0,
    m: 0n,
    median: 0n,
    coalitionMode: false,
    totalStakes,
    losingStakes: 0n,
    winningStakes: 0n,
    take: 0n,
    pot: 0n,
    bonus,
    seasonIn: 0n,
    seasonOut: 0n,
    platformCut: 0n,
    refundedToLosers: 0n,
    teams: teams.map((_, i) => ({ d: ds[i], isWinner: false, isDraw: false, a: 0n, teamStake: teamStakes[i], weight: 0n, gain: 0n, capped: false })),
    entries: [],
  };

  // 1. Void: refund everyone, no take; any ticket yield goes to the season pot.
  const voidWith = (reason: LeagueVoidReason): LeagueResult => ({
    ...base,
    void: reason,
    seasonIn: bonus,
    entries: entryList().map((e) => ({ ...e, payout: e.stake })),
  });
  if (n < params.minTeams) return voidWith("TooFewTeams");
  if (ds.every((d) => d === 0n)) return voidWith("AllReturnsEqual");

  // 2. Gate. min D is always 0 (the best team).
  const sorted = [...ds].sort(cmp);
  const countAtBest = ds.filter((d) => d === 0n).length;
  const coalitionMode = countAtBest * 2 >= n;
  const k = Math.floor(n / 2) + 1;
  const m = sorted[k - 1]; // > 0 whenever not in coalition mode

  // MEDIAN = the median return. In doubled units, so an even round's
  // half-way median stays exact: 2·median = best·2 − (D_lo + D_hi).
  const medianTwiceD = n % 2 === 1 ? 2n * m : sorted[k - 2] + m;
  const median = (2n * best - medianTwiceD) / 2n;

  const out = base.teams;
  out.forEach((t, i) => {
    t.isWinner = coalitionMode ? ds[i] === 0n : ds[i] < m;
    t.isDraw = !coalitionMode && 2n * ds[i] === medianTwiceD;
    if (!t.isWinner) return;
    t.a = coalitionMode ? SCALE : accuracyWeight((ds[i] * SCALE) / m, params.gamma);
    t.weight = (t.teamStake * t.a) / SCALE;
  });

  // 3. Pot: take, season share, thin-pot top-up. Draws are neither.
  const losingStakes = sum(out.filter((t) => !t.isWinner && !t.isDraw).map((t) => t.teamStake));
  const drawStakes = sum(out.filter((t) => t.isDraw).map((t) => t.teamStake));
  const winningStakes = totalStakes - losingStakes - drawStakes;
  const take = (losingStakes * BigInt(params.takeRateBps)) / 10_000n;
  const seasonIn = (take * BigInt(params.seasonShareBps)) / 10_000n;
  let pot = losingStakes - take + bonus;

  let seasonOut = 0n;
  const floor = (winningStakes * BigInt(params.thinPotFloorBps)) / 10_000n;
  if (pot < floor) {
    const available = seasonBalance + seasonIn;
    seasonOut = floor - pot < available ? floor - pot : available;
    pot += seasonOut;
  }

  // 4. Water-fill the pot over weight = teamStake × a, under the gain cap.
  const winners = out.map((t, i) => (t.isWinner ? i : -1)).filter((i) => i >= 0);
  let remaining = pot;
  for (;;) {
    const open = winners.filter((i) => !out[i].capped);
    const sumW = sum(open.map((i) => out[i].weight));
    if (open.length === 0 || sumW === 0n) break;
    let newlyCapped = false;
    for (const i of open) {
      const cap = out[i].teamStake * params.capMultiple;
      if ((remaining * out[i].weight) / sumW > cap) {
        out[i].gain = cap;
        out[i].capped = true;
        remaining -= cap;
        newlyCapped = true;
      }
    }
    if (!newlyCapped) {
      for (const i of open) out[i].gain = (remaining * out[i].weight) / sumW;
      remaining = 0n; // floor dust goes to the platform cut
      break;
    }
  }

  // 5. Unmatched pot (every winner capped): return the top-up first, then
  //    refund losers pro-rata to stake.
  const entries = entryList();
  let refundedToLosers = 0n;
  if (remaining > 0n) {
    const giveBack = remaining < seasonOut ? remaining : seasonOut;
    seasonOut -= giveBack;
    remaining -= giveBack;
    if (remaining > 0n && losingStakes > 0n) {
      for (const e of entries) {
        if (out[e.team].isWinner || out[e.team].isDraw) continue;
        e.refund = (remaining * e.stake) / losingStakes;
        refundedToLosers += e.refund;
      }
    }
  }
  pot = pot - remaining + refundedToLosers; // what actually left the pot

  // 6. In-team split by stake, then the creator fee on backers' gains.
  const byTeam: EntryOutcome[][] = teams.map(() => []);
  for (const e of entries) byTeam[e.team].push(e);
  for (const ti of winners) {
    const t = out[ti];
    const members = byTeam[ti];
    for (const e of members) e.gain = (t.gain * e.stake) / t.teamStake;
    const captain = members.find((e) => teams[ti].entries[e.entry].isCaptain);
    if (!captain) continue;
    for (const e of members) {
      if (e === captain) continue;
      const fee = (e.gain * BigInt(params.creatorFeeBps)) / 10_000n;
      e.gain -= fee;
      e.creatorFee = fee;
      captain.gain += fee;
    }
  }

  for (const e of entries) {
    if (out[e.team].isDraw) e.refund = e.stake;
    e.payout = out[e.team].isWinner ? e.stake + e.gain : e.refund;
  }

  const paid = sum(entries.map((e) => e.payout));
  const platformCut = totalStakes + seasonOut + bonus - paid - seasonIn;

  return {
    ...base,
    k,
    m,
    median,
    coalitionMode,
    losingStakes,
    winningStakes,
    take,
    pot,
    seasonIn,
    seasonOut,
    platformCut,
    refundedToLosers,
    entries,
  };
}

/** Σ payouts + platform + seasonIn == Σ stakes + seasonOut + bonus. */
export function leagueConserves(r: LeagueResult): boolean {
  const paid = sum(r.entries.map((e) => e.payout));
  return paid + r.platformCut + r.seasonIn === r.totalStakes + r.seasonOut + r.bonus && r.platformCut >= 0n;
}

// ---------------------------------------------------------------------------
// Basket maths
// ---------------------------------------------------------------------------

/**
 * Buy-and-hold return of a basket of fixed token quantities, RET_SCALE fixed
 * point. Quantities and prices may use any (consistent) units: value is
 * Σ qty × price. Returns 0 for an empty or zero-value basket.
 */
export function basketReturn(qty: bigint[], startPrices: bigint[], endPrices: bigint[]): bigint {
  if (qty.length !== startPrices.length || qty.length !== endPrices.length) {
    throw new Error("basketReturn: length mismatch");
  }
  const v0 = sum(qty.map((q, i) => q * startPrices[i]));
  if (v0 === 0n) return 0n;
  const v1 = sum(qty.map((q, i) => q * endPrices[i]));
  return ((v1 - v0) * RET_SCALE) / v0;
}

/** Value weights in basis points (sum ≤ 10 000; the remainder goes to the largest). */
export function basketWeightsBps(values: bigint[]): number[] {
  const total = sum(values);
  if (total === 0n) return values.map(() => 0);
  const w = values.map((v) => Number((v * 10_000n) / total));
  const slack = 10_000 - w.reduce((s, x) => s + x, 0);
  const iMax = w.indexOf(Math.max(...w));
  w[iMax] += slack;
  return w;
}

export interface EligibilityRules {
  minTokens: number;     // 3 — at least this many non-crypto tokens (stocks / funds)
  maxWeightBps: number;  // 5000 — no token above 50%
  minValue: bigint;      // $10 in the value units used
  /** Crypto slice: tokens in this list count as crypto (lowercase addresses). */
  cryptoTokens?: string[];
  /** Max combined weight of crypto tokens, bps (2000 = 20%). Absent = no cap. */
  maxCryptoBps?: number;
}

export type IneligibleReason = "TooFewTokens" | "TooConcentrated" | "TooSmall" | "DuplicateToken" | "TooMuchCrypto";

/** Check a creator's basket (token ids + current values) against the rules. */
export function basketEligibility(tokens: string[], values: bigint[], rules: EligibilityRules): IneligibleReason | null {
  if (new Set(tokens.map((t) => t.toLowerCase())).size !== tokens.length) return "DuplicateToken";
  const crypto = new Set((rules.cryptoTokens ?? []).map((t) => t.toLowerCase()));
  const isCrypto = tokens.map((t) => crypto.has(t.toLowerCase()));
  const stocks = values.filter((v, i) => v > 0n && !isCrypto[i]).length;
  if (stocks < rules.minTokens) return "TooFewTokens";
  if (sum(values) < rules.minValue) return "TooSmall";
  const weights = basketWeightsBps(values);
  if (weights.some((w) => w > rules.maxWeightBps)) return "TooConcentrated";
  if (rules.maxCryptoBps !== undefined && weights.reduce((s, w, i) => s + (isCrypto[i] ? w : 0), 0) > rules.maxCryptoBps) return "TooMuchCrypto";
  return null;
}
