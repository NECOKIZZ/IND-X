// The live pool, @tags and sending tokens between players.

import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { League } from "../league.js";
import { buildTx, txFromBase64, txToBase64 } from "../chain/io.js";
import { ensureAtaIx } from "../chain/setup.js";
import { HttpError, currentRoundId, roundView } from "./views.js";

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const TAG_RE = /^[a-z0-9_]{3,15}$/;

export interface PoolView {
  /** The season pot that tops up thin rounds (USD). */
  seasonUsd: number;
  /** This round's pot of tickets (USD). */
  roundUsd: number;
  roundId: string | null;
}

export async function poolView(L: League): Promise<PoolView> {
  const cfg = await L.reader.config();
  const seasonUsd = cfg ? Number(cfg.seasonPot) / 10 ** L.deployment.stakeDecimals : 0;
  const id = await currentRoundId(L).catch(() => null);
  const r = id === null ? null : await roundView(L, id).catch(() => null);
  return { seasonUsd, roundUsd: r?.potUsd ?? 0, roundId: r?.id ?? null };
}

function pk(s: string, what: string) {
  try {
    return new PublicKey(s);
  } catch {
    throw new HttpError(400, `bad ${what}`);
  }
}

export function normTag(raw: string) {
  const t = raw.trim().replace(/^@/, "").toLowerCase();
  if (!TAG_RE.test(t)) throw new HttpError(400, "a tag is 3–15 letters, digits or _");
  return t;
}

export async function tagOf(L: League, wallet: string): Promise<string | null> {
  return ((await L.store.kv.get(`tagof/${wallet}`)) as string | null) ?? null;
}

export async function resolveTag(L: League, raw: string): Promise<string | null> {
  return ((await L.store.kv.get(`tag/${normTag(raw)}`)) as string | null) ?? null;
}

/** Proof of ownership: the wallet signs (never sends) a memo naming the tag. */
function claimMemo(tag: string, wallet: string) {
  return `indx-tag:@${tag}:${wallet}`;
}

export async function tagChallenge(L: League, body: { wallet: string; tag: string }) {
  const wallet = pk(body.wallet, "wallet");
  const tag = normTag(body.tag);
  const owner = await resolveTag(L, tag);
  if (owner && owner !== wallet.toBase58()) throw new HttpError(409, `@${tag} is taken`);
  const msg = new TransactionMessage({
    payerKey: wallet,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: wallet, isSigner: true, isWritable: false }], data: Buffer.from(claimMemo(tag, wallet.toBase58())) })],
  }).compileToV0Message();
  return { transaction: Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64"), tag };
}

export async function tagClaim(L: League, body: { wallet: string; tag: string; signed: string }) {
  const wallet = pk(body.wallet, "wallet");
  const tag = normTag(body.tag);
  let tx: VersionedTransaction;
  try {
    tx = txFromBase64(body.signed);
  } catch {
    throw new HttpError(400, "bad signed claim");
  }
  const ix = tx.message.compiledInstructions[0];
  const keys = tx.message.staticAccountKeys;
  const ok =
    keys[0]?.equals(wallet) &&
    ix && keys[ix.programIdIndex]?.equals(MEMO) &&
    Buffer.from(ix.data).toString() === claimMemo(tag, wallet.toBase58()) &&
    (await import("tweetnacl")).default.sign.detached.verify(tx.message.serialize(), tx.signatures[0], wallet.toBytes());
  if (!ok) throw new HttpError(400, "the claim isn't signed by this wallet");
  const owner = await resolveTag(L, tag);
  if (owner && owner !== wallet.toBase58()) throw new HttpError(409, `@${tag} is taken`);
  const old = await tagOf(L, wallet.toBase58());
  if (old && old !== tag) await L.store.kv.del(`tag/${old}`);
  await L.store.kv.put(`tag/${tag}`, wallet.toBase58());
  await L.store.kv.put(`tagof/${wallet.toBase58()}`, tag);
  return { tag };
}

/** Send USDC or a league token to an address or a @tag. */
export async function planTransfer(L: League, body: { wallet: string; to: string; mint: string; amount: number }) {
  const wallet = pk(body.wallet, "wallet");
  const toStr = body.to.trim().startsWith("@") ? await resolveTag(L, body.to) : body.to.trim();
  if (!toStr) throw new HttpError(404, `no one has ${body.to.trim()}`);
  const to = pk(toStr, "recipient");
  if (to.equals(wallet)) throw new HttpError(400, "that's your own wallet");
  const stake = body.mint === L.deployment.stakeMint;
  const asset = L.assets.find((a) => a.mint === body.mint);
  if (!stake && !asset) throw new HttpError(400, "only USDC and league tokens can be sent here");
  const decimals = stake ? L.deployment.stakeDecimals : asset!.decimals;
  const program = stake ? L.b.env.stakeTokenProgram : asset!.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const raw = BigInt(Math.round(Number(body.amount) * 10 ** decimals));
  if (!(raw > 0n)) throw new HttpError(400, "enter an amount");
  const mint = new PublicKey(body.mint);
  const fromAta = getAssociatedTokenAddressSync(mint, wallet, true, program);
  const bal = await L.reader.tokenBalance(fromAta).catch(() => 0n);
  if (bal < raw) throw new HttpError(400, "not enough balance");
  const ixs = [ensureAtaIx(wallet, to, mint, program), createTransferCheckedInstruction(fromAta, mint, getAssociatedTokenAddressSync(mint, to, true, program), wallet, raw, decimals, [], program)];
  const symbol = stake ? "USDC" : asset!.symbol;
  return {
    transactions: [txToBase64(await buildTx(L.io, { payer: wallet, instructions: ixs }))],
    summary: `Send ${body.amount} ${symbol} to ${body.to.trim()}`,
    meta: { to: to.toBase58() },
  };
}
