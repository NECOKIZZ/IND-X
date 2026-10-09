// Basket helpers shared by the keeper, the API and the app: team keys
// (clone-merging), weights, the buy-the-basket split and basket fitting.

import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { basketWeightsBps } from "./engine.js";

/** Weight bucket for clone-merging: 1% = 100 bps. */
export const WEIGHT_BUCKET_BPS = 100;

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const hexToBytes = (h: string): Uint8Array => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length % 2) throw new Error("bad hex");
  return Uint8Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.slice(2 * i, 2 * i + 2), 16));
};
export const bytesToHex = toHex;

/**
 * Team key: sha256 of the basket's (mint, weight rounded to 1%) rows, sorted
 * by mint bytes. Two baskets with the same tokens and the same weights to 1%
 * are one team. Each row is the 32-byte mint and the bucket as a u16 LE.
 * Returns 64 hex chars (the 32-byte seed of the Team account).
 */
export function teamKeyFromWeights(mints: string[], weightsBps: number[]): string {
  if (mints.length !== weightsBps.length) throw new Error("teamKeyFromWeights: length mismatch");
  const rows = mints
    .map((m, i) => ({ mint: bs58.decode(m), bucket: Math.round(weightsBps[i] / WEIGHT_BUCKET_BPS) }))
    .filter((r) => r.bucket > 0)
    .sort((a, b) => cmpBytes(a.mint, b.mint));
  const buf = new Uint8Array(rows.length * 34);
  rows.forEach((r, i) => {
    buf.set(r.mint, i * 34);
    buf[i * 34 + 32] = r.bucket & 0xff;
    buf[i * 34 + 33] = r.bucket >> 8;
  });
  return toHex(sha256(buf));
}

/** Team key from the tokens' USD values at entry. */
export function teamKeyOf(mints: string[], values: bigint[]): string {
  return teamKeyFromWeights(mints, basketWeightsBps(values));
}

function cmpBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * Round weights (any positive numbers) to integer bps summing to exactly
 * 10 000; the remainder goes to the largest weight.
 */
export function normaliseWeights(weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!(total > 0)) throw new Error("weights must be positive");
  const bps = weights.map((w) => Math.floor((Math.max(0, w) / total) * 10_000));
  const slack = 10_000 - bps.reduce((s, w) => s + w, 0);
  bps[bps.indexOf(Math.max(...bps))] += slack;
  return bps;
}

export interface BuyLeg {
  mint: string;
  amountIn: bigint; // stablecoin in, base units
  weightBps: number;
}

/** Split a stablecoin amount across the basket by weight; dust goes to the largest leg. */
export function splitBuy(mints: string[], weightsBps: number[], total: bigint): BuyLeg[] {
  if (mints.length !== weightsBps.length || mints.length === 0) throw new Error("splitBuy: bad basket");
  const wSum = weightsBps.reduce((s, w) => s + w, 0);
  if (wSum <= 0) throw new Error("splitBuy: zero weights");
  const legs = mints.map((mint, i) => ({ mint, weightBps: weightsBps[i], amountIn: (total * BigInt(weightsBps[i])) / BigInt(wSum) }));
  const dust = total - legs.reduce((s, l) => s + l.amountIn, 0n);
  legs[weightsBps.indexOf(Math.max(...weightsBps))].amountIn += dust;
  return legs.filter((l) => l.amountIn > 0n);
}

/** Creator fee bounds for basket buys (Jupiter platform fee, paid to the creator). */
export const MAX_CREATOR_BUY_FEE_BPS = 200;
export const DEFAULT_CREATOR_BUY_FEE_BPS = 100;

export interface FitLeg {
  /** Wallet balance, base units (raw, before any UI multiplier). */
  raw: bigint;
  decimals: number;
  /** USD per whole raw token (UI price × multiplier). */
  price: number;
  weightBps: number;
}

/**
 * The basket to lock: the largest one at exactly the declared weights that the
 * wallet's balances cover, capped at `targetUsd` if given. Returns per-leg
 * amounts (base units) and the basket's USD value at these prices.
 */
export function fitBasket(legs: FitLeg[], targetUsd?: number): { amounts: bigint[]; usd: number; maxUsd: number } {
  if (legs.length === 0) return { amounts: [], usd: 0, maxUsd: 0 };
  const priceE6 = legs.map((l) => BigInt(Math.max(1, Math.round(l.price * 1e6))));
  const valueE6 = legs.map((l, i) => (l.raw * priceE6[i]) / 10n ** BigInt(l.decimals));
  const caps = legs.map((l, i) => (l.weightBps > 0 ? (valueE6[i] * 10_000n) / BigInt(l.weightBps) : 0n));
  const maxE6 = caps.reduce((m, c) => (c < m ? c : m));
  const target = targetUsd !== undefined && targetUsd > 0 ? BigInt(Math.round(targetUsd * 1e6)) : maxE6;
  const basketE6 = target < maxE6 ? target : maxE6;
  const amounts = legs.map((l, i) => {
    const a = (basketE6 * BigInt(l.weightBps) * 10n ** BigInt(l.decimals)) / (10_000n * priceE6[i]);
    return a > l.raw ? l.raw : a;
  });
  const usd = amounts.reduce((s, a, i) => s + (a * priceE6[i]) / 10n ** BigInt(legs[i].decimals), 0n);
  return { amounts, usd: Number(usd) / 1e6, maxUsd: Number(maxE6) / 1e6 };
}
