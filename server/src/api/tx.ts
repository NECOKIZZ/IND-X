// Transaction plans: unsigned v0 transactions for the wallet to sign, built
// with the league's lookup table. The server checks what it can first
// (round open, balances, basket rules) so the wallet never signs a
// transaction that would fail.

import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { createSyncNativeInstruction, createTransferCheckedInstruction, createMintToInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  DEFAULT_RULES,
  MAX_CREATOR_BUY_FEE_BPS,
  NATIVE_SOL_MINT,
  basketEligibility,
  fitBasket,
  normaliseWeights,
  splitBuy,
  teamKeyFromWeights,
  toUnits,
  type BackRequest,
  type BuyRequest,
  type CreateRequest,
  type TxPlan,
} from "@indx/core";
import type { League } from "../league.js";
import { buildTx, txFromBase64, txToBase64 } from "../chain/io.js";
import { ensureAtaIx } from "../chain/setup.js";
import { planBasketBuy } from "../jupiter.js";
import { livePrices } from "./live.js";
import { HttpError, invalidateRound, phaseOf } from "./views.js";

const pk = (s: string, what = "address") => {
  try {
    return new PublicKey(s);
  } catch {
    throw new HttpError(400, `bad ${what}`);
  }
};

async function openRoundId(L: League, roundId?: string): Promise<bigint> {
  const cfg = await L.reader.config();
  if (!cfg || cfg.roundCount === 0n) throw new HttpError(409, "no round is open");
  if (cfg.paused) throw new HttpError(409, "the league is paused");
  const id = roundId ? BigInt(roundId) : cfg.roundCount;
  const r = await L.reader.round(id);
  if (!r) throw new HttpError(404, `no round ${id}`);
  if (phaseOf(r, await L.io.now()) !== "open") throw new HttpError(409, `round ${id} is not taking entries`);
  return id;
}

async function plan(L: League, payer: PublicKey, ixs: TransactionInstruction[], cuLimit?: number) {
  return txToBase64(await buildTx(L.io, { payer, instructions: ixs, lookupTables: await L.lookupTables(), cuLimit }));
}

async function usdcBalance(L: League, wallet: PublicKey) {
  return L.reader.tokenBalance(L.b.stakeAta(wallet));
}

/** SOL kept in the wallet for network fees when wrapping SOL into a basket. */
export const GAS_RESERVE_LAMPORTS = 50_000_000n;

export interface BasketQuote {
  weights: number[];
  /** The largest basket the wallet can lock at these weights (USD). */
  maxUsd: number;
  /** The basket the next transaction will lock (USD), capped at the request. */
  usd: number;
  legs: { mint: string; symbol: string; weightBps: number; amountRaw: string; uiAmount: number; usd: number; heldRaw: string; buyRaw: string; buyUsd: number }[];
  /** Mainnet only: SOL to wrap into the SOL leg before locking (lamports). */
  wrapLamports: string;
  /** With buy: USDC spent swapping into the missing stocks (USD). */
  buyUsd: number;
  /** The wallet's USDC (USD). */
  usdcUsd: number;
}

export interface QuoteOpts {
  /** Buy what's missing with USDC instead of capping at the wallet's balances. */
  buy?: boolean;
  /** With buy: use stocks already in the wallet first. */
  useHeld?: boolean;
}

/** Mainnet swaps get this much headroom so slippage never leaves a leg short. */
const SWAP_HEADROOM_BPS = 150n;

/**
 * What a create transaction will lock for this wallet: per-leg amounts from
 * the user's intent (USD × weights at live prices), capped by what the
 * wallet holds. The Build screen shows this and planCreate builds from it,
 * so the screen always shows exactly what will be signed. Never locks a
 * wallet's whole balance unless asked for the max.
 */
export async function quoteBasket(L: League, walletStr: string | undefined, legsReq: CreateRequest["legs"], usd?: number, opts: QuoteOpts = {}): Promise<BasketQuote> {
  const n = legsReq?.length ?? 0;
  if (n < DEFAULT_RULES.minTokens || n > 10) throw new HttpError(400, `a basket holds ${DEFAULT_RULES.minTokens}–10 tokens`);
  const mints = legsReq.map((l) => l.mint);
  if (new Set(mints).size !== n) throw new HttpError(400, "each token once");
  const assets = mints.map((m) => L.assetByMint(m) ?? (() => { throw new HttpError(400, `token ${m} is not in the league`); })());
  const weights = normaliseWeights(legsReq.map((l) => l.weightBps));
  const wallet = walletStr ? pk(walletStr, "wallet") : null;
  const live = await livePrices(L);
  const held = wallet
    ? await Promise.all(assets.map((a) => L.reader.tokenBalance(getAssociatedTokenAddressSync(new PublicKey(a.mint), wallet, true, L.b.tokenProgramOf(new PublicKey(a.mint))))))
    : assets.map(() => 0n);
  // Mainnet SOL leg: the wallet's own SOL counts too (it's wrapped on lock), minus a gas reserve.
  const solIdx = L.cluster === "mainnet" ? assets.findIndex((a) => a.mint === NATIVE_SOL_MINT) : -1;
  let spendableSol = 0n;
  if (solIdx >= 0 && wallet) {
    const acc = await L.io.getAccount(wallet);
    spendableSol = BigInt(acc?.lamports ?? 0) > GAS_RESERVE_LAMPORTS ? BigInt(acc!.lamports) - GAS_RESERVE_LAMPORTS : 0n;
  }
  const raws = held.map((h, i) => (i === solIdx ? h + spendableSol : h));
  const legs = assets.map((a, i) => {
    const p = live.sample.get(a.mint);
    if (!p || p.value === 0n) throw new HttpError(503, `no price for ${a.symbol} right now`);
    return { raw: raws[i], decimals: a.decimals, price: Number(p.value) / 1e18, weightBps: weights[i] };
  });
  const usdcRaw = wallet ? await usdcBalance(L, wallet) : 0n;
  const usdcUsd = Number(usdcRaw) / 10 ** L.deployment.stakeDecimals;
  if (opts.buy) {
    // Size the basket from the requested dollars, then buy whatever the
    // wallet doesn't already cover. Only these amounts are ever locked.
    if (!usd || usd <= 0) throw new HttpError(400, "how much do you want to put in?");
    const BIG = 10n ** 30n;
    const fit = fitBasket(legs.map((l) => ({ ...l, raw: BIG })), usd);
    const out = assets.map((a, i) => {
      const want = fit.amounts[i];
      const have = opts.useHeld ? (raws[i] < want ? raws[i] : want) : 0n;
      const buyRaw = want - have;
      const buyUsd = (Number(buyRaw) / 10 ** a.decimals) * legs[i].price;
      return { a, want, buyRaw, buyUsd };
    });
    const buyUsd = out.reduce((s, l) => s + l.buyUsd, 0);
    return {
      weights,
      maxUsd: fit.usd,
      usd: fit.usd,
      legs: out.map((l, i) => ({
        mint: l.a.mint,
        symbol: l.a.symbol,
        weightBps: weights[i],
        amountRaw: l.want.toString(),
        uiAmount: Number(l.want) / 10 ** l.a.decimals,
        usd: (Number(l.want) / 10 ** l.a.decimals) * legs[i].price,
        heldRaw: raws[i].toString(),
        buyRaw: l.buyRaw.toString(),
        buyUsd: l.buyUsd,
      })),
      wrapLamports: "0",
      buyUsd,
      usdcUsd,
    };
  }
  const fit = fitBasket(legs, usd);
  const wrap = solIdx >= 0 && fit.amounts[solIdx] > held[solIdx] ? fit.amounts[solIdx] - held[solIdx] : 0n;
  return {
    weights,
    maxUsd: fit.maxUsd,
    usd: fit.usd,
    legs: assets.map((a, i) => ({
      mint: a.mint,
      symbol: a.symbol,
      weightBps: weights[i],
      amountRaw: fit.amounts[i].toString(),
      uiAmount: Number(fit.amounts[i]) / 10 ** a.decimals,
      usd: (Number(fit.amounts[i]) / 10 ** a.decimals) * legs[i].price,
      heldRaw: raws[i].toString(),
      buyRaw: "0",
      buyUsd: 0,
    })),
    wrapLamports: wrap.toString(),
    buyUsd: 0,
    usdcUsd,
  };
}

/**
 * Instructions that buy exact token amounts with the wallet's USDC on a test
 * cluster: the test desk takes the USDC at live prices and mints the tokens
 * (the server co-signs as their mint authority).
 */
async function deskBuyIxs(L: League, wallet: PublicKey, buys: { mint: string; raw: bigint }[]): Promise<{ ixs: TransactionInstruction[]; costRaw: bigint }> {
  if (!L.faucet) throw new HttpError(501, "buying needs Jupiter (mainnet) or the test desk (FAUCET_KEYPAIR)");
  const live = await livePrices(L);
  const desk = L.faucet.publicKey;
  const dec = L.deployment.stakeDecimals;
  const stakeMint = L.b.env.stakeMint;
  const ixs: TransactionInstruction[] = [];
  let costRaw = 0n;
  for (const b of buys) {
    if (b.raw <= 0n) continue;
    const a = L.assetByMint(b.mint)!;
    const p = live.sample.get(b.mint);
    if (!p || p.value === 0n) throw new HttpError(503, `no price for ${a.symbol}`);
    // usdc raw = token raw × (USD per whole raw token) / 10^decimals, rounded up
    const div = 10n ** BigInt(12 + a.decimals) * 10n ** BigInt(6 - dec);
    costRaw += (b.raw * p.value + div - 1n) / div;
    const m = new PublicKey(b.mint);
    const tp = L.b.tokenProgramOf(m);
    ixs.push(ensureAtaIx(wallet, wallet, m, tp), createMintToInstruction(m, getAssociatedTokenAddressSync(m, wallet, true, tp), desk, b.raw, [], tp));
  }
  if (costRaw > 0n) {
    ixs.unshift(ensureAtaIx(wallet, desk, stakeMint, L.b.env.stakeTokenProgram), createTransferCheckedInstruction(L.b.stakeAta(wallet), stakeMint, L.b.stakeAta(desk), wallet, costRaw, dec, [], L.b.env.stakeTokenProgram));
  }
  return { ixs, costRaw };
}

export async function planCreate(L: League, req: CreateRequest): Promise<TxPlan> {
  const wallet = pk(req.wallet, "wallet");
  const roundId = await openRoundId(L, req.roundId);
  const round = (await L.reader.round(roundId))!;
  const name = (req.name ?? "").trim();
  if (!name || Buffer.byteLength(name) > 32) throw new HttpError(400, "name: 1–32 bytes");
  const fee = Math.round(req.buyFeeBps ?? 100);
  if (fee < 0 || fee > MAX_CREATOR_BUY_FEE_BPS) throw new HttpError(400, "buy fee: 0–2%");
  if (await L.reader.entry(roundId, wallet)) throw new HttpError(409, "you're already in this round");

  const q = await quoteBasket(L, req.wallet, req.legs, req.usd, { buy: req.buy, useHeld: req.useHeld });
  const mints = q.legs.map((l) => l.mint);
  const weights = q.weights;
  const minUsd = Number(DEFAULT_RULES.minValue / 10n ** 18n);
  if (q.usd < minUsd) {
    throw new HttpError(409, req.buy ? `put in at least $${minUsd}` : `you need at least $${minUsd} of this basket at these weights (you can lock $${q.maxUsd.toFixed(2)})`);
  }
  // Rules apply to the declared weights (the locked amounts match them to rounding).
  const totalE18 = BigInt(Math.round(q.usd * 1e6)) * 10n ** 12n;
  const values = weights.map((w) => (totalE18 * BigInt(w)) / 10_000n);
  const crypto = L.assets.filter((a) => a.kind === "crypto").map((a) => a.mint);
  const bad = basketEligibility(mints, values, { ...DEFAULT_RULES, cryptoTokens: crypto });
  if (bad) throw new HttpError(400, `basket not allowed: ${bad}`);
  const dec = L.deployment.stakeDecimals;
  const usdc = await usdcBalance(L, wallet);
  const buys = q.legs.map((l) => ({ mint: l.mint, raw: BigInt(l.buyRaw) }));
  const buying = buys.some((b) => b.raw > 0n);
  const buyRaw = BigInt(Math.ceil(q.buyUsd * 10 ** dec));
  const needUsdc = round.stake + (L.cluster === "mainnet" ? (buyRaw * (10_000n + SWAP_HEADROOM_BPS)) / 10_000n : buyRaw);
  if (usdc < needUsdc) {
    throw new HttpError(409, buying ? `you need ${toUnits(needUsdc, dec).toFixed(2)} USDC (stocks + ticket) and have ${toUnits(usdc, dec).toFixed(2)}` : `you need ${toUnits(round.stake, dec)} USDC for the ticket`);
  }

  const teamKey = teamKeyFromWeights(mints, weights);
  const existing = await L.reader.team(roundId, teamKey);
  if (existing && existing.members >= round.maxBackers) throw new HttpError(409, "that ETF is full");
  const pre: string[] = [];
  let deskSigned = false;
  const ixs: TransactionInstruction[] = [];
  if (buying && L.cluster === "mainnet") {
    // Jupiter swaps first (their own transactions), then the lock.
    const active = buys.filter((b) => b.raw > 0n);
    const legUsd = active.map((b) => q.legs.find((l) => l.mint === b.mint)!.buyUsd);
    const sum = legUsd.reduce((a, b) => a + b, 0);
    const w = normaliseWeights(legUsd.map((u) => Math.max(1, Math.round((u / sum) * 10_000))));
    const spend = (buyRaw * (10_000n + SWAP_HEADROOM_BPS)) / 10_000n;
    pre.push(...(await planBasketBuy(wallet.toBase58(), L.b.env.stakeMint.toBase58(), active.map((b) => b.mint), w, spend, 100)).transactions);
  } else if (buying) {
    ixs.push(...(await deskBuyIxs(L, wallet, buys)).ixs);
    deskSigned = true;
  }
  const wrap = BigInt(q.wrapLamports);
  if (wrap > 0n) {
    // Wrap just enough SOL for the SOL leg.
    const sol = new PublicKey(NATIVE_SOL_MINT);
    const ata = getAssociatedTokenAddressSync(sol, wallet, true, TOKEN_PROGRAM_ID);
    ixs.push(ensureAtaIx(wallet, wallet, sol, TOKEN_PROGRAM_ID), SystemProgram.transfer({ fromPubkey: wallet, toPubkey: ata, lamports: wrap }), createSyncNativeInstruction(ata));
  }
  const enter = await L.b.enterCreator(wallet, roundId, teamKey, q.legs.map((l, i) => ({ mint: new PublicKey(l.mint), amount: BigInt(l.amountRaw), weightBps: weights[i] })), name, fee);
  let transactions: string[];
  if (!deskSigned) transactions = [...pre, await plan(L, wallet, [...ixs, enter])];
  else {
    // One transaction when it fits; otherwise the buy, then the lock.
    const lut = await L.lookupTables();
    const signedTx = async (list: TransactionInstruction[]) => {
      const tx = await buildTx(L.io, { payer: wallet, instructions: list, lookupTables: lut, cuLimit: 600_000 });
      tx.sign([L.faucet!]);
      if (tx.serialize().length > 1232) throw new Error("too big for one transaction");
      return txToBase64(tx);
    };
    try {
      transactions = [await signedTx([...ixs, enter])];
    } catch {
      transactions = [await signedTx(ixs), await plan(L, wallet, [enter])];
    }
  }
  const ticket = toUnits(round.stake, dec);
  const bought = buying ? ` (buys $${q.buyUsd.toFixed(2)} of stocks with USDC)` : "";
  return {
    transactions,
    summary: existing
      ? `Same basket as “${existing.name}”: you join that ETF as a co-creator. Locks $${q.usd.toFixed(2)} of stocks${bought} + a $${ticket} ticket.`
      : `Creates “${name}”: locks $${q.usd.toFixed(2)} of stocks${bought} + a $${ticket} ticket.`,
    meta: { roundId: roundId.toString(), teamKey, clone: !!existing, basketUsd: q.usd, maxUsd: q.maxUsd, amounts: q.legs.map((l) => l.amountRaw), weightsBps: weights, quote: q },
  };
}

export async function planBack(L: League, req: BackRequest): Promise<TxPlan> {
  const wallet = pk(req.wallet, "wallet");
  const roundId = await openRoundId(L, req.roundId);
  const round = (await L.reader.round(roundId))!;
  const team = await L.reader.team(roundId, req.etfKey.toLowerCase());
  if (!team) throw new HttpError(404, "no such ETF in this round");
  if (team.members >= round.maxBackers) throw new HttpError(409, "that ETF is full");
  if (await L.reader.entry(roundId, wallet)) throw new HttpError(409, "you're already in this round");
  if ((await usdcBalance(L, wallet)) < round.stake) throw new HttpError(409, `you need ${toUnits(round.stake, L.deployment.stakeDecimals)} USDC for the ticket`);
  const ix = await L.b.enterBacker(wallet, roundId, team.key);
  return {
    transactions: [await plan(L, wallet, [ix])],
    summary: `Back “${team.name}” with a $${toUnits(round.stake, L.deployment.stakeDecimals)} ticket.`,
    meta: { roundId: roundId.toString(), teamKey: team.key },
  };
}

export async function planClaim(L: League, walletStr: string, roundIdStr: string): Promise<TxPlan> {
  const wallet = pk(walletStr, "wallet");
  const roundId = BigInt(roundIdStr);
  const round = await L.reader.round(roundId);
  if (!round || (round.status !== "settled" && round.status !== "voided")) throw new HttpError(409, "the round isn't settled yet");
  const e = await L.reader.entry(roundId, wallet);
  if (!e) throw new HttpError(404, "nothing to claim (already paid?)");
  const ixs: TransactionInstruction[] = [];
  if (!e.claimed) ixs.push(ensureAtaIx(wallet, wallet, L.b.env.stakeMint, L.b.env.stakeTokenProgram), await L.b.claim(wallet, roundId));
  const back = e.basket.filter((l) => !l.returned).map((l) => l.mint);
  if (back.length) {
    for (const m of back) ixs.push(ensureAtaIx(wallet, wallet, m, L.b.tokenProgramOf(m)));
    ixs.push(await L.b.returnBasket(wallet, wallet, roundId, back));
  }
  if (!ixs.length) throw new HttpError(404, "nothing to claim");
  return { transactions: [await plan(L, wallet, ixs)], summary: "Collect your payout and basket.", meta: { roundId: roundIdStr } };
}

export async function planBoost(L: League, walletStr: string, roundIdStr: string | undefined, usd: number): Promise<TxPlan> {
  const wallet = pk(walletStr, "wallet");
  const cfg = await L.reader.config();
  const roundId = roundIdStr ? BigInt(roundIdStr) : cfg?.roundCount ?? 0n;
  const round = await L.reader.round(roundId);
  if (!round || round.status !== "open") throw new HttpError(409, "that round can't be boosted");
  const amount = BigInt(Math.round(usd * 10 ** L.deployment.stakeDecimals));
  if (amount <= 0n) throw new HttpError(400, "amount must be positive");
  if ((await usdcBalance(L, wallet)) < amount) throw new HttpError(409, "not enough USDC");
  return { transactions: [await plan(L, wallet, [await L.b.boostRound(wallet, roundId, amount)])], summary: `Add $${usd} to round ${roundId}'s pot.` };
}

/**
 * Buy a basket. Mainnet: Jupiter swaps, plus the creator's buy fee as a
 * USDC transfer to them. Test clusters: the test desk sells test tokens at
 * live prices (the server co-signs as their mint authority).
 */
export async function planBuy(L: League, req: BuyRequest): Promise<TxPlan> {
  const wallet = pk(req.wallet, "wallet");
  let mints: string[];
  let weights: number[];
  let creator: PublicKey | null = null;
  let feeBps = 0;
  let name = "basket";
  if (req.etfKey) {
    const cfg = await L.reader.config();
    const roundId = req.roundId ? BigInt(req.roundId) : cfg?.roundCount ?? 0n;
    const team = await L.reader.team(roundId, req.etfKey.toLowerCase());
    if (!team) throw new HttpError(404, "no such ETF");
    mints = team.legs.map((l) => l.mint.toBase58());
    weights = team.legs.map((l) => l.weightBps);
    creator = team.captain.equals(wallet) ? null : team.captain;
    feeBps = creator ? team.buyFeeBps : 0;
    name = `“${team.name}”`;
  } else if (req.legs?.length) {
    mints = req.legs.map((l) => l.mint);
    weights = normaliseWeights(req.legs.map((l) => l.weightBps));
    for (const m of mints) if (!L.assetByMint(m)) throw new HttpError(400, `token ${m} is not in the league`);
  } else throw new HttpError(400, "etfKey or legs required");

  const dec = L.deployment.stakeDecimals;
  const total = BigInt(Math.round(req.usd * 10 ** dec));
  if (total < 10n ** BigInt(dec)) throw new HttpError(400, "buy at least $1");
  if ((await usdcBalance(L, wallet)) < total) throw new HttpError(409, "not enough USDC");
  const fee = (total * BigInt(feeBps)) / 10_000n;
  const spend = total - fee;
  const stakeMint = L.b.env.stakeMint;
  const feeIxs: TransactionInstruction[] = [];
  if (creator && fee > 0n) {
    feeIxs.push(
      ensureAtaIx(wallet, creator, stakeMint, L.b.env.stakeTokenProgram),
      createTransferCheckedInstruction(L.b.stakeAta(wallet), stakeMint, L.b.stakeAta(creator), wallet, fee, dec, [], L.b.env.stakeTokenProgram),
    );
  }

  if (L.cluster === "mainnet") {
    const buy = await planBasketBuy(wallet.toBase58(), stakeMint.toBase58(), mints, weights, spend, req.slippageBps ?? 100);
    const txs = feeIxs.length ? [await plan(L, wallet, feeIxs, 100_000), ...buy.transactions] : buy.transactions;
    return {
      transactions: txs,
      summary: `Buy $${req.usd} of ${name} through Jupiter${fee > 0n ? ` (creator fee $${toUnits(fee, dec).toFixed(2)})` : ""}.`,
      meta: { legs: buy.legs.map((l) => ({ ...l, amountIn: l.amountIn.toString(), outAmount: l.outAmount.toString() })), feeUsd: toUnits(fee, dec) },
    };
  }

  // Test desk.
  if (!L.faucet) throw new HttpError(501, "buying needs Jupiter (mainnet) or the test desk (FAUCET_KEYPAIR)");
  const live = await livePrices(L);
  const desk = L.faucet.publicKey;
  const ixs: TransactionInstruction[] = [...feeIxs, ensureAtaIx(wallet, desk, stakeMint, L.b.env.stakeTokenProgram), createTransferCheckedInstruction(L.b.stakeAta(wallet), stakeMint, L.b.stakeAta(desk), wallet, spend, dec, [], L.b.env.stakeTokenProgram)];
  const legs = splitBuy(mints, weights, spend).map((l) => {
    const a = L.assetByMint(l.mint)!;
    const p = live.sample.get(l.mint);
    if (!p || p.value === 0n) throw new HttpError(503, `no price for ${a.symbol}`);
    // raw out = usd in / (USD per whole raw token) × 10^decimals
    const out = (l.amountIn * 10n ** BigInt(12 + a.decimals) * 10n ** BigInt(6 - dec)) / p.value;
    return { mint: l.mint, amountIn: l.amountIn, outAmount: out, priceImpactPct: 0, a };
  });
  for (const l of legs) {
    const m = new PublicKey(l.mint);
    const tp = L.b.tokenProgramOf(m);
    ixs.push(ensureAtaIx(wallet, wallet, m, tp), createMintToInstruction(m, getAssociatedTokenAddressSync(m, wallet, true, tp), desk, l.outAmount, [], tp));
  }
  const tx = await buildTx(L.io, { payer: wallet, instructions: ixs, lookupTables: await L.lookupTables(), cuLimit: 400_000 });
  tx.sign([L.faucet]);
  return {
    transactions: [txToBase64(tx)],
    summary: `Buy $${req.usd} of ${name} at live prices (test desk)${fee > 0n ? `, creator fee $${toUnits(fee, dec).toFixed(2)}` : ""}.`,
    meta: { legs: legs.map((l) => ({ mint: l.mint, amountIn: l.amountIn.toString(), outAmount: l.outAmount.toString(), priceImpactPct: 0 })), feeUsd: toUnits(fee, dec), testDesk: true },
  };
}

/** Test clusters: SOL for fees and 100 test USDC, once an hour per wallet. */
export async function faucet(L: League, walletStr: string): Promise<{ signature: string; usdc: number; sol: number }> {
  if (!L.deployment.faucet || !L.faucet) throw new HttpError(404, "no faucet on this cluster");
  const wallet = pk(walletStr, "wallet");
  const bucket = Math.floor(Date.now() / 3_600_000);
  if (!(await L.store.firstTime(`faucet/${walletStr}/${bucket}`))) {
    const mins = Math.max(1, Math.ceil(((bucket + 1) * 3_600_000 - Date.now()) / 60_000));
    throw new HttpError(429, `You've had test funds this hour. More in ${mins} min.`);
  }
  const usdc = 100;
  const sol = 0.05;
  const stakeMint = L.b.env.stakeMint;
  const ixs: TransactionInstruction[] = [
    ensureAtaIx(L.faucet.publicKey, wallet, stakeMint, L.b.env.stakeTokenProgram),
    createMintToInstruction(stakeMint, L.b.stakeAta(wallet), L.faucet.publicKey, BigInt(usdc * 10 ** L.deployment.stakeDecimals), [], L.b.env.stakeTokenProgram),
  ];
  // SOL for network fees, topped up when low (from the faucet's own SOL
  // while it has plenty, otherwise from the cluster's airdrop).
  const solAcc = await L.io.getAccount(wallet);
  const needSol = (solAcc?.lamports ?? 0) < 0.03e9;
  const deskSol = (await L.io.getAccount(L.faucet.publicKey))?.lamports ?? 0;
  const fromDesk = needSol && deskSol > 0.5e9;
  if (fromDesk) ixs.push(SystemProgram.transfer({ fromPubkey: L.faucet.publicKey, toPubkey: wallet, lamports: sol * 1e9 }));
  const tx = await buildTx(L.io, { payer: L.faucet.publicKey, instructions: ixs });
  tx.sign([L.faucet]);
  const signature = await L.io.send(tx);
  let gotSol = fromDesk ? sol : 0;
  if (needSol && !fromDesk && L.io.requestAirdrop) gotSol = (await L.io.requestAirdrop(wallet, sol * 1e9).then(() => true, () => false)) ? sol : 0;
  return { signature, usdc, sol: gotSol };
}

/** Relay a wallet-signed transaction (so the app needs no RPC of its own). */
export async function relay(L: League, b64: string): Promise<string> {
  let tx;
  try {
    tx = txFromBase64(b64);
  } catch {
    throw new HttpError(400, "bad transaction");
  }
  // Only transactions that touch the league, the test desk or Jupiter are relayed.
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  const allowed = [L.b.env.programId.toBase58(), L.deployment.stakeMint, ...L.assets.map((a) => a.mint), "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"];
  if (!keys.some((k) => allowed.includes(k)) && !tx.message.addressTableLookups.length) throw new HttpError(400, "not a league transaction");
  try {
    const sig = await L.io.send(tx);
    invalidateRound();
    return sig;
  } catch (e) {
    throw new HttpError(400, (e as Error).message.split("\n").slice(0, 3).join(" "));
  }
}
