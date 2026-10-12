// ChainIO over LiteSVM (in-process Solana VM) for tests and offline demos.
// LiteSVM speaks @solana/kit types; this adapts them to web3.js.

import { AddressLookupTableAccount, PublicKey, VersionedTransaction, type GetProgramAccountsFilter } from "@solana/web3.js";
import { address, getTransactionDecoder, lamports, type Address } from "@solana/kit";
import bs58 from "bs58";
import { Clock, FailedTransactionMetadata, LiteSVM } from "litesvm";
import type { ChainIO, RawAccount } from "./io.js";

const addr = (p: PublicKey): Address => address(p.toBase58());

export class LiteIO implements ChainIO {
  lastLogs: string[] = [];
  constructor(readonly svm: LiteSVM) {}

  static withProgram(programId: PublicKey, soPath: string) {
    // A plan's transactions share a blockhash and go out one after another,
    // as on a real cluster; each send still rolls the blockhash (below) so
    // identical transactions never collide.
    const svm = new LiteSVM().withBlockhashCheck(false);
    svm.addProgramFromFile(addr(programId), soPath);
    return new LiteIO(svm);
  }

  /** Write an account directly (tests: clone mainnet accounts, set balances). */
  setAccount(pubkey: PublicKey, a: { data: Buffer; owner: PublicKey; lamports: number; executable?: boolean }) {
    this.svm.setAccount({
      address: addr(pubkey),
      data: Uint8Array.from(a.data),
      programAddress: addr(a.owner),
      lamports: lamports(BigInt(a.lamports)),
      executable: a.executable ?? false,
      space: BigInt(a.data.length),
    } as never);
  }

  airdrop(to: PublicKey, sol: number) {
    this.svm.airdrop(addr(to), lamports(BigInt(Math.round(sol * 1e9))));
  }

  async getAccount(pubkey: PublicKey): Promise<RawAccount | null> {
    const a = this.svm.getAccount(addr(pubkey));
    if (!a.exists) return null;
    return { pubkey, data: Buffer.from(a.data), owner: new PublicKey(a.programAddress), lamports: Number(a.lamports) };
  }

  async getAccounts(pubkeys: PublicKey[]) {
    return Promise.all(pubkeys.map((p) => this.getAccount(p)));
  }

  async getProgramAccounts(programId: PublicKey, filters: GetProgramAccountsFilter[]) {
    return this.svm
      .getProgramAccounts(addr(programId))
      .map((a) => ({ pubkey: new PublicKey(a.address), data: Buffer.from(a.data), owner: programId, lamports: Number(a.lamports) }))
      .filter((a) =>
        filters.every((f) => {
          if ("dataSize" in f) return a.data.length === f.dataSize;
          const want = Buffer.from(bs58.decode(f.memcmp.bytes as string));
          return a.data.subarray(f.memcmp.offset, f.memcmp.offset + want.length).equals(want);
        }),
      );
  }

  async latestBlockhash() {
    return this.svm.latestBlockhash();
  }

  async send(tx: VersionedTransaction) {
    const res = this.svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()) as never);
    this.svm.expireBlockhash();
    if (res instanceof FailedTransactionMetadata) {
      this.lastLogs = res.meta().logs();
      throw new Error(`transaction failed: ${res.toString()}\n${this.lastLogs.join("\n")}`);
    }
    this.lastLogs = res.logs();
    return bs58.encode(res.signature());
  }

  async now() {
    return Number(this.svm.getClock().unixTimestamp);
  }

  async slot() {
    return Number(this.svm.getClock().slot);
  }

  /** Move the chain clock (unix seconds), one slot forward. */
  warpTo(unix: number) {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(unix)));
  }

  /** Advance slots (lookup tables activate one slot after extension). */
  warpSlots(n: number) {
    const unix = this.svm.getClock().unixTimestamp;
    this.svm.warpToSlot(this.svm.getClock().slot + BigInt(n));
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, unix));
  }

  async lookupTable(address: PublicKey) {
    const a = await this.getAccount(address);
    if (!a) return null;
    return new AddressLookupTableAccount({ key: address, state: AddressLookupTableAccount.deserialize(a.data) });
  }
}
