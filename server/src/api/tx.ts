// Transaction plans: unsigned v0 transactions for the wallet to sign, built
// with the league's lookup table. The server checks what it can first
// (round open, balances, basket rules) so the wallet never signs a
// transaction that would fail.

import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { createTransferCheckedInstruction, createMintToInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  DEFAULT_RULES,
  MAX_CREATOR_BUY_FEE_BPS,
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

export async function planCreate(L: League, req: CreateRequest): Promise<TxPlan> {
  const wallet = pk(req.wallet, "wallet");
  const roundId = await openRoundId(L, req.roundId);
  const round = (await L.reader.round(roundId))!;
  const n = req.legs?.length ?? 0;
  if (n < DEFAULT_RULES.minTokens || n > 10) throw new HttpError(400, `a basket holds ${DEFAULT_RULES.minTokens}–10 tokens`);
  const mints = req.legs.map((l) => l.mint);
  if (new Set(mints).size !== n) throw new HttpError(400, "each token once");
  const assets = mints.map((m) => L.assetByMint(m) ?? (() => { throw new HttpError(400, `token ${m} is not in the league`); })());
  const weights = normaliseWeights(req.legs.map((l) => l.weightBps));
  const name = (req.name ?? "").trim();
  if (!name || Buffer.byteLength(name) > 32) throw new HttpError(400, "name: 1–32 bytes");
  const fee = Math.round(req.buyFeeBps ?? 100);
  if (fee < 0 || fee > MAX_CREATOR_BUY_FEE_BPS) throw new HttpError(400, "buy fee: 0–2%");
  if (await L.reader.entry(roundId, wallet)) throw new HttpError(409, "you're already in this round");

  const live = await livePrices(L);
  const raws = await Promise.all(assets.map((a) => L.reader.tokenBalance(getAssociatedTokenAddressSync(new PublicKey(a.mint), wallet, true, L.b.tokenProgramOf(new PublicKey(a.mint))))));
  const legs = assets.map((a, i) => {
    const p = live.sample.get(a.mint);
    if (!p || p.value === 0n) throw new HttpError(503, `no price for ${a.symbol} right now`);
    return { raw: raws[i], decimals: a.decimals, price: Number(p.value) / 1e18, weightBps: weights[i] };
  });
  const fit = fitBasket(legs, req.usd);
  const minUsd = Number(DEFAULT_RULES.minValue / 10n ** 18n);
  if (fit.usd < minUsd) {
    throw new HttpError(409, `you need at least $${minUsd} of this basket at these weights (you can lock $${fit.maxUsd.toFixed(2)}). Buy the stocks first.`);
  }
  // Rules apply to the declared weights (the locked amounts match them to rounding).
  const totalE18 = BigInt(Math.round(fit.usd * 1e6)) * 10n ** 12n;
  const values = weights.map((w) => (totalE18 * BigInt(w)) / 10_000n);
  const crypto = L.assets.filter((a) => a.kind === "crypto").map((a) => a.mint);
  const bad = basketEligibility(mints, values, { ...DEFAULT_RULES, cryptoTokens: crypto });
  if (bad) throw new HttpError(400, `basket not allowed: ${bad}`);
  if ((await usdcBalance(L, wallet)) < round.stake) throw new HttpError(409, `you need ${toUnits(round.stake, L.deployment.stakeDecimals)} USDC for the ticket`);

  const teamKey = teamKeyFromWeights(mints, weights);
  const existing = await L.reader.team(roundId, teamKey);
  if (existing && existing.members >= round.maxBackers) throw new HttpError(409, "that ETF is full");
  const ix = await L.b.enterCreator(wallet, roundId, teamKey, assets.map((a, i) => ({ mint: new PublicKey(a.mint), amount: fit.amounts[i], weightBps: weights[i] })), name, fee);
  return {
    transactions: [await plan(L, wallet, [ix])],
    summary: existing
      ? `Same basket as “${existing.name}”: you join that ETF as a co-creator. Locks $${fit.usd.toFixed(2)} of stocks + a $${toUnits(round.stake, L.deployment.stakeDecimals)} ticket.`
      : `Creates “${name}”: locks $${fit.usd.toFixed(2)} of stocks + a $${toUnits(round.stake, L.deployment.stakeDecimals)} ticket.`,
    meta: { roundId: roundId.toString(), teamKey, clone: !!existing, basketUsd: fit.usd, maxUsd: fit.maxUsd, amounts: fit.amounts.map(String), weightsBps: weights },
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
  if (!(await L.store.firstTime(`faucet/${walletStr}/${bucket}`))) throw new HttpError(429, "one faucet drip per hour");
  const usdc = 100;
  const sol = 0.05;
  const stakeMint = L.b.env.stakeMint;
  const ixs: TransactionInstruction[] = [
    ensureAtaIx(L.faucet.publicKey, wallet, stakeMint, L.b.env.stakeTokenProgram),
    createMintToInstruction(stakeMint, L.b.stakeAta(wallet), L.faucet.publicKey, BigInt(usdc * 10 ** L.deployment.stakeDecimals), [], L.b.env.stakeTokenProgram),
  ];
  const solAcc = await L.io.getAccount(wallet);
  if ((solAcc?.lamports ?? 0) < 0.02e9) ixs.push(SystemProgram.transfer({ fromPubkey: L.faucet.publicKey, toPubkey: wallet, lamports: sol * 1e9 }));
  const tx = await buildTx(L.io, { payer: L.faucet.publicKey, instructions: ixs });
  tx.sign([L.faucet]);
  return { signature: await L.io.send(tx), usdc, sol: (solAcc?.lamports ?? 0) < 0.02e9 ? sol : 0 };
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
