// API contract shared by the server and the app. Money is USD (floats, for
// display) with raw base-unit strings where a transaction needs exact
// amounts. Returns are percentages (5.2 = +5.2%).

import type { AssetKind } from "./assets.js";

export type Cluster = "mainnet" | "devnet" | "localnet" | "lite";

export interface ConfigView {
  /** Build of the server (git commit): check it before testing a fresh deploy. */
  version: string;
  cluster: Cluster;
  programId: string;
  stakeMint: string;
  stakeDecimals: number;
  stakeSymbol: string;
  lookupTable: string | null;
  /** RPC the app may use for balances (the server relays transactions anyway). */
  rpcUrl: string;
  faucet: boolean;
  explorer: string;
  priceSource: string;
  rules: RulesView;
}

export interface RulesView {
  minTokens: number;
  maxTokens: number;
  maxWeightPct: number;
  minBasketUsd: number;
  maxCryptoPct: number;
  takePct: number;
  creatorFeePct: number;
  maxBuyFeePct: number;
  capMultiple: number;
  voidGraceDays: number;
}

export interface AssetView {
  symbol: string;
  ticker: string;
  name: string;
  kind: AssetKind;
  mint: string;
  decimals: number;
  token2022: boolean;
  logo: string | null;
  /** USD per UI token. */
  price: number | null;
  /** USD per whole raw token (price × multiplier): what a locked raw amount is worth. */
  rawPrice: number | null;
  /** UI amount = raw × multiplier / 10^decimals (xStocks dividends). */
  multiplier: number;
  change24hPct: number | null;
  /** Since the current round's start, when it has started. */
  roundChangePct: number | null;
  trading: boolean;
}

export type RoundPhase = "open" | "live" | "settling" | "settled" | "voided";
/** Strictly above the median wins; on it or below loses (no draws). */
export type Standing = "above" | "below";

export interface LegView {
  symbol: string;
  ticker: string;
  name: string;
  mint: string;
  weightBps: number;
  logo: string | null;
  /** Return since the round's start (live) or over the round (final). */
  retPct: number | null;
  price: number | null;
}

export interface EtfSummary {
  key: string;
  name: string;
  captain: string;
  /** Clones + backers, NOT counting the captain. */
  members: number;
  /** Every ticket on the team: members + the captain. Don't add the captain again. */
  tickets: number;
  buyFeeBps: number;
  legs: LegView[];
  retPct: number | null;
  vsMedianPct: number | null;
  standing: Standing | null;
  /** 1-based rank by return. */
  rank: number | null;
  /** What one backer ticket on this team pays if the round ended now (or paid, once settled). */
  ticketPayoutUsd: number | null;
  /** The keeper refunds this team (ineligible basket etc.), once known. */
  refunded: boolean;
  /** Return over the round so far (for sparklines); empty before the round starts. */
  spark: number[];
}

export interface RoundView {
  id: string;
  phase: RoundPhase;
  entryClose: number; // unix seconds
  end: number;
  stakeUsd: number;
  stakeRaw: string;
  players: number;
  etfCount: number;
  potUsd: number;
  bonusUsd: number;
  maxBackers: number;
  /** MEDIAN's return: live while running, final once settled. */
  medianPct: number | null;
  /** How returns were priced: before start (24h move), live, or final. */
  pricing: "preview" | "live" | "final";
  etfs: EtfSummary[];
  voidReason: string | null;
  inputsHash: string | null;
  serverTime: number;
  /** The median's return over the round so far; empty before it starts. */
  medianSeries: { t: number; pct: number }[];
}

export interface ChartPoint {
  t: number; // unix ms
  retPct: number;
  benchPct: number | null;
  /** The median ETF return at this time (null when unknown). */
  medianPct: number | null;
}

export interface MemberView {
  wallet: string;
  isCaptain: boolean;
  isCreator: boolean;
}

export interface EtfView extends EtfSummary {
  roundId: string;
  roundPhase: RoundPhase;
  stakeUsd: number;
  entryClose: number;
  end: number;
  /** Members allowed per team besides the captain (members ≥ this = full). */
  maxBackers: number;
  memberList: MemberView[];
  chart: ChartPoint[];
  medianPct: number | null;
}

export type EntryState = "entered" | "live" | "won" | "lost" | "refunded" | "voided";

export interface WalletEntryView {
  roundId: string;
  etfKey: string;
  etfName: string;
  isCreator: boolean;
  isCaptain: boolean;
  state: EntryState;
  standing: Standing | null;
  retPct: number | null;
  /** Final payout (settled) or the live projection. */
  payoutUsd: number | null;
  stakeUsd: number;
  /** Paid out (entries are closed once paid and baskets are back). */
  paid: boolean;
  basket: { symbol: string; mint: string; amountRaw: string; uiAmount: number; returned: boolean }[];
}

export interface BalanceView {
  symbol: string;
  mint: string;
  raw: string;
  uiAmount: number;
  usd: number | null;
}

export interface WalletView {
  wallet: string;
  sol: number;
  usdc: BalanceView;
  assets: BalanceView[];
  entries: WalletEntryView[];
  stats: { rounds: number; wins: number; netUsd: number };
  /** The wallet's @tag, if it claimed one. */
  tag: string | null;
}

export interface RoundSummary {
  id: string;
  phase: RoundPhase;
  entryClose: number;
  end: number;
  players: number;
  etfCount: number;
  potUsd: number;
  medianPct: number | null;
  top: { key: string; name: string; captain: string; retPct: number }[];
}

export interface LeaderRow {
  wallet: string;
  tag?: string | null;
  rounds: number;
  wins: number;
  netUsd: number;
  bestRetPct: number | null;
}

export interface ActivityItem {
  kind: "created" | "cloned" | "backed";
  roundId: string;
  wallet: string;
  etfKey: string;
  etfName: string;
  index: number;
}

/** Transactions for the wallet to sign (base64 v0, unsigned). */
export interface TxPlan {
  /** In order; each needs the wallet's signature. */
  transactions: string[];
  summary: string;
  /** Extra info for the UI (team key, amounts, quotes…). */
  meta?: Record<string, unknown>;
}

export interface CreateRequest {
  wallet: string;
  roundId?: string;
  /** Weights in bps (summing to 10000) per mint. */
  legs: { mint: string; weightBps: number }[];
  /** Target basket value in USD (default: the most the wallet's balances allow). */
  usd?: number;
  name: string;
  buyFeeBps?: number;
}

export interface BackRequest {
  wallet: string;
  roundId?: string;
  etfKey: string;
}

export interface BuyRequest {
  wallet: string;
  usd: number;
  /** Buy a round's ETF (the creator earns their buy fee)… */
  roundId?: string;
  etfKey?: string;
  /** …or any basket (no creator fee). */
  legs?: { mint: string; weightBps: number }[];
  slippageBps?: number;
}
