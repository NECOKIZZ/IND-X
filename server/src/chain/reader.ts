// Reads league state from the chain.

import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { ChainIO } from "./io.js";
import { Builders, Decoder, type ConfigAccount, type EntryAccount, type RoundAccount, type TeamAccount, type AssetAccount } from "./program.js";

const u64le = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};

export class LeagueReader {
  readonly dec: Decoder;
  constructor(readonly io: ChainIO, readonly b: Builders) {
    this.dec = new Decoder(b.program);
  }
  get programId() {
    return this.b.env.programId;
  }

  async config(): Promise<ConfigAccount | null> {
    const a = await this.io.getAccount(this.b.pdas.config());
    return a ? this.dec.config(a.data) : null;
  }

  async registry(): Promise<AssetAccount[]> {
    const a = await this.io.getAccount(this.b.pdas.registry());
    return a ? this.dec.registry(a.data) : [];
  }

  async round(id: bigint): Promise<RoundAccount | null> {
    const a = await this.io.getAccount(this.b.pdas.round(id));
    return a ? this.dec.round(a.data) : null;
  }

  async rounds(ids: bigint[]): Promise<(RoundAccount | null)[]> {
    const got = await this.io.getAccounts(ids.map((id) => this.b.pdas.round(id)));
    return got.map((a) => (a ? this.dec.round(a.data) : null));
  }

  async team(roundId: bigint, teamKey: string): Promise<TeamAccount | null> {
    const addr = this.b.pdas.team(roundId, teamKey);
    const a = await this.io.getAccount(addr);
    return a ? this.dec.team(addr, a.data) : null;
  }

  /** Every team of a round, in no particular order. */
  async teams(roundId: bigint): Promise<TeamAccount[]> {
    const got = await this.io.getProgramAccounts(this.programId, [
      { memcmp: { offset: 0, bytes: bs58.encode(this.dec.discriminator("Team")) } },
      { memcmp: { offset: 8, bytes: bs58.encode(u64le(roundId)) } },
    ]);
    return got.map((a) => this.dec.team(a.pubkey, a.data));
  }

  /** Every open entry of a round (claimed + returned entries are closed), by index. */
  async entries(roundId: bigint): Promise<EntryAccount[]> {
    const got = await this.io.getProgramAccounts(this.programId, [
      { memcmp: { offset: 0, bytes: bs58.encode(this.dec.discriminator("Entry")) } },
      { memcmp: { offset: 8, bytes: bs58.encode(u64le(roundId)) } },
    ]);
    return got.map((a) => this.dec.entry(a.pubkey, a.data)).sort((x, y) => x.index - y.index);
  }

  /** A wallet's open entries across all rounds. */
  async entriesOf(wallet: PublicKey): Promise<EntryAccount[]> {
    const got = await this.io.getProgramAccounts(this.programId, [
      { memcmp: { offset: 0, bytes: bs58.encode(this.dec.discriminator("Entry")) } },
      { memcmp: { offset: 16, bytes: wallet.toBase58() } },
    ]);
    return got.map((a) => this.dec.entry(a.pubkey, a.data)).sort((x, y) => Number(y.roundId - x.roundId));
  }

  async entry(roundId: bigint, wallet: PublicKey): Promise<EntryAccount | null> {
    const addr = this.b.pdas.entry(roundId, wallet);
    const a = await this.io.getAccount(addr);
    return a ? this.dec.entry(addr, a.data) : null;
  }

  /** Token balance (raw) of a token account, 0 if missing. */
  async tokenBalance(ata: PublicKey): Promise<bigint> {
    const a = await this.io.getAccount(ata);
    if (!a || a.data.length < 72) return 0n;
    return a.data.readBigUInt64LE(64);
  }
}
