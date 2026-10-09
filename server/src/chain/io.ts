// The few chain operations the league needs, behind one interface, so the
// keeper, API and tests run the same code against an RPC node or LiteSVM.

import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
  type GetProgramAccountsFilter,
  type TransactionInstruction,
} from "@solana/web3.js";

export interface RawAccount {
  pubkey: PublicKey;
  data: Buffer;
  owner: PublicKey;
  lamports: number;
}

export interface ChainIO {
  getAccount(pubkey: PublicKey): Promise<RawAccount | null>;
  getAccounts(pubkeys: PublicKey[]): Promise<(RawAccount | null)[]>;
  getProgramAccounts(programId: PublicKey, filters: GetProgramAccountsFilter[]): Promise<RawAccount[]>;
  latestBlockhash(): Promise<string>;
  /** Send a fully signed transaction and wait for confirmation. Returns the signature. */
  send(tx: VersionedTransaction): Promise<string>;
  /** Unix seconds by the chain's clock. */
  now(): Promise<number>;
  slot(): Promise<number>;
  lookupTable(address: PublicKey): Promise<AddressLookupTableAccount | null>;
}

export class RpcIO implements ChainIO {
  readonly connection: Connection;
  constructor(url: string, private commitment: Commitment = "confirmed") {
    this.connection = new Connection(url, commitment);
  }
  async getAccount(pubkey: PublicKey) {
    const a = await this.connection.getAccountInfo(pubkey);
    return a ? { pubkey, data: a.data, owner: a.owner, lamports: a.lamports } : null;
  }
  async getAccounts(pubkeys: PublicKey[]) {
    const out: (RawAccount | null)[] = [];
    for (let i = 0; i < pubkeys.length; i += 100) {
      const chunk = pubkeys.slice(i, i + 100);
      const got = await this.connection.getMultipleAccountsInfo(chunk);
      got.forEach((a, j) => out.push(a ? { pubkey: chunk[j], data: a.data, owner: a.owner, lamports: a.lamports } : null));
    }
    return out;
  }
  async getProgramAccounts(programId: PublicKey, filters: GetProgramAccountsFilter[]) {
    const got = await this.connection.getProgramAccounts(programId, { filters });
    return got.map((a) => ({ pubkey: a.pubkey, data: a.account.data, owner: a.account.owner, lamports: a.account.lamports }));
  }
  async latestBlockhash() {
    return (await this.connection.getLatestBlockhash()).blockhash;
  }
  async send(tx: VersionedTransaction) {
    const sig = await this.connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    const bh = await this.connection.getLatestBlockhash();
    const res = await this.connection.confirmTransaction({ signature: sig, ...bh }, this.commitment);
    if (res.value.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(res.value.err)}`);
    return sig;
  }
  async now() {
    const slot = await this.connection.getSlot();
    return (await this.connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  }
  async slot() {
    return this.connection.getSlot("finalized");
  }
  async lookupTable(address: PublicKey) {
    return (await this.connection.getAddressLookupTable(address)).value;
  }
}

/** Compute budget for league transactions (enter_creator moves up to 11 tokens). */
export const DEFAULT_CU_LIMIT = 400_000;

export interface BuildOpts {
  payer: PublicKey;
  instructions: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
  cuLimit?: number;
  /** Priority fee, micro-lamports per CU. */
  cuPrice?: number;
}

/** A v0 transaction, unsigned. */
export async function buildTx(io: ChainIO, o: BuildOpts): Promise<VersionedTransaction> {
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: o.cuLimit ?? DEFAULT_CU_LIMIT })];
  if (o.cuPrice) ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: o.cuPrice }));
  const msg = new TransactionMessage({ payerKey: o.payer, recentBlockhash: await io.latestBlockhash(), instructions: [...ixs, ...o.instructions] }).compileToV0Message(o.lookupTables ?? []);
  return new VersionedTransaction(msg);
}

/** Build, sign with local keypairs and send. */
export async function sendIxs(io: ChainIO, signers: Keypair[], instructions: TransactionInstruction[], opts: Partial<BuildOpts> = {}): Promise<string> {
  const tx = await buildTx(io, { payer: signers[0].publicKey, instructions, ...opts });
  tx.sign(signers);
  return io.send(tx);
}

export const txToBase64 = (tx: VersionedTransaction) => Buffer.from(tx.serialize()).toString("base64");
export const txFromBase64 = (b64: string) => VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
