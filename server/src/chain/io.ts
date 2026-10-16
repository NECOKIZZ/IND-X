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
  /** Test clusters: the cluster's own SOL airdrop (rate limited by the RPC). */
  requestAirdrop?(pubkey: PublicKey, lamports: number): Promise<void>;
}

/** Host of an RPC URL, for logs (never the path or query, which may carry an API key). */
export const rpcHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
};

/** Statuses that mean "this endpoint won't serve us right now", so try the next. */
const failsOver = (status: number) => status === 401 || status === 403 || status === 429 || status >= 500;

/** How long to stay on a fallback before trying the primary endpoint again. */
export const PRIMARY_RETRY_MS = 5 * 60_000;

/**
 * A fetch for web3.js that sends each JSON-RPC request to the first of `urls`
 * that answers: a refused key (401/403), rate limit (429), server error or
 * network failure moves on to the next. It sticks with a working fallback for
 * a few minutes, then tries the primary again.
 */
export function failoverFetch(urls: string[], log: (msg: string) => void = console.warn, fetchImpl: typeof fetch = fetch): typeof fetch {
  let current = 0;
  let since = 0;
  return (async (_input: unknown, init?: RequestInit) => {
    if (current !== 0 && Date.now() - since > PRIMARY_RETRY_MS) current = 0;
    let last: Response | undefined;
    let error: unknown;
    for (let k = 0; k < urls.length; k++) {
      const i = (current + k) % urls.length;
      try {
        const res = await fetchImpl(urls[i], init);
        if (!failsOver(res.status)) {
          if (i !== current) {
            log(`rpc: ${rpcHost(urls[current])} failed, now using ${rpcHost(urls[i])}`);
            current = i;
            since = Date.now();
          }
          return res;
        }
        log(`rpc: ${rpcHost(urls[i])} answered ${res.status}`);
        last = res;
      } catch (e) {
        log(`rpc: ${rpcHost(urls[i])} unreachable: ${(e as Error).message}`);
        error = e;
      }
    }
    if (last) return last;
    throw error;
  }) as typeof fetch;
}

export class RpcIO implements ChainIO {
  readonly connection: Connection;
  /** `url` and then each fallback, in order, when the one before refuses or fails. */
  constructor(url: string, private commitment: Commitment = "confirmed", fallbacks: string[] = []) {
    const urls = [url, ...fallbacks.filter((f) => f && f !== url)];
    this.connection = new Connection(url, urls.length > 1 ? { commitment, fetch: failoverFetch(urls) as never } : commitment);
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
    const bh = await this.connection.getLatestBlockhash();
    const sig = await this.connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    const err = await this.confirm(sig, bh.lastValidBlockHeight);
    if (err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(err)}`);
    return sig;
  }
  /**
   * Wait for `sig` by polling over HTTP (web3.js's confirmTransaction opens a
   * websocket to the primary RPC, which failover can't reroute). Returns the
   * transaction's error, or null.
   */
  private async confirm(sig: string, lastValidBlockHeight: number): Promise<unknown> {
    const want = this.commitment === "finalized" ? ["finalized"] : ["confirmed", "finalized"];
    for (;;) {
      const st = (await this.connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
      if (st?.err) return st.err;
      if (st?.confirmationStatus && want.includes(st.confirmationStatus)) return null;
      if ((await this.connection.getBlockHeight("confirmed")) > lastValidBlockHeight) throw new Error(`transaction ${sig} expired before it confirmed`);
      await new Promise((r) => setTimeout(r, 1000));
    }
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
  async requestAirdrop(pubkey: PublicKey, lamports: number) {
    const bh = await this.connection.getLatestBlockhash();
    const sig = await this.connection.requestAirdrop(pubkey, lamports);
    await this.confirm(sig, bh.lastValidBlockHeight);
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
