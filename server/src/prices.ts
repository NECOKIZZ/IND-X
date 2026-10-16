// One price sample of every league token.
//
//   jupiter (default)  Jupiter Price API v3. For xStocks it reports the
//                      price per raw token too (usdPricePrescaled = UI price
//                      × the current ScaledUiAmount multiplier).
//   pyth               Pyth Hermes (set PYTH_API_KEY): the token's own feed
//                      (e.g. Crypto.AAPLX/USD) × the multiplier read from the
//                      mint on-chain. Tokens without a Pyth feed fall back to
//                      Jupiter.
//   demo               Deterministic synthetic prices (offline demos/tests).
//
// Value is USD per whole raw token, 1e18 (see @indx/core snapshot.ts).

import { toValue, type PriceSample } from "@indx/core";
import type { DeployedAsset } from "./config.js";

export type PriceSource = "jupiter" | "pyth" | "demo";

export function priceSourceFromEnv(): PriceSource {
  const s = process.env.LEAGUE_PRICE_SOURCE;
  if (s === "demo" || s === "pyth" || s === "jupiter") return s;
  return process.env.PYTH_API_KEY ? "pyth" : "jupiter";
}

const jupBase = () => (process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag");
const jupHeaders = (): Record<string, string> => (process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {});

/** A price older than this doesn't count as trading. */
export const MAX_PRICE_AGE_MS = 30 * 60_000;

interface JupPrice {
  usdPrice: number;
  decimals: number;
  priceChange24h?: number;
  stockData?: { price: number; updatedAt: string };
  scaledUiConfig?: { multiplier: number; newMultiplier: number; newMultiplierEffectiveAt: string; usdPricePrescaled?: number };
}

/** Retries a rate-limited (429) or failing (5xx) request a few times, honoring Retry-After. */
export async function fetchRetrying(url: string, init: RequestInit, delaysMs = [1000, 3000, 6000]): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if ((res.status !== 429 && res.status < 500) || attempt >= delaysMs.length) return res;
    const after = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, after > 0 ? Math.min(after * 1000, 10_000) : delaysMs[attempt]));
  }
}

export async function jupiterPrices(mints: string[]): Promise<Map<string, JupPrice>> {
  const out = new Map<string, JupPrice>();
  for (let i = 0; i < mints.length; i += 50) {
    const ids = mints.slice(i, i + 50).join(",");
    const res = await fetchRetrying(`${jupBase()}/price/v3?ids=${ids}`, { headers: jupHeaders() });
    if (!res.ok) throw new Error(`Jupiter price API ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as Record<string, JupPrice | null>;
    for (const [k, v] of Object.entries(body)) if (v && v.usdPrice > 0) out.set(k, v);
  }
  return out;
}

/** The multiplier in force at `at` (ms) for a Jupiter scaledUiConfig. */
export function effectiveMultiplier(c: JupPrice["scaledUiConfig"], at: number): number {
  if (!c) return 1;
  return at >= Date.parse(c.newMultiplierEffectiveAt) ? c.newMultiplier : c.multiplier;
}

export async function sampleJupiter(assets: DeployedAsset[], at = Date.now()): Promise<Map<string, PriceSample>> {
  const prices = await jupiterPrices([...new Set(assets.map((a) => a.priceMint))]);
  const out = new Map<string, PriceSample>();
  for (const a of assets) {
    const p = prices.get(a.priceMint);
    if (!p) {
      out.set(a.mint, { token: a.mint, value: 0n, decimals: a.decimals, trading: false, at, source: "jupiter" });
      continue;
    }
    const multiplier = effectiveMultiplier(p.scaledUiConfig, at);
    const updated = p.stockData?.updatedAt ? Date.parse(p.stockData.updatedAt) : at;
    out.set(a.mint, {
      token: a.mint,
      value: toValue(p.usdPrice, multiplier),
      decimals: a.decimals,
      uiPrice: p.usdPrice,
      multiplier,
      trading: at - updated <= MAX_PRICE_AGE_MS,
      at,
      source: "jupiter",
    });
  }
  return out;
}

/** Pyth Hermes latest prices for feed ids (hex), as USD floats with publish times. */
export async function pythPrices(ids: string[]): Promise<Map<string, { price: number; publishTime: number }>> {
  const base = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";
  const qs = ids.map((id) => `ids[]=0x${id}`).join("&");
  const headers: Record<string, string> = process.env.PYTH_API_KEY ? { Authorization: `Bearer ${process.env.PYTH_API_KEY}` } : {};
  const res = await fetch(`${base}/v2/updates/price/latest?${qs}&parsed=true`, { headers });
  if (!res.ok) throw new Error(`Pyth Hermes ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { parsed: { id: string; price: { price: string; expo: number; publish_time: number } }[] };
  return new Map(body.parsed.map((p) => [p.id.replace(/^0x/, ""), { price: Number(p.price.price) * 10 ** p.price.expo, publishTime: p.price.publish_time }]));
}

/**
 * Pyth for tokens with a feed, Jupiter for the rest. `multipliers` gives the
 * on-chain multiplier per mint (Token-2022 ScaledUiAmount); missing = 1.
 */
export async function samplePyth(assets: DeployedAsset[], multipliers: Map<string, number>, at = Date.now()): Promise<Map<string, PriceSample>> {
  const withFeed = assets.filter((a) => a.pyth);
  const feeds = await pythPrices(withFeed.map((a) => a.pyth!));
  const out = await sampleJupiter(assets.filter((a) => !a.pyth), at);
  for (const a of withFeed) {
    const p = feeds.get(a.pyth!);
    const multiplier = multipliers.get(a.priceMint) ?? 1;
    out.set(a.mint, {
      token: a.mint,
      value: p ? toValue(p.price, multiplier) : 0n,
      decimals: a.decimals,
      uiPrice: p?.price,
      multiplier,
      trading: !!p && at - p.publishTime * 1000 <= 120_000,
      at,
      source: "pyth",
    });
  }
  return out;
}

/** Reference prices for the demo source (USD per token). */
const DEMO_BASE: Record<string, number> = {
  AAPL: 337, MSFT: 535, NVDA: 229, GOOGL: 351, AMZN: 261, META: 720, TSLA: 383, NFLX: 71, AVGO: 361, MU: 1028, PLTR: 207,
  COIN: 181, HOOD: 108, CRCL: 85, MSTR: 155, MCD: 235, "BRK.B": 515, GME: 26, SPY: 778, QQQ: 751, GLD: 384, BTC: 82000, ETH: 2480, SOL: 110, BNB: 748, SKR: 0.017,
};

/** Each ticker drifts on its own slow wave, so standings move over minutes. */
export function demoPrice(ticker: string, at: number): number {
  const base = DEMO_BASE[ticker] ?? 100;
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const phase = (h % 1000) / 1000;
  const amp = 0.02 + (h % 7) / 100; // 2–8%
  return base * (1 + amp * Math.sin(at / 900_000 + phase * Math.PI * 2));
}

export function sampleDemo(assets: DeployedAsset[], at = Date.now()): Map<string, PriceSample> {
  return new Map(
    assets.map((a) => {
      const uiPrice = demoPrice(a.ticker, at);
      return [a.mint, { token: a.mint, value: toValue(uiPrice), decimals: a.decimals, uiPrice, multiplier: 1, trading: true, at, source: "demo" }];
    }),
  );
}

export async function samplePrices(
  assets: DeployedAsset[],
  source: PriceSource = priceSourceFromEnv(),
  at = Date.now(),
  multipliers = new Map<string, number>(),
): Promise<Map<string, PriceSample>> {
  if (source === "demo") return sampleDemo(assets, at);
  if (source === "pyth") return samplePyth(assets, multipliers, at);
  return sampleJupiter(assets, at);
}

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  jupiter: "Jupiter Price API (xStocks priced per raw token, dividends included)",
  pyth: "Pyth Hermes × on-chain ScaledUiAmount multiplier",
  demo: "demo prices",
};

/** On-chain ScaledUiAmount multiplier in force at `at` (ms) for each Token-2022 mint; 1 when absent. */
export async function readMultipliers(io: import("./chain/io.js").ChainIO, mints: string[], at = Date.now()): Promise<Map<string, number>> {
  const { PublicKey } = await import("@solana/web3.js");
  const { unpackMint, getScaledUiAmountConfig, TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
  const keys = mints.map((m) => new PublicKey(m));
  const accounts = await io.getAccounts(keys);
  const out = new Map<string, number>();
  accounts.forEach((a, i) => {
    if (!a || !a.owner.equals(TOKEN_2022_PROGRAM_ID)) return out.set(mints[i], 1);
    const mint = unpackMint(keys[i], { data: a.data, owner: a.owner, lamports: a.lamports, executable: false }, TOKEN_2022_PROGRAM_ID);
    const c = getScaledUiAmountConfig(mint);
    out.set(mints[i], !c ? 1 : at / 1000 >= Number(c.newMultiplierEffectiveTimestamp) ? c.newMultiplier : c.multiplier);
  });
  return out;
}
