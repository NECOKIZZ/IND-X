// Display helpers.

export function usd(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "+5.20%" / "−1.03%". */
export function pct(p: number | null | undefined, digits = 2): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  const s = Math.abs(p).toFixed(digits);
  // A move that rounds to zero shows as 0, never "−0.00%".
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;
  return p > 0 ? `+${s}%` : `−${s}%`;
}

export const short = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);

export const bpsToPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/** "2d 4h", "3h 12m", "45s". */
export function countdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function when(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
