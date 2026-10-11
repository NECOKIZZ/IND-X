// What the app shows, computed from chain state, the keeper's samples and
// published inputs, and live prices.
//
// Returns per phase:
//   open (entries open)   preview: each ETF's move over the last 24h, and
//                         what a round over those 24h would have paid
//   live / settling       since the round's start prices, projected with the
//                         engine as if the round ended now
//   settled / voided      final, from the published settlement inputs

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  DEFAULT_LEAGUE_PARAMS,
  basketReturn,
  buildSnapshot,
  retToPct,
  settleRound,
  toUnits,
  BENCHMARK_TICKER,
  type ActivityItem,
  type AssetView,
  type ChartPoint,
  type EtfSummary,
  type EtfView,
  type LeaderRow,
  type LegView,
  type RoundPhase,
  type RoundSummary,
  type RoundView,
  type Settlement,
  type Snapshot,
  type Standing,
  type WalletEntryView,
  type WalletView,
} from "@indx/core";
import type { League } from "../league.js";
import type { EntryAccount, RoundAccount, TeamAccount } from "../chain/program.js";
import { toChainEntry } from "../keeper/keeper.js";
import { asSnapshots, dayAgoSnapshots, livePrices, type LivePrices } from "./live.js";

const nowSec = () => Math.floor(Date.now() / 1000);

/** The chain's clock (what the program goes by), cached for a few seconds. */
let chainClock: { at: number; t: number } | null = null;
export async function chainNow(L: League): Promise<number> {
  if (chainClock && Date.now() - chainClock.at < 5_000) return chainClock.t + Math.floor((Date.now() - chainClock.at) / 1000);
  const t = await L.io.now().catch(() => nowSec());
  chainClock = { at: Date.now(), t };
  return t;
}
export function resetChainClock() {
  chainClock = null;
}

export function phaseOf(r: RoundAccount, now = nowSec()): RoundPhase {
  if (r.status === "settled") return "settled";
  if (r.status === "voided") return "voided";
  if (r.status === "settling") return "settling";
  return now < r.entryClose ? "open" : "live";
}

export async function assetViews(L: League): Promise<AssetView[]> {
  const live = await livePrices(L).catch(() => null);
  const start = await currentStart(L);
  return L.assets.map((a) => {
    const p = live?.sample.get(a.mint);
    const s = start?.get(a.mint);
    const raw = p ? Number(p.value) / 1e18 : null;
    return {
      symbol: a.symbol,
      ticker: a.ticker,
      name: a.name,
      kind: a.kind,
      mint: a.mint,
      decimals: a.decimals,
      token2022: a.token2022,
      logo: a.logo ?? null,
      price: p?.uiPrice ?? null,
      rawPrice: raw,
      multiplier: p?.multiplier ?? 1,
      change24hPct: live?.change24h.get(a.mint) ?? null,
      roundChangePct: p && s ? (Number(p.value) / Number(s.value) - 1) * 100 : null,
      trading: p?.trading ?? false,
    };
  });
}

/** Start snapshot of the latest round once it has started (any number of samples). */
async function currentStart(L: League): Promise<Map<string, Snapshot> | null> {
  const cfg = await L.reader.config();
  if (!cfg || cfg.roundCount === 0n) return null;
  return startSnapshot(L, cfg.roundCount);
}

async function startSnapshot(L: League, roundId: bigint): Promise<Map<string, Snapshot> | null> {
  const samples = await L.store.loadSamples(roundId, "start");
  if (!samples.length) return null;
  const mints = [...new Set(samples.flatMap((s) => [...s.sample.keys()]))];
  return buildSnapshot(samples.map((s) => s.sample), mints, 1).prices;
}

// --- rounds --------------------------------------------------------------------

interface RoundData {
  round: RoundAccount;
  phase: RoundPhase;
  teams: TeamAccount[];
  entries: EntryAccount[];
  /** Final (published) or projected settlement. */
  s: Settlement | null;
  pricing: RoundView["pricing"];
  start: Map<string, Snapshot> | null;
  end: Map<string, Snapshot> | null;
  live: LivePrices | null;
  series: Series | null;
}

/** Returns over the round, from the chart samples (+ the live price): per ETF, the S&P 500 and the median. */
interface Series {
  t: number[]; // unix ms; t[0] is the start (all returns 0)
  byTeam: Map<string, (number | null)[]>;
  bench: (number | null)[];
  median: (number | null)[];
}

const cache = new Map<string, { at: number; p: Promise<RoundData> }>();
const ROUND_TTL_MS = 8_000;

async function roundData(L: League, roundId: bigint): Promise<RoundData> {
  const k = roundId.toString();
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < ROUND_TTL_MS) return hit.p;
  const p = loadRoundData(L, roundId).catch((e) => {
    cache.delete(k);
    throw e;
  });
  cache.set(k, { at: Date.now(), p });
  return p;
}

export function invalidateRound(roundId?: bigint) {
  if (roundId === undefined) cache.clear();
  else cache.delete(roundId.toString());
}

const snapsFromInputs = (rows: any[]) => new Map<string, Snapshot>(rows.map((p) => [p.token, { token: p.token, value: BigInt(p.value), decimals: p.decimals, samples: p.samples }]));

async function loadRoundData(L: League, roundId: bigint): Promise<RoundData> {
  const round = await L.reader.round(roundId);
  if (!round) throw new HttpError(404, `no round ${roundId}`);
  const phase = phaseOf(round, await chainNow(L));
  const [teams, entries] = await Promise.all([L.reader.teams(roundId), L.reader.entries(roundId)]);

  if (phase === "settled" || phase === "voided") {
    const inputs = await L.store.loadInputs(roundId);
    if (inputs) {
      const { recomputeFromInputs } = await import("@indx/core");
      const start = snapsFromInputs(inputs.prices.start);
      return { round, phase, teams, entries, s: recomputeFromInputs(inputs), pricing: "final", start, end: snapsFromInputs(inputs.prices.end), live: null, series: await buildSeries(L, round, teams, entries, inputs, start, null) };
    }
    return { round, phase, teams, entries, s: null, pricing: "final", start: null, end: null, live: null, series: null };
  }

  const live = await livePrices(L).catch(() => null);
  const liveSnap = live ? asSnapshots(live.sample) : null;
  let start: Map<string, Snapshot> | null = null;
  let pricing: RoundView["pricing"] = "preview";
  if (phase === "live" || phase === "settling") {
    start = await startSnapshot(L, roundId);
    pricing = "live";
  }
  if (!start && live) start = dayAgoSnapshots(live);
  const cfg = await L.reader.config();
  const s =
    start && liveSnap && entries.length
      ? settleRound({
          roundId,
          stake: round.stake,
          capMultiple: round.capMultiple,
          maxBackers: round.maxBackers,
          seasonPot: cfg?.seasonPot ?? 0n,
          entries: entries.map(toChainEntry),
          start,
          end: liveSnap,
          priceProblems: [],
          bonus: round.bonus,
          cryptoTokens: L.assets.filter((a) => a.kind === "crypto").map((a) => a.mint),
        })
      : null;
  // Charts only once the round has really started (a preview has no history).
  const series = pricing === "live" && start ? await buildSeries(L, round, teams, entries, null, start, live) : null;
  return { round, phase, teams, entries, s, pricing, start, end: liveSnap, live, series };
}

async function buildSeries(L: League, round: RoundAccount, teams: TeamAccount[], entries: EntryAccount[], inputs: any, start: Map<string, Snapshot>, live: LivePrices | null): Promise<Series | null> {
  const norm = (p: { value: bigint; decimals: number }) => p.value * 10n ** BigInt(18 - p.decimals);
  // Each team's captain basket: open entries, or the published inputs once entries are closed.
  const baskets = new Map<string, { mints: string[]; amounts: bigint[] }>();
  for (const t of teams) {
    const e = entries.find((x) => x.wallet.equals(t.captain));
    const fromInputs = inputs?.entries.find((x: any) => x.wallet === t.captain.toBase58() && x.basket);
    const b: { mints: string[]; amounts: bigint[] } | null = e ? { mints: e.basket.map((l) => l.mint.toBase58()), amounts: e.basket.map((l) => l.amount) } : fromInputs ? { mints: fromInputs.basket.mints, amounts: fromInputs.basket.amounts.map((a: string) => BigInt(a)) } : null;
    if (b && b.mints.every((m: string) => start.get(m))) baskets.set(t.key, b);
  }
  // Teams that are actually scored (an invalid basket is refunded, not ranked).
  const scored = inputs ? new Set<string>(inputs.teams.map((t: any) => t.teamKey)) : null;
  const benchMint = L.assets.find((a) => a.ticker === BENCHMARK_TICKER)?.mint;
  const samples = [...(await L.store.loadSamples(round.id, "track")), ...(await L.store.loadSamples(round.id, "end"))]
    .filter((s) => s.at > round.entryClose * 1000)
    .sort((a, b) => a.at - b.at);
  const points: { t: number; sample: Map<string, { value: bigint; decimals: number }> | null }[] = [{ t: round.entryClose * 1000, sample: null }, ...samples.map((s) => ({ t: s.at, sample: s.sample }))];
  if (live) points.push({ t: live.at, sample: live.sample });
  const out: Series = { t: points.map((p) => p.t), byTeam: new Map(), bench: [], median: [] };
  for (const key of baskets.keys()) out.byTeam.set(key, []);
  for (const p of points) {
    const rets: number[] = [];
    for (const [key, b] of baskets) {
      let r: number | null = 0;
      if (p.sample) {
        const endP = b.mints.map((m) => p.sample!.get(m));
        r = endP.some((x) => !x || x.value === 0n) ? null : retToPct(basketReturn(b.amounts, b.mints.map((m) => norm(start.get(m)!)), endP.map((x) => norm(x!))));
      }
      out.byTeam.get(key)!.push(r);
      if (r !== null && (!scored || scored.has(key))) rets.push(r);
    }
    rets.sort((a, b) => a - b);
    // No median while the round couldn't be scored (too few ETFs: it voids).
    out.median.push(rets.length >= DEFAULT_LEAGUE_PARAMS.minTeams ? (rets.length % 2 ? rets[(rets.length - 1) / 2] : (rets[rets.length / 2 - 1] + rets[rets.length / 2]) / 2) : null);
    const bs = benchMint ? start.get(benchMint) : undefined;
    const be = benchMint && p.sample ? p.sample.get(benchMint) : undefined;
    out.bench.push(!benchMint || !bs ? null : !p.sample ? 0 : be ? (Number(be.value) / Number(bs.value) - 1) * 100 : null);
  }
  return out;
}

function legViews(L: League, team: TeamAccount, d: RoundData): LegView[] {
  return team.legs.map((l) => {
    const mint = l.mint.toBase58();
    const a = L.assetByMint(mint);
    const st = d.start?.get(mint);
    const en = d.end?.get(mint);
    return {
      symbol: a?.symbol ?? mint.slice(0, 4),
      ticker: a?.ticker ?? "?",
      name: a?.name ?? "Unknown",
      mint,
      weightBps: l.weightBps,
      logo: a?.logo ?? null,
      retPct: st && en ? (Number(en.value) / Number(st.value) - 1) * 100 : null,
      price: d.live?.sample.get(mint)?.uiPrice ?? (en ? Number(en.value) / 1e18 : null),
    };
  });
}

function summaries(L: League, d: RoundData): EtfSummary[] {
  const stakeUsd = toUnits(d.round.stake, L.deployment.stakeDecimals);
  const median = d.s?.median ?? null;
  const rows = d.teams.map((t): EtfSummary => {
    const st = d.s?.teams.find((x) => x.teamKey === t.key);
    const standing: Standing | null = !d.s || d.s.void || !st ? null : st.isWinner ? "above" : "below";
    const retPct = st ? retToPct(st.ret) : null;
    return {
      key: t.key,
      name: t.name,
      captain: t.captain.toBase58(),
      members: t.members,
      tickets: t.members + 1,
      buyFeeBps: t.buyFeeBps,
      legs: legViews(L, t, d),
      retPct,
      vsMedianPct: retPct !== null && median !== null ? retPct - retToPct(median) : null,
      standing,
      rank: null,
      ticketPayoutUsd: st ? toUnits(st.ticketPayout, L.deployment.stakeDecimals) : d.s ? stakeUsd : null,
      spark: d.series?.byTeam.get(t.key)?.filter((x): x is number => x !== null) ?? [],
      refunded: !!d.s && !d.s.void && !st,
    };
  });
  rows.sort((a, b) => (b.retPct ?? -Infinity) - (a.retPct ?? -Infinity));
  let rank = 0;
  for (const r of rows) if (r.retPct !== null) r.rank = ++rank;
  return rows;
}

export async function roundView(L: League, roundId: bigint): Promise<RoundView> {
  const d = await roundData(L, roundId);
  const dec = L.deployment.stakeDecimals;
  return {
    id: roundId.toString(),
    phase: d.phase,
    entryClose: d.round.entryClose,
    end: d.round.end,
    stakeUsd: toUnits(d.round.stake, dec),
    stakeRaw: d.round.stake.toString(),
    players: d.round.entryCount,
    etfCount: d.round.teamCount,
    potUsd: toUnits(d.round.totalStakes + d.round.bonus, dec),
    bonusUsd: toUnits(d.round.bonus, dec),
    maxBackers: d.round.maxBackers,
    medianPct: d.s?.median !== null && d.s?.median !== undefined ? retToPct(d.s.median) : null,
    pricing: d.pricing,
    etfs: summaries(L, d),
    voidReason: d.phase === "voided" ? (d.s?.void ?? "voided") : d.pricing === "final" && d.s?.void ? d.s.void : null,
    inputsHash: d.phase === "settled" || d.phase === "voided" ? d.round.inputsHash : null,
    serverTime: await chainNow(L),
    medianSeries: d.series ? d.series.t.map((t, i) => ({ t, pct: d.series!.median[i] })).filter((p): p is { t: number; pct: number } => p.pct !== null) : [],
  };
}

export async function currentRoundId(L: League): Promise<bigint> {
  const cfg = await L.reader.config();
  if (!cfg || cfg.roundCount === 0n) throw new HttpError(404, "no rounds yet");
  return cfg.roundCount;
}

export async function etfView(L: League, roundId: bigint, key: string): Promise<EtfView> {
  const d = await roundData(L, roundId);
  const sum = summaries(L, d).find((e) => e.key === key.toLowerCase());
  const team = d.teams.find((t) => t.key === key.toLowerCase());
  if (!sum || !team) throw new HttpError(404, "no such ETF in this round");

  // Members: open entries, or the published inputs once entries are closed.
  const inputs = d.pricing === "final" ? await L.store.loadInputs(roundId) : null;
  const memberRows: { wallet: string; isCreator: boolean; index: number }[] = inputs
    ? inputs.entries.filter((e: any) => e.teamKey === team.key).map((e: any) => ({ wallet: e.wallet, isCreator: e.isCreator, index: e.index }))
    : d.entries.filter((e) => e.teamKey === team.key).map((e) => ({ wallet: e.wallet.toBase58(), isCreator: e.isCreator, index: e.index }));
  const captain = team.captain.toBase58();

  return {
    ...sum,
    roundId: roundId.toString(),
    roundPhase: d.phase,
    stakeUsd: toUnits(d.round.stake, L.deployment.stakeDecimals),
    maxBackers: d.round.maxBackers,
    entryClose: d.round.entryClose,
    end: d.round.end,
    memberList: memberRows.sort((a, b) => a.index - b.index).map((m) => ({ wallet: m.wallet, isCreator: m.isCreator, isCaptain: m.wallet === captain })),
    chart: chart(d, team.key),
    medianPct: d.s?.median !== null && d.s?.median !== undefined ? retToPct(d.s.median) : null,
  };
}

/** One ETF's return over the round, with the S&P 500 and the median at each point. */
function chart(d: RoundData, key: string): ChartPoint[] {
  const ser = d.series;
  const mine = ser?.byTeam.get(key);
  if (!ser || !mine) return [];
  const out: ChartPoint[] = [];
  ser.t.forEach((t, i) => {
    if (mine[i] !== null) out.push({ t, retPct: mine[i]!, benchPct: ser.bench[i], medianPct: ser.median[i] });
  });
  return out;
}

export async function roundSummaries(L: League, limit = 20): Promise<RoundSummary[]> {
  const cfg = await L.reader.config();
  if (!cfg || cfg.roundCount === 0n) return [];
  const ids: bigint[] = [];
  for (let id = cfg.roundCount; id >= 1n && ids.length < limit; id--) ids.push(id);
  const rounds = await L.reader.rounds(ids);
  const dec = L.deployment.stakeDecimals;
  const out: RoundSummary[] = [];
  for (const r of rounds) {
    if (!r) continue;
    const inputs = r.status === "settled" ? await L.store.loadInputs(r.id) : null;
    const teams: any[] = inputs?.teams ?? [];
    const names = inputs ? new Map((await L.reader.teams(r.id)).map((t) => [t.key, t.name])) : new Map();
    out.push({
      id: r.id.toString(),
      phase: phaseOf(r, await chainNow(L)),
      entryClose: r.entryClose,
      end: r.end,
      players: r.entryCount,
      etfCount: r.teamCount,
      potUsd: toUnits(r.totalStakes + r.bonus, dec),
      medianPct: inputs?.result.median ? retToPct(inputs.result.median) : null,
      top: teams
        .map((t) => ({ key: t.teamKey, name: names.get(t.teamKey) ?? "ETF", captain: t.captain, retPct: retToPct(t.ret) }))
        .sort((a, b) => b.retPct - a.retPct)
        .slice(0, 3),
    });
  }
  return out;
}

// --- wallets -----------------------------------------------------------------

function stateOf(phase: RoundPhase, standing: Standing | null, refunded: boolean): WalletEntryView["state"] {
  if (phase === "voided") return "voided";
  if (refunded) return "refunded";
  if (phase === "open") return "entered";
  if (phase === "live" || phase === "settling") return "live";
  return standing === "above" ? "won" : "lost";
}

export async function walletView(L: League, walletStr: string): Promise<WalletView> {
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletStr);
  } catch {
    throw new HttpError(400, "bad wallet address");
  }
  const dec = L.deployment.stakeDecimals;
  const live = await livePrices(L).catch(() => null);
  const stakeAta = L.b.stakeAta(wallet);
  const assetAtas = L.assets.map((a) => getAssociatedTokenAddressSync(new PublicKey(a.mint), wallet, true, L.b.tokenProgramOf(new PublicKey(a.mint))));
  const [solAcc, stakeAcc, ...assetAccs] = await L.io.getAccounts([wallet, stakeAta, ...assetAtas]);
  const amountOf = (a: { data: Buffer } | null) => (a && a.data.length >= 72 ? a.data.readBigUInt64LE(64) : 0n);
  const usdcRaw = amountOf(stakeAcc);

  const assets = L.assets
    .map((a, i) => {
      const raw = amountOf(assetAccs[i]);
      const p = live?.sample.get(a.mint);
      const mult = p?.multiplier ?? 1;
      return {
        symbol: a.symbol,
        mint: a.mint,
        raw: raw.toString(),
        uiAmount: (Number(raw) * mult) / 10 ** a.decimals,
        usd: p ? (Number(raw) / 10 ** a.decimals) * (Number(p.value) / 1e18) : null,
      };
    })
    .filter((b) => b.raw !== "0");

  // Open entries (on-chain) plus closed ones from published inputs.
  const open = await L.reader.entriesOf(wallet);
  const entries: WalletEntryView[] = [];
  const seen = new Set<string>();
  for (const e of open) {
    const d = await roundData(L, e.roundId);
    entries.push(entryView(L, d, e.teamKey, e.isCreator, e.wallet.toBase58(), e.claimed, e.basket.map((l) => ({ mint: l.mint.toBase58(), amount: l.amount, returned: l.returned }))));
    seen.add(e.roundId.toString());
  }
  for (const id of (await L.store.settledRoundIds()).slice(0, 12)) {
    if (seen.has(id.toString())) continue;
    const inputs = await L.store.loadInputs(id);
    const row = inputs?.entries.find((x: any) => x.wallet === walletStr);
    if (!row) continue;
    const d = await roundData(L, id);
    entries.push(
      entryView(L, d, row.teamKey, row.isCreator, walletStr, true, (row.basket?.mints ?? []).map((m: string, i: number) => ({ mint: m, amount: BigInt(row.basket.amounts[i]), returned: true }))),
    );
  }
  entries.sort((a, b) => Number(BigInt(b.roundId) - BigInt(a.roundId)));

  const done = entries.filter((e) => e.state === "won" || e.state === "lost");
  return {
    wallet: walletStr,
    sol: (solAcc?.lamports ?? 0) / 1e9,
    usdc: { symbol: "USDC", mint: L.deployment.stakeMint, raw: usdcRaw.toString(), uiAmount: toUnits(usdcRaw, dec), usd: toUnits(usdcRaw, dec) },
    assets,
    entries,
    stats: {
      rounds: done.length,
      wins: done.filter((e) => e.state === "won").length,
      netUsd: done.reduce((s, e) => s + (e.payoutUsd ?? 0) - e.stakeUsd, 0),
    },
  };
}

function entryView(L: League, d: RoundData, teamKey: string, isCreator: boolean, wallet: string, claimed: boolean, basket: { mint: string; amount: bigint; returned: boolean }[]): WalletEntryView {
  const team = d.teams.find((t) => t.key === teamKey);
  const st = d.s?.teams.find((t) => t.teamKey === teamKey);
  const standing: Standing | null = !d.s || d.s.void || !st ? null : st.isWinner ? "above" : "below";
  const refunded = !!d.s && !d.s.void && !st;
  const dec = L.deployment.stakeDecimals;
  // Exact payout from the settlement for this wallet's entry.
  let payout: number | null = null;
  if (d.s) {
    const rows = d.s.inputs.entries as { wallet: string; payout: string }[];
    const row = rows.find((r) => r.wallet === wallet);
    if (row) payout = toUnits(row.payout, dec);
  }
  return {
    roundId: d.round.id.toString(),
    etfKey: teamKey,
    etfName: team?.name ?? "ETF",
    isCreator,
    isCaptain: !!team && team.captain.toBase58() === wallet,
    state: d.pricing === "final" && d.s?.void ? "voided" : stateOf(d.phase, standing, refunded),
    standing,
    retPct: st ? retToPct(st.ret) : null,
    payoutUsd: payout,
    stakeUsd: toUnits(d.round.stake, dec),
    paid: claimed && basket.every((b) => b.returned),
    basket: basket.map((b) => {
      const a = L.assetByMint(b.mint);
      return { symbol: a?.symbol ?? b.mint.slice(0, 4), mint: b.mint, amountRaw: b.amount.toString(), uiAmount: Number(b.amount) / 10 ** (a?.decimals ?? 0), returned: b.returned };
    }),
  };
}

// --- leaderboard & activity ----------------------------------------------------

export async function leaderboard(L: League, limit = 50): Promise<LeaderRow[]> {
  const rows = new Map<string, LeaderRow>();
  const dec = L.deployment.stakeDecimals;
  for (const id of (await L.store.settledRoundIds()).slice(0, 52)) {
    const inputs = await L.store.loadInputs(id);
    if (!inputs || inputs.result.void) continue;
    const teamRow = new Map<string, any>(inputs.teams.map((t: any) => [t.teamKey, t]));
    for (const e of inputs.entries) {
      if (e.status.kind !== "playing") continue;
      const t = teamRow.get(e.status.team);
      const r = rows.get(e.wallet) ?? { wallet: e.wallet, rounds: 0, wins: 0, netUsd: 0, bestRetPct: null };
      r.rounds++;
      if (t?.isWinner) r.wins++;
      r.netUsd += toUnits(BigInt(e.payout) - BigInt(inputs.stake), dec);
      if (e.status.captain && t) r.bestRetPct = Math.max(r.bestRetPct ?? -Infinity, retToPct(t.ret));
      rows.set(e.wallet, r);
    }
  }
  return [...rows.values()].sort((a, b) => b.netUsd - a.netUsd || b.wins - a.wins).slice(0, limit);
}

export async function activity(L: League, roundId: bigint, limit = 30): Promise<ActivityItem[]> {
  const d = await roundData(L, roundId);
  const names = new Map(d.teams.map((t) => [t.key, t]));
  return [...d.entries]
    .sort((a, b) => b.index - a.index)
    .slice(0, limit)
    .map((e) => {
      const t = names.get(e.teamKey);
      const kind = !e.isCreator ? "backed" : t && t.captain.equals(e.wallet) ? "created" : "cloned";
      return { kind, roundId: roundId.toString(), wallet: e.wallet.toBase58(), etfKey: e.teamKey, etfName: t?.name ?? "ETF", index: e.index };
    });
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
