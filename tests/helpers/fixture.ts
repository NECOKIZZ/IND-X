// A league on LiteSVM: the compiled program, a USDC-like stake mint (classic
// Token, 6 decimals), Token-2022 stock mints (8 decimals, like xStocks), one
// classic crypto mint, and funded players.

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Builders, DEFAULT_PROGRAM_ID } from "../../server/src/chain/program";
import { LiteIO } from "../../server/src/chain/liteio";
import { LeagueReader } from "../../server/src/chain/reader";
import { createLookupTable, createMint, mintTo, setupLeague } from "../../server/src/chain/setup";
import { sendIxs } from "../../server/src/chain/io";

export const USDC = 1_000_000n; // 6 decimals
export const STAKE = 5n * USDC;
export const SHARE = 100_000_000n; // 8 decimals

export interface Fixture {
  io: LiteIO;
  b: Builders;
  reader: LeagueReader;
  admin: Keypair;
  keeper: Keypair;
  stakeMint: PublicKey;
  stocks: PublicKey[];
  crypto: PublicKey;
  lookupTable: PublicKey;
  /** A funded player: SOL, 1000 USDC and 1000 of every stock + crypto. */
  player(): Promise<Keypair>;
  fund(owner: PublicKey): Promise<void>;
}

export async function leagueFixture(nStocks = 6): Promise<Fixture> {
  const io = LiteIO.withProgram(DEFAULT_PROGRAM_ID, "target/deploy/league.so");
  const admin = Keypair.generate();
  const keeper = Keypair.generate();
  io.airdrop(admin.publicKey, 100);
  io.airdrop(keeper.publicKey, 100);
  io.warpTo(1_800_000_000);

  const stakeMint = await createMint(io, admin, 6, TOKEN_PROGRAM_ID);
  const stocks: PublicKey[] = [];
  for (let i = 0; i < nStocks; i++) stocks.push(await createMint(io, admin, 8, TOKEN_2022_PROGRAM_ID));
  const crypto = await createMint(io, admin, 8, TOKEN_PROGRAM_ID);
  const classic = new Set([crypto.toBase58()]);
  const b = new Builders({
    programId: DEFAULT_PROGRAM_ID,
    stakeMint,
    stakeTokenProgram: TOKEN_PROGRAM_ID,
    basketTokenProgram: (m) => (classic.has(m.toBase58()) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID),
  });
  await setupLeague(io, b, admin, keeper.publicKey, [...stocks.map((mint) => ({ mint, isCrypto: false })), { mint: crypto, isCrypto: true }]);
  const lookupTable = await createLookupTable(io, b, admin, [...stocks, crypto]);
  // Lookup tables activate one slot after their last extension.
  io.warpSlots(2);

  const fund = async (owner: PublicKey) => {
    await mintTo(io, admin, stakeMint, owner, 1000n * USDC, TOKEN_PROGRAM_ID);
    for (const s of stocks) await mintTo(io, admin, s, owner, 1000n * SHARE, TOKEN_2022_PROGRAM_ID);
    await mintTo(io, admin, crypto, owner, 1000n * SHARE, TOKEN_PROGRAM_ID);
  };
  const player = async () => {
    const kp = Keypair.generate();
    io.airdrop(kp.publicKey, 10);
    await fund(kp.publicKey);
    return kp;
  };
  return { io, b, reader: new LeagueReader(io, b), admin, keeper, stakeMint, stocks, crypto, lookupTable, player, fund };
}

/** Send instructions with the fixture's lookup table. */
export async function send(f: Fixture, signers: Keypair[], ixs: Parameters<typeof sendIxs>[2]) {
  const table = await f.io.lookupTable(f.lookupTable);
  return sendIxs(f.io, signers, ixs, { lookupTables: table ? [table] : [] });
}

/** Open a round whose entries close in 1h and that ends 1h later. Returns its id. */
export async function openRound(f: Fixture, opts: { stake?: bigint; cap?: number; maxBackers?: number } = {}) {
  const now = await f.io.now();
  const cfg = await f.reader.config();
  const id = cfg!.roundCount + 1n;
  await send(f, [f.keeper], [await f.b.openRound(f.keeper.publicKey, id, now + 3600, now + 7200, opts.stake ?? STAKE, opts.cap ?? 100, opts.maxBackers ?? 20)]);
  return id;
}
