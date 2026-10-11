// Round settlement: on-chain entries + price snapshots → one payout per
// entry for settle_write, plus the published inputs anyone can recompute.
//
//   1. Check every creator's locked basket at the START prices: eligible
//      (≥ 3 stocks/funds, ≤ 50% each, ≥ $10, crypto ≤ 20%, checked by the app
//      at entry; at settlement prices may have drifted, so ≤ 55%, ≥ $9.50,
//      crypto ≤ 25%), its team key matches its declared weights, and the
//      start-price weights are within 5 points of the declared ones.
//      An invalid entry is refunded its stake.
//   2. Teams = valid creators grouped by team key, in entry order. The first
//      valid creator is the captain; the team's return is the captain's basket
//      return (clones have the same weights to 1%, so the same return).
//   3. Backers count only if their team has a valid captain.
//   4. Run the engine. A void round refunds everyone.
//
// Conservation holds for the program's totals: refunds pay back exactly what
// they put in, and the engine conserves the rest.

import { sha256 } from "@noble/hashes/sha2.js";
import {
  DEFAULT_LEAGUE_PARAMS,
  basketEligibility,
  basketReturn,
  basketWeightsBps,
  settleLeague,
  type EligibilityRules,
  type LeagueParams,
  type LeagueTeam,
  type LeagueVoidReason,
} from "./engine.js";
import { bytesToHex, teamKeyFromWeights } from "./basket.js";
import { valueOf, type Snapshot } from "./snapshot.js";

export interface ChainEntry {
  index: number;
  wallet: string;
  teamKey: string; // hex
  isCreator: boolean;
  claimed?: boolean;
  payout?: bigint;
  basket?: { mints: string[]; amounts: bigint[]; weightsBps: number[] };
}

export interface RoundInput {
  roundId: bigint;
  stake: bigint;
  capMultiple: number;
  maxBackers: number;
  seasonPot: bigint;
  entries: ChainEntry[];
  start: Map<string, Snapshot>;
  end: Map<string, Snapshot>;
  /** Tokens whose snapshot failed (missing / not trading): voids the round. */
  priceProblems: string[];
  /** Boosts added to the pot (stake-token units). */
  bonus?: bigint;
  /** The crypto slice's mints (recorded in the published rules). */
  cryptoTokens?: string[];
}

const USD = 10n ** 18n;

/** Rules a basket must meet at entry (the app and agents enforce these). */
export const DEFAULT_RULES: EligibilityRules = { minTokens: 3, maxWeightBps: 5000, minValue: 10n * USD, maxCryptoBps: 2000 };

/** How far prices may move a basket between entry and round start. */
export const DRIFT_BPS = 500;

/** The same rules at settlement, loosened by the drift allowance. */
export const SETTLE_RULES: EligibilityRules = {
  minTokens: DEFAULT_RULES.minTokens,
  maxWeightBps: DEFAULT_RULES.maxWeightBps + DRIFT_BPS,
  minValue: (DEFAULT_RULES.minValue * BigInt(10_000 - DRIFT_BPS)) / 10_000n,
  maxCryptoBps: DEFAULT_RULES.maxCryptoBps! + DRIFT_BPS,
};

export type RefundReason = "ineligible-basket" | "team-key-mismatch" | "weights-mismatch" | "no-valid-team" | "missing-price";
export type EntryStatus = { kind: "playing"; team: string; captain: boolean } | { kind: "refunded"; reason: RefundReason };

export interface SettledTeam {
  teamKey: string;
  captain: string;
  ret: bigint;
  members: number;
  isWinner: boolean;
  /** What one backer ticket on this team pays (after the creator fee). */
  ticketPayout: bigint;
}

export interface Settlement {
  void: LeagueVoidReason | "PriceProblem" | null;
  payouts: bigint[]; // one per entry, by entry index
  totalPayout: bigint;
  platformCut: bigint;
  seasonIn: bigint;
  seasonOut: bigint;
  statuses: EntryStatus[];
  teams: SettledTeam[];
  /** MEDIAN's return (the median team return), when the round was scored. */
  median: bigint | null;
  inputs: Record<string, unknown>;
  inputsHash: string; // hex
}

export function settleRound(
  input: RoundInput,
  params: LeagueParams = { ...DEFAULT_LEAGUE_PARAMS, capMultiple: BigInt(input.capMultiple) },
  baseRules: EligibilityRules = SETTLE_RULES,
): Settlement {
  const crypto = input.cryptoTokens ?? baseRules.cryptoTokens;
  const rules: EligibilityRules = crypto ? { ...baseRules, cryptoTokens: crypto } : baseRules;
  const entries = [...input.entries].sort((a, b) => a.index - b.index);
  entries.forEach((e, i) => {
    if (e.index !== i) throw new Error(`entries must be indexed 0..n-1 (missing ${i})`);
  });
  const n = entries.length;
  const statuses: EntryStatus[] = new Array(n);
  let median: bigint | null = null;
  const bonus = input.bonus ?? 0n;

  // 1. Validate creators.
  const teamOrder: string[] = [];
  const teams = new Map<string, { captain: ChainEntry; ret: bigint; members: ChainEntry[] }>();
  let anyMissingPrice = false;
  for (const e of entries) {
    if (!e.isCreator) continue;
    const b = e.basket;
    if (!b || b.mints.length === 0) {
      statuses[e.index] = { kind: "refunded", reason: "ineligible-basket" };
      continue;
    }
    const startP = b.mints.map((t) => input.start.get(t));
    const endP = b.mints.map((t) => input.end.get(t));
    if (startP.some((p) => !p) || endP.some((p) => !p)) {
      statuses[e.index] = { kind: "refunded", reason: "missing-price" };
      anyMissingPrice = true;
      continue;
    }
    const values = b.amounts.map((a, i) => valueOf(a, startP[i]!));
    if (basketEligibility(b.mints, values, rules) !== null) {
      statuses[e.index] = { kind: "refunded", reason: "ineligible-basket" };
      continue;
    }
    if (teamKeyFromWeights(b.mints, b.weightsBps) !== e.teamKey.toLowerCase()) {
      statuses[e.index] = { kind: "refunded", reason: "team-key-mismatch" };
      continue;
    }
    const measured = basketWeightsBps(values);
    if (measured.some((w, i) => Math.abs(w - b.weightsBps[i]) > DRIFT_BPS)) {
      statuses[e.index] = { kind: "refunded", reason: "weights-mismatch" };
      continue;
    }
    const key = e.teamKey.toLowerCase();
    const team = teams.get(key);
    if (team) {
      team.members.push(e);
      statuses[e.index] = { kind: "playing", team: key, captain: false };
    } else {
      // Return in common units: value per base unit, so decimals cancel out.
      const ret = basketReturn(
        b.amounts,
        startP.map((p) => p!.value * 10n ** BigInt(18 - p!.decimals)),
        endP.map((p) => p!.value * 10n ** BigInt(18 - p!.decimals)),
      );
      teams.set(key, { captain: e, ret, members: [e] });
      teamOrder.push(key);
      statuses[e.index] = { kind: "playing", team: key, captain: true };
    }
  }

  // A scored token without a price voids the whole round (stale / paused / missing).
  if (input.priceProblems.length > 0 || anyMissingPrice) return finish("PriceProblem", entries.map(() => input.stake), 0n, bonus, 0n, []);

  // 2. Backers.
  for (const e of entries) {
    if (e.isCreator) continue;
    const key = e.teamKey.toLowerCase();
    const team = teams.get(key);
    if (!team) {
      statuses[e.index] = { kind: "refunded", reason: "no-valid-team" };
      continue;
    }
    team.members.push(e);
    statuses[e.index] = { kind: "playing", team: key, captain: false };
  }

  // 3. Engine, members in entry order.
  const engineTeams: LeagueTeam[] = [];
  const memberIndex: number[][] = [];
  for (const key of teamOrder) {
    const t = teams.get(key)!;
    const members = [...t.members].sort((a, b) => a.index - b.index);
    engineTeams.push({ ret: t.ret, entries: members.map((m) => ({ stake: input.stake, isCaptain: m === t.captain })) });
    memberIndex.push(members.map((m) => m.index));
  }
  const r = settleLeague(engineTeams, params, input.seasonPot, bonus);
  const payouts = entries.map(() => input.stake); // refunds by default
  const ticketPayout = (i: number): bigint => {
    const t = r.teams[i];
    if (r.void) return input.stake;
    if (t.isWinner) {
      // Same rounding as the engine's in-team split and creator fee.
      const g = (t.gain * input.stake) / t.teamStake;
      return input.stake + g - (g * BigInt(params.creatorFeeBps)) / 10_000n;
    }
    return r.losingStakes > 0n ? (r.refundedToLosers * input.stake) / r.losingStakes : 0n;
  };
  const summary = (scored: boolean): SettledTeam[] =>
    teamOrder.map((key, i) => {
      const t = teams.get(key)!;
      return {
        teamKey: key,
        captain: t.captain.wallet,
        ret: t.ret,
        members: memberIndex[i].length,
        isWinner: scored && r.teams[i].isWinner,
        ticketPayout: ticketPayout(i),
      };
    });
  if (r.void) return finish(r.void, payouts, 0n, bonus, 0n, summary(false));
  median = r.median;
  for (const eo of r.entries) payouts[memberIndex[eo.team][eo.entry]] = eo.payout;
  return finish(null, payouts, r.platformCut, r.seasonIn, r.seasonOut, summary(true));

  function finish(
    voidReason: Settlement["void"],
    pays: bigint[],
    platformCut: bigint,
    seasonIn: bigint,
    seasonOut: bigint,
    teamRows: SettledTeam[],
  ): Settlement {
    for (let i = 0; i < n; i++) if (!statuses[i]) statuses[i] = { kind: "refunded", reason: "missing-price" };
    const totalPayout = pays.reduce((s, p) => s + p, 0n);
    const inputs = {
      version: 1,
      chain: "solana",
      roundId: input.roundId.toString(),
      stake: input.stake.toString(),
      capMultiple: input.capMultiple,
      maxBackers: input.maxBackers,
      seasonPot: input.seasonPot.toString(),
      bonus: bonus.toString(),
      params: { ...params, capMultiple: params.capMultiple.toString() },
      rules: { ...rules, minValue: rules.minValue.toString() },
      prices: {
        start: [...input.start.values()].map((p) => ({ token: p.token, value: p.value.toString(), decimals: p.decimals, samples: p.samples })),
        end: [...input.end.values()].map((p) => ({ token: p.token, value: p.value.toString(), decimals: p.decimals, samples: p.samples })),
        problems: input.priceProblems,
      },
      entries: entries.map((e) => ({
        index: e.index,
        wallet: e.wallet,
        teamKey: e.teamKey,
        isCreator: e.isCreator,
        basket: e.basket ? { mints: e.basket.mints, amounts: e.basket.amounts.map(String), weightsBps: e.basket.weightsBps } : null,
        status: statuses[e.index],
        payout: pays[e.index].toString(),
      })),
      teams: teamRows.map((t) => ({ ...t, ret: t.ret.toString(), ticketPayout: t.ticketPayout.toString() })),
      result: {
        void: voidReason,
        median: median === null ? null : median.toString(),
        totalPayout: totalPayout.toString(),
        platformCut: platformCut.toString(),
        seasonIn: seasonIn.toString(),
        seasonOut: seasonOut.toString(),
      },
    };
    return { void: voidReason, payouts: pays, totalPayout, platformCut, seasonIn, seasonOut, statuses, teams: teamRows, median, inputs, inputsHash: hashInputs(inputs) };
  }
}

/** sha256 of the canonical JSON (keys in construction order), hex. */
export const hashInputs = (inputs: unknown): string => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(inputs))));

/** The program's per-entry ceiling: stake × (1 + cap × (1 + maxBackers)) + bonus. */
export const maxPayoutOf = (stake: bigint, capMultiple: number, maxBackers: number, bonus = 0n) =>
  stake * (1n + BigInt(capMultiple) * (1n + BigInt(maxBackers))) + bonus;

/**
 * Recompute a published settlement from its inputs (what anyone can do to
 * check the keeper). Returns the recomputed settlement; compare its
 * inputsHash with the one on-chain.
 */
export function recomputeFromInputs(inputs: any): Settlement {
  const snap = (rows: any[]) => new Map<string, Snapshot>(rows.map((p) => [p.token, { token: p.token, value: BigInt(p.value), decimals: p.decimals, samples: p.samples }]));
  const params: LeagueParams = { ...inputs.params, capMultiple: BigInt(inputs.params.capMultiple) };
  const rules: EligibilityRules = { ...inputs.rules, minValue: BigInt(inputs.rules.minValue) };
  return settleRound(
    {
      roundId: BigInt(inputs.roundId),
      stake: BigInt(inputs.stake),
      capMultiple: inputs.capMultiple,
      maxBackers: inputs.maxBackers,
      seasonPot: BigInt(inputs.seasonPot),
      bonus: BigInt(inputs.bonus),
      entries: inputs.entries.map((e: any) => ({
        index: e.index,
        wallet: e.wallet,
        teamKey: e.teamKey,
        isCreator: e.isCreator,
        basket: e.basket ? { mints: e.basket.mints, amounts: e.basket.amounts.map((a: string) => BigInt(a)), weightsBps: e.basket.weightsBps } : undefined,
      })),
      start: snap(inputs.prices.start),
      end: snap(inputs.prices.end),
      priceProblems: inputs.prices.problems,
      cryptoTokens: rules.cryptoTokens,
    },
    params,
    rules,
  );
}
