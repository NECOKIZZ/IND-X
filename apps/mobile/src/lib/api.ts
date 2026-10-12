// Typed client for the league API (types shared with the server).

import type {
  ActivityItem,
  AssetView,
  BackRequest,
  BuyRequest,
  ConfigView,
  CreateRequest,
  EtfView,
  LeaderRow,
  RoundSummary,
  RoundView,
  TxPlan,
  WalletView,
} from "@indx/core";
import { apiUrl } from "./network";

export interface BasketQuote {
  weights: number[];
  maxUsd: number;
  usd: number;
  legs: { mint: string; symbol: string; weightBps: number; amountRaw: string; uiAmount: number; usd: number; heldRaw: string; buyRaw: string; buyUsd: number }[];
  wrapLamports: string;
  /** With buy: USDC spent on the stocks the wallet is missing. */
  buyUsd: number;
  /** The wallet's USDC. */
  usdcUsd: number;
}

export interface PoolView {
  seasonUsd: number;
  roundUsd: number;
  roundId: string | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown, method?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export const api = {
  config: () => call<ConfigView>("/v1/config"),
  assets: () => call<AssetView[]>("/v1/assets"),
  round: (id: string = "current") => call<RoundView>(`/v1/rounds/${id}`),
  rounds: () => call<RoundSummary[]>("/v1/rounds"),
  etf: (round: string, key: string) => call<EtfView>(`/v1/rounds/${round}/etfs/${key}`),
  activity: (round: string = "current") => call<ActivityItem[]>(`/v1/rounds/${round}/activity`),
  wallet: (w: string) => call<WalletView>(`/v1/wallets/${w}`),
  leaderboard: () => call<LeaderRow[]>("/v1/leaderboard"),
  verify: (round: string) => call<{ matches: boolean; onChainHash: string; recomputedHash: string }>(`/v1/rounds/${round}/verify`),

  /** Exactly what a create transaction would lock (the server builds the tx from the same function). */
  quote: (r: { wallet?: string; legs: CreateRequest["legs"]; usd?: number; buy?: boolean; useHeld?: boolean }) => call<BasketQuote>("/v1/basket/quote", r),
  planCreate: (r: CreateRequest) => call<TxPlan>("/v1/tx/create", r),
  planBack: (r: BackRequest) => call<TxPlan>("/v1/tx/back", r),
  planBuy: (r: BuyRequest) => call<TxPlan>("/v1/tx/buy", r),
  planClaim: (wallet: string, roundId: string) => call<TxPlan>("/v1/tx/claim", { wallet, roundId }),
  planBoost: (wallet: string, usd: number, roundId?: string) => call<TxPlan>("/v1/tx/boost", { wallet, usd, roundId }),
  send: (tx: string) => call<{ signature: string }>("/v1/tx/send", { tx }),
  faucet: (wallet: string) => call<{ usdc: number; sol: number }>("/v1/faucet", { wallet }),
  pool: () => call<PoolView>("/v1/pool"),
  planTransfer: (r: { wallet: string; to: string; mint: string; amount: number }) => call<TxPlan>("/v1/tx/transfer", r),
  resolveTag: (tag: string) => call<{ tag: string; wallet: string }>(`/v1/tags/${encodeURIComponent(tag.replace(/^@/, ""))}`),
  tagChallenge: (wallet: string, tag: string) => call<{ transaction: string; tag: string }>("/v1/tags/challenge", { wallet, tag }),
  tagClaim: (wallet: string, tag: string, signed: string) => call<{ tag: string }>("/v1/tags/claim", { wallet, tag, signed }),
  registerPush: (wallet: string, token: string) => call<{ ok: true }>("/v1/push", { wallet, token }),
};
