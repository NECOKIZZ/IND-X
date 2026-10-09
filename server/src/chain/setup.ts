// Deploy-time helpers: test mints, token accounts, initializing the league,
// registering basket tokens and the address lookup table every league
// transaction uses. Shared by the local demo, devnet deploys and tests.

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { sendIxs, type ChainIO } from "./io.js";
import type { Builders } from "./program.js";

const MINT_RENT = 1_461_600; // rent-exempt minimum for an 82-byte mint

/** Create a plain mint (classic Token or Token-2022) with `authority` as mint authority. */
export async function createMint(io: ChainIO, payer: Keypair, decimals: number, tokenProgram = TOKEN_PROGRAM_ID, mint = Keypair.generate()): Promise<PublicKey> {
  const space = getMintLen([]);
  await sendIxs(io, [payer, mint], [
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, lamports: MINT_RENT, space, programId: tokenProgram }),
    createInitializeMint2Instruction(mint.publicKey, decimals, payer.publicKey, null, tokenProgram),
  ]);
  return mint.publicKey;
}

/** Ensure `owner`'s associated token account exists and mint `amount` into it. */
export async function mintTo(io: ChainIO, authority: Keypair, mint: PublicKey, owner: PublicKey, amount: bigint, tokenProgram = TOKEN_PROGRAM_ID) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
  await sendIxs(io, [authority], [
    createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, owner, mint, tokenProgram),
    createMintToInstruction(mint, ata, authority.publicKey, amount, [], tokenProgram),
  ]);
  return ata;
}

/** Instruction: create an associated token account if missing (payer pays). */
export const ensureAtaIx = (payer: PublicKey, owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey) =>
  createAssociatedTokenAccountIdempotentInstruction(payer, getAssociatedTokenAddressSync(mint, owner, true, tokenProgram), owner, mint, tokenProgram);

export interface AssetSpec {
  mint: PublicKey;
  isCrypto: boolean;
}

/** Initialize the league (if needed) and register basket tokens. */
export async function setupLeague(io: ChainIO, b: Builders, admin: Keypair, keeper: PublicKey, assets: AssetSpec[]) {
  if (!(await io.getAccount(b.pdas.config()))) {
    await sendIxs(io, [admin], [await b.initialize(admin.publicKey, keeper)]);
  }
  // A few per transaction: each creates a vault.
  for (let i = 0; i < assets.length; i += 4) {
    const ixs = await Promise.all(assets.slice(i, i + 4).map((a) => b.setAsset(admin.publicKey, a.mint, true, a.isCrypto)));
    await sendIxs(io, [admin], ixs);
  }
}

/**
 * Address lookup table holding the accounts every league transaction
 * shares: programs, config, registry, the stake mint and vault, and each
 * basket mint with its vault. With it a 10-token enter_creator fits in one
 * transaction.
 */
export async function createLookupTable(io: ChainIO, b: Builders, authority: Keypair, mints: PublicKey[]): Promise<PublicKey> {
  const slot = await io.slot();
  const [createIx, table] = AddressLookupTableProgram.createLookupTable({ authority: authority.publicKey, payer: authority.publicKey, recentSlot: Math.max(0, slot - 1) });
  const addresses = [
    b.env.programId,
    SystemProgram.programId,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    ComputeBudgetProgram.programId,
    b.pdas.config(),
    b.pdas.registry(),
    b.env.stakeMint,
    b.stakeVault(),
    ...mints.flatMap((m) => [m, b.pdas.vault(m, b.tokenProgramOf(m))]),
  ];
  await sendIxs(io, [authority], [createIx]);
  for (let i = 0; i < addresses.length; i += 20) {
    await sendIxs(io, [authority], [
      AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: authority.publicKey, payer: authority.publicKey, addresses: addresses.slice(i, i + 20) }),
    ]);
  }
  return table;
}
