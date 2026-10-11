// The league program from TypeScript: PDAs, account decoding and
// instruction builders. Nothing here touches the network: builders take
// every account explicitly, so the same code serves the API (unsigned
// transactions for mobile wallets), the keeper and the LiteSVM tests.

import { AnchorProvider, Program, type Idl } from "@anchor-lang/core";
import BN from "bn.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, type AccountMeta, type TransactionInstruction } from "@solana/web3.js";
import { bytesToHex, hexToBytes } from "@indx/core";
import idlJson from "./idl/league.json" with { type: "json" };
import type { League } from "./idl/league.js";

export const IDL = idlJson as unknown as League;
export const DEFAULT_PROGRAM_ID = new PublicKey(idlJson.address);

/** A wallet that never signs: the program object is only used to build and decode. */
const readOnlyWallet = (pk = Keypair.generate().publicKey) => ({
  publicKey: pk,
  signTransaction: async () => {
    throw new Error("read-only");
  },
  signAllTransactions: async () => {
    throw new Error("read-only");
  },
});

export function leagueProgram(programId: PublicKey = DEFAULT_PROGRAM_ID): Program<League> {
  const provider = new AnchorProvider(new Connection("http://127.0.0.1:8899"), readOnlyWallet() as never, {});
  const idl = { ...(IDL as unknown as Idl), address: programId.toBase58() } as unknown as League;
  return new Program<League>(idl, provider);
}

const u64le = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export class Pdas {
  constructor(readonly programId: PublicKey) {}
  private find(seeds: (Buffer | Uint8Array)[]) {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }
  config = () => this.find([Buffer.from("config")]);
  registry = () => this.find([Buffer.from("registry")]);
  round = (id: bigint | number) => this.find([Buffer.from("round"), u64le(id)]);
  team = (id: bigint | number, teamKey: string) => this.find([Buffer.from("team"), u64le(id), hexToBytes(teamKey)]);
  entry = (id: bigint | number, wallet: PublicKey) => this.find([Buffer.from("entry"), u64le(id), wallet.toBuffer()]);
  /** A vault: the config PDA's associated token account for `mint`. */
  vault = (mint: PublicKey, tokenProgram: PublicKey) => getAssociatedTokenAddressSync(mint, this.config(), true, tokenProgram);
}

// --- decoded accounts ---------------------------------------------------------

export type RoundStatus = "open" | "settling" | "settled" | "voided";

export interface ConfigAccount {
  admin: PublicKey;
  keeper: PublicKey;
  stakeMint: PublicKey;
  paused: boolean;
  roundCount: bigint;
  seasonPot: bigint;
  platformBalance: bigint;
}

export interface AssetAccount {
  mint: PublicKey;
  isCrypto: boolean;
  enabled: boolean;
}

export interface RoundAccount {
  id: bigint;
  status: RoundStatus;
  entryClose: number; // unix seconds
  end: number;
  stake: bigint;
  capMultiple: number;
  maxBackers: number;
  entryCount: number;
  teamCount: number;
  totalStakes: bigint;
  bonus: bigint;
  inputsHash: string;
  totalPayout: bigint;
  platformCut: bigint;
  seasonIn: bigint;
  seasonOut: bigint;
  settleEpoch: number;
  writtenCount: number;
  writtenSum: bigint;
}

export interface TeamAccount {
  address: PublicKey;
  roundId: bigint;
  key: string;
  captain: PublicKey;
  members: number;
  name: string;
  buyFeeBps: number;
  legs: { mint: PublicKey; weightBps: number }[];
}

export interface EntryAccount {
  address: PublicKey;
  roundId: bigint;
  wallet: PublicKey;
  teamKey: string;
  index: number;
  isCreator: boolean;
  /** settle_epoch the payout was written under (0 = never); current iff it equals the round's. */
  payoutEpoch: number;
  claimed: boolean;
  payout: bigint;
  basket: { mint: PublicKey; amount: bigint; weightBps: number; returned: boolean }[];
}

const big = (x: BN | number | bigint) => BigInt(x.toString());
const statusOf = (s: Record<string, unknown>): RoundStatus => Object.keys(s)[0] as RoundStatus;

export class Decoder {
  constructor(private program: Program<League>) {}
  private dec(name: string, data: Buffer) {
    return this.program.coder.accounts.decode(name, data) as any;
  }
  config(data: Buffer): ConfigAccount {
    const a = this.dec("config", data);
    return { admin: a.admin, keeper: a.keeper, stakeMint: a.stakeMint, paused: a.paused, roundCount: big(a.roundCount), seasonPot: big(a.seasonPot), platformBalance: big(a.platformBalance) };
  }
  registry(data: Buffer): AssetAccount[] {
    return this.dec("registry", data).assets.map((x: any) => ({ mint: x.mint, isCrypto: x.isCrypto, enabled: x.enabled }));
  }
  round(data: Buffer): RoundAccount {
    const a = this.dec("round", data);
    return {
      id: big(a.id),
      status: statusOf(a.status),
      entryClose: Number(a.entryClose),
      end: Number(a.end),
      stake: big(a.stake),
      capMultiple: a.capMultiple,
      maxBackers: a.maxBackers,
      entryCount: a.entryCount,
      teamCount: a.teamCount,
      totalStakes: big(a.totalStakes),
      bonus: big(a.bonus),
      inputsHash: bytesToHex(Uint8Array.from(a.inputsHash)),
      totalPayout: big(a.totalPayout),
      platformCut: big(a.platformCut),
      seasonIn: big(a.seasonIn),
      seasonOut: big(a.seasonOut),
      settleEpoch: a.settleEpoch,
      writtenCount: a.writtenCount,
      writtenSum: big(a.writtenSum),
    };
  }
  team(address: PublicKey, data: Buffer): TeamAccount {
    const a = this.dec("team", data);
    return {
      address,
      roundId: big(a.roundId),
      key: bytesToHex(Uint8Array.from(a.key)),
      captain: a.captain,
      members: a.members,
      name: a.name,
      buyFeeBps: a.buyFeeBps,
      legs: a.legs.map((l: any) => ({ mint: l.mint, weightBps: l.weightBps })),
    };
  }
  entry(address: PublicKey, data: Buffer): EntryAccount {
    const a = this.dec("entry", data);
    return {
      address,
      roundId: big(a.roundId),
      wallet: a.wallet,
      teamKey: bytesToHex(Uint8Array.from(a.teamKey)),
      index: a.index,
      isCreator: a.isCreator,
      payoutEpoch: a.payoutEpoch,
      claimed: a.claimed,
      payout: big(a.payout),
      basket: a.basket.map((l: any) => ({ mint: l.mint, amount: big(l.amount), weightBps: l.weightBps, returned: l.returned })),
    };
  }
  /** The 8-byte account discriminator, for getProgramAccounts filters. */
  discriminator(name: "Round" | "Team" | "Entry" | "Config" | "Registry"): Buffer {
    return Buffer.from(idlJson.accounts.find((a) => a.name === name)!.discriminator);
  }
}

// --- instruction builders -----------------------------------------------------

export interface LeagueEnv {
  programId: PublicKey;
  stakeMint: PublicKey;
  /** The stake mint's token program (classic Token for USDC). */
  stakeTokenProgram: PublicKey;
  /** Token program per basket mint (base58 → program). Defaults to Token-2022. */
  basketTokenProgram?: (mint: PublicKey) => PublicKey;
}

const b32 = (hex: string) => Array.from(hexToBytes(hex));

export class Builders {
  readonly program: Program<League>;
  readonly pdas: Pdas;
  constructor(readonly env: LeagueEnv) {
    this.program = leagueProgram(env.programId);
    this.pdas = new Pdas(env.programId);
  }

  tokenProgramOf(mint: PublicKey): PublicKey {
    return this.env.basketTokenProgram?.(mint) ?? TOKEN_2022_PROGRAM_ID;
  }
  stakeAta(owner: PublicKey) {
    return getAssociatedTokenAddressSync(this.env.stakeMint, owner, true, this.env.stakeTokenProgram);
  }
  basketAta(owner: PublicKey, mint: PublicKey) {
    return getAssociatedTokenAddressSync(mint, owner, true, this.tokenProgramOf(mint));
  }
  stakeVault() {
    return this.pdas.vault(this.env.stakeMint, this.env.stakeTokenProgram);
  }
  /** The basket token program to pass: Token-2022 unless every leg is classic. */
  private basketProgramFor(mints: PublicKey[]) {
    const ps = mints.map((m) => this.tokenProgramOf(m));
    return ps.find((p) => !p.equals(this.env.stakeTokenProgram)) ?? this.env.stakeTokenProgram;
  }

  initialize(admin: PublicKey, keeper: PublicKey) {
    return this.program.methods
      .initialize(keeper)
      .accountsStrict({
        admin,
        config: this.pdas.config(),
        registry: this.pdas.registry(),
        stakeMint: this.env.stakeMint,
        stakeVault: this.stakeVault(),
        tokenProgram: this.env.stakeTokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  setAsset(admin: PublicKey, mint: PublicKey, enabled: boolean, isCrypto: boolean) {
    const tp = this.tokenProgramOf(mint);
    return this.program.methods
      .setAsset(enabled, isCrypto)
      .accountsStrict({
        admin,
        config: this.pdas.config(),
        registry: this.pdas.registry(),
        mint,
        vault: this.pdas.vault(mint, tp),
        tokenProgram: tp,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  adminSet(admin: PublicKey, what: "keeper" | "admin" | "paused", value: PublicKey | boolean) {
    const accounts = { admin, config: this.pdas.config() };
    if (what === "paused") return this.program.methods.setPaused(value as boolean).accountsStrict(accounts).instruction();
    if (what === "keeper") return this.program.methods.setKeeper(value as PublicKey).accountsStrict(accounts).instruction();
    return this.program.methods.setAdmin(value as PublicKey).accountsStrict(accounts).instruction();
  }

  private stakeMove(user: PublicKey) {
    return {
      user,
      config: this.pdas.config(),
      stakeMint: this.env.stakeMint,
      userStake: this.stakeAta(user),
      stakeVault: this.stakeVault(),
      tokenProgram: this.env.stakeTokenProgram,
    };
  }

  fundSeason(user: PublicKey, amount: bigint) {
    return this.program.methods.fundSeason(new BN(amount.toString())).accountsStrict(this.stakeMove(user)).instruction();
  }

  withdrawPlatform(admin: PublicKey, destination: PublicKey, amount: bigint) {
    return this.program.methods
      .withdrawPlatform(new BN(amount.toString()))
      .accountsStrict({ admin, config: this.pdas.config(), stakeMint: this.env.stakeMint, stakeVault: this.stakeVault(), destination, tokenProgram: this.env.stakeTokenProgram })
      .instruction();
  }

  openRound(keeper: PublicKey, nextId: bigint, entryClose: number, end: number, stake: bigint, capMultiple: number, maxBackers: number) {
    return this.program.methods
      .openRound(new BN(entryClose), new BN(end), new BN(stake.toString()), capMultiple, maxBackers)
      .accountsStrict({ keeper, config: this.pdas.config(), round: this.pdas.round(nextId), systemProgram: SystemProgram.programId })
      .instruction();
  }

  enterCreator(user: PublicKey, roundId: bigint, teamKey: string, legs: { mint: PublicKey; amount: bigint; weightBps: number }[], name: string, buyFeeBps: number) {
    const mints = legs.map((l) => l.mint);
    const remaining: AccountMeta[] = legs.flatMap((l) => {
      const tp = this.tokenProgramOf(l.mint);
      return [
        { pubkey: l.mint, isSigner: false, isWritable: false },
        { pubkey: getAssociatedTokenAddressSync(l.mint, user, true, tp), isSigner: false, isWritable: true },
        { pubkey: this.pdas.vault(l.mint, tp), isSigner: false, isWritable: true },
      ];
    });
    return this.program.methods
      .enterCreator(new BN(roundId.toString()), b32(teamKey), legs.map((l) => new BN(l.amount.toString())), legs.map((l) => l.weightBps), name, buyFeeBps)
      .accountsStrict({
        user,
        config: this.pdas.config(),
        registry: this.pdas.registry(),
        round: this.pdas.round(roundId),
        team: this.pdas.team(roundId, teamKey),
        entry: this.pdas.entry(roundId, user),
        stakeMint: this.env.stakeMint,
        userStake: this.stakeAta(user),
        stakeVault: this.stakeVault(),
        tokenProgram: this.env.stakeTokenProgram,
        basketTokenProgram: this.basketProgramFor(mints),
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(remaining)
      .instruction();
  }

  enterBacker(user: PublicKey, roundId: bigint, teamKey: string) {
    return this.program.methods
      .enterBacker(new BN(roundId.toString()), b32(teamKey))
      .accountsStrict({
        user,
        config: this.pdas.config(),
        round: this.pdas.round(roundId),
        team: this.pdas.team(roundId, teamKey),
        entry: this.pdas.entry(roundId, user),
        stakeMint: this.env.stakeMint,
        userStake: this.stakeAta(user),
        stakeVault: this.stakeVault(),
        tokenProgram: this.env.stakeTokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  boostRound(user: PublicKey, roundId: bigint, amount: bigint) {
    const { config, stakeMint, userStake, stakeVault, tokenProgram } = this.stakeMove(user);
    return this.program.methods
      .boostRound(new BN(roundId.toString()), new BN(amount.toString()))
      .accountsStrict({ user, config, round: this.pdas.round(roundId), stakeMint, userStake, stakeVault, tokenProgram })
      .instruction();
  }

  private keeperRound(keeper: PublicKey, roundId: bigint) {
    return { keeper, config: this.pdas.config(), round: this.pdas.round(roundId) };
  }

  settleBegin(keeper: PublicKey, roundId: bigint, s: { totalPayout: bigint; platformCut: bigint; seasonIn: bigint; seasonOut: bigint; inputsHash: string }) {
    return this.program.methods
      .settleBegin(new BN(roundId.toString()), new BN(s.totalPayout.toString()), new BN(s.platformCut.toString()), new BN(s.seasonIn.toString()), new BN(s.seasonOut.toString()), b32(s.inputsHash))
      .accountsStrict(this.keeperRound(keeper, roundId))
      .instruction();
  }

  settleWrite(keeper: PublicKey, roundId: bigint, rows: { entry: PublicKey; payout: bigint }[]) {
    return this.program.methods
      .settleWrite(new BN(roundId.toString()), rows.map((r) => new BN(r.payout.toString())))
      .accountsStrict(this.keeperRound(keeper, roundId))
      .remainingAccounts(rows.map((r) => ({ pubkey: r.entry, isSigner: false, isWritable: true })))
      .instruction();
  }

  settleFinish(keeper: PublicKey, roundId: bigint) {
    return this.program.methods.settleFinish(new BN(roundId.toString())).accountsStrict(this.keeperRound(keeper, roundId)).instruction();
  }

  voidRound(signer: PublicKey, roundId: bigint) {
    return this.program.methods
      .voidRound(new BN(roundId.toString()))
      .accountsStrict({ signer, config: this.pdas.config(), round: this.pdas.round(roundId) })
      .instruction();
  }

  /** Pay `owner`'s entry out to them; `signer` may be anyone (the keeper distributes). */
  claim(owner: PublicKey, roundId: bigint, signer: PublicKey = owner) {
    return this.program.methods
      .claim(new BN(roundId.toString()))
      .accountsStrict({
        signer,
        owner,
        config: this.pdas.config(),
        round: this.pdas.round(roundId),
        entry: this.pdas.entry(roundId, owner),
        stakeMint: this.env.stakeMint,
        userStake: this.stakeAta(owner),
        stakeVault: this.stakeVault(),
        tokenProgram: this.env.stakeTokenProgram,
      })
      .instruction();
  }

  returnBasket(signer: PublicKey, owner: PublicKey, roundId: bigint, mints: PublicKey[]) {
    const remaining: AccountMeta[] = mints.flatMap((mint) => {
      const tp = this.tokenProgramOf(mint);
      return [
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: this.pdas.vault(mint, tp), isSigner: false, isWritable: true },
        { pubkey: getAssociatedTokenAddressSync(mint, owner, true, tp), isSigner: false, isWritable: true },
      ];
    });
    return this.program.methods
      .returnBasket(new BN(roundId.toString()))
      .accountsStrict({
        signer,
        owner,
        config: this.pdas.config(),
        round: this.pdas.round(roundId),
        entry: this.pdas.entry(roundId, owner),
        tokenProgram: this.env.stakeTokenProgram,
        basketTokenProgram: this.basketProgramFor(mints),
      })
      .remainingAccounts(remaining)
      .instruction();
  }
}

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID };
export type Ix = TransactionInstruction;
