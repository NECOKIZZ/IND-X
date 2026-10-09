// Display helpers shared by the server and the app.

import { RET_SCALE } from "./engine.js";

/** Raw base units → number of whole units. */
export const toUnits = (raw: bigint | string, decimals: number): number => Number(BigInt(raw)) / 10 ** decimals;

/** "$5.00" from raw base units. */
export function formatUsd(raw: bigint | string | number, decimals = 6): string {
  const n = typeof raw === "number" ? raw : toUnits(raw, decimals);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** RET_SCALE fixed point → percent (5.2 = +5.2%). */
export const retToPct = (ret: bigint | string): number => (Number(BigInt(ret)) / Number(RET_SCALE)) * 100;

/** "+5.20%" / "−1.03%". */
export function formatPct(pct: number | null | undefined, digits = 2): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  const s = Math.abs(pct).toFixed(digits);
  return pct > 0 ? `+${s}%` : pct < 0 ? `−${s}%` : `${s}%`;
}

/** "9xQe…k3Fp". */
export const shortAddress = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
