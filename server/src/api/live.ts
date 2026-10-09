// Live prices for the app (cached briefly), from the same source the keeper
// scores with, plus 24h changes for previews.

import { toValue, type PriceSample, type Snapshot } from "@indx/core";
import type { League } from "../league.js";
import { demoPrice, effectiveMultiplier, jupiterPrices, priceSourceFromEnv, samplePrices } from "../prices.js";

export interface LivePrices {
  at: number;
  source: string;
  /** By mint on this cluster. */
  sample: Map<string, PriceSample>;
  /** 24h change in percent, by mint, when known. */
  change24h: Map<string, number | null>;
}

const TTL_MS = 15_000;
let cache: { at: number; p: Promise<LivePrices> } | null = null;

export function livePrices(L: League): Promise<LivePrices> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.p;
  const p = load(L, now).catch((e) => {
    cache = null;
    throw e;
  });
  cache = { at: now, p };
  return p;
}

export function clearLiveCache() {
  cache = null;
}

async function load(L: League, at: number): Promise<LivePrices> {
  const source = priceSourceFromEnv();
  if (source === "demo") {
    const sample = await samplePrices(L.assets, "demo", at);
    const change24h = new Map(L.assets.map((a) => [a.mint, (demoPrice(a.ticker, at) / demoPrice(a.ticker, at - 86_400_000) - 1) * 100] as const));
    return { at, source, sample, change24h };
  }
  // Jupiter gives both the price and the 24h change in one call.
  const jp = await jupiterPrices([...new Set(L.assets.map((a) => a.priceMint))]);
  const sample = new Map<string, PriceSample>();
  const change24h = new Map<string, number | null>();
  for (const a of L.assets) {
    const p = jp.get(a.priceMint);
    change24h.set(a.mint, p?.priceChange24h ?? null);
    if (!p) continue;
    const multiplier = effectiveMultiplier(p.scaledUiConfig, at);
    sample.set(a.mint, { token: a.mint, value: toValue(p.usdPrice, multiplier), decimals: a.decimals, uiPrice: p.usdPrice, multiplier, trading: true, at, source: "jupiter" });
  }
  return { at, source, sample, change24h };
}

/** A sample as a snapshot map (for projections). */
export function asSnapshots(sample: Map<string, PriceSample>): Map<string, Snapshot> {
  return new Map([...sample].filter(([, p]) => p.value > 0n).map(([k, p]) => [k, { token: k, value: p.value, decimals: p.decimals, samples: 1 }]));
}

/** Synthetic "24h ago" snapshots: value / (1 + change). */
export function dayAgoSnapshots(live: LivePrices): Map<string, Snapshot> {
  const out = new Map<string, Snapshot>();
  for (const [k, p] of live.sample) {
    const chg = live.change24h.get(k);
    if (p.value <= 0n) continue;
    const factor = chg === null || chg === undefined ? 1 : 1 + chg / 100;
    const scaled = factor > 0 ? BigInt(Math.round((Number(p.value / 10n ** 6n) / factor))) * 10n ** 6n : p.value;
    out.set(k, { token: k, value: scaled, decimals: p.decimals, samples: 1 });
  }
  return out;
}
