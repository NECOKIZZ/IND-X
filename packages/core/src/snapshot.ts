// Price snapshots for scoring a round.
//
// A "sample" is one read of every scored token's price. A snapshot averages
// several samples over a window so one odd print can't swing a round.
//
// Value = USD per whole *raw* token, 1e18 fixed point: the market (UI) price
// times the token's ScaledUiAmount multiplier. xStocks pay dividends and
// apply splits by raising the multiplier, so a locked raw amount is worth
// raw × multiplier × price and returns are total returns.

export interface PriceSample {
  token: string;     // mint (base58)
  value: bigint;     // USD per whole raw token, 1e18
  decimals: number;
  /** UI price (USD) and multiplier the value was built from. */
  uiPrice?: number;
  multiplier?: number;
  trading: boolean;  // a fresh price that can be used to score
  at: number;        // unix ms when sampled
  source?: string;
}

export interface Snapshot {
  token: string;
  value: bigint; // mean of the sample values, 1e18
  decimals: number;
  samples: number;
}

export type SnapshotProblem = { token: string; reason: "missing" | "not-trading" | "too-few-samples" };

/**
 * Average the samples for each token. A token is a problem (and voids any
 * round that scores it) if it is missing, ever not trading, or has fewer than
 * `minSamples` samples.
 */
export function buildSnapshot(
  samples: Map<string, PriceSample>[],
  tokens: string[],
  minSamples: number,
): { prices: Map<string, Snapshot>; problems: SnapshotProblem[] } {
  const prices = new Map<string, Snapshot>();
  const problems: SnapshotProblem[] = [];
  for (const token of tokens) {
    const got = samples.map((s) => s.get(token)).filter((x): x is PriceSample => !!x);
    if (got.length === 0) {
      problems.push({ token, reason: "missing" });
      continue;
    }
    if (got.some((g) => !g.trading)) {
      problems.push({ token, reason: "not-trading" });
      continue;
    }
    if (got.length < minSamples) {
      problems.push({ token, reason: "too-few-samples" });
      continue;
    }
    const sum = got.reduce((acc, g) => acc + g.value, 0n);
    prices.set(token, { token, value: sum / BigInt(got.length), decimals: got[0].decimals, samples: got.length });
  }
  return { prices, problems };
}

/** USD value (1e18) of `amount` raw base units of a token at `price`. */
export const valueOf = (amount: bigint, price: Pick<Snapshot, "value" | "decimals">): bigint =>
  (amount * price.value) / 10n ** BigInt(price.decimals);

/** 1e18 fixed point from a float USD price × multiplier. */
export function toValue(uiPrice: number, multiplier = 1): bigint {
  // 9 significant decimals from the float, then scaled exactly.
  return BigInt(Math.round(uiPrice * multiplier * 1e9)) * 10n ** 9n;
}
