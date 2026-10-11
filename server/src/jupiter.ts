// Buy a basket through Jupiter (mainnet): one USDC → token swap per leg,
// split by weight. Each swap is its own transaction (Jupiter routes can be
// large); the wallet signs them all in one approval.

import { splitBuy } from "@indx/core";

const base = () => (process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag");
const headers = (): Record<string, string> => ({
  "content-type": "application/json",
  ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
});

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  [k: string]: unknown;
}

export async function quote(inputMint: string, outputMint: string, amount: bigint, slippageBps = 100): Promise<JupQuote> {
  const qs = new URLSearchParams({ inputMint, outputMint, amount: amount.toString(), slippageBps: String(slippageBps), restrictIntermediateTokens: "true" });
  const res = await fetch(`${base()}/swap/v1/quote?${qs}`, { headers: headers() });
  if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${await res.text()}`);
  return (await res.json()) as JupQuote;
}

/** The swap transaction (base64, unsigned v0) for a quote. */
export async function swapTx(q: JupQuote, user: string): Promise<string> {
  const res = await fetch(`${base()}/swap/v1/swap`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      quoteResponse: q,
      userPublicKey: user,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "medium" } },
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { swapTransaction: string }).swapTransaction;
}

export interface BasketBuy {
  legs: { mint: string; amountIn: bigint; outAmount: bigint; priceImpactPct: number }[];
  transactions: string[];
}

/** Quotes and swap transactions for `total` USDC split across the basket. */
export async function planBasketBuy(user: string, usdcMint: string, mints: string[], weightsBps: number[], total: bigint, slippageBps = 100): Promise<BasketBuy> {
  const split = splitBuy(mints, weightsBps, total);
  const quotes = await Promise.all(split.map((l) => quote(usdcMint, l.mint, l.amountIn, slippageBps)));
  const transactions = await Promise.all(quotes.map((q) => swapTx(q, user)));
  return {
    legs: split.map((l, i) => ({ mint: l.mint, amountIn: l.amountIn, outAmount: BigInt(quotes[i].outAmount), priceImpactPct: Number(quotes[i].priceImpactPct) * 100 })),
    transactions,
  };
}
