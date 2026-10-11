// The program against REAL xStock mints: the mainnet mint accounts of AAPLx,
// NVDAx and SPYx (Token-2022 with permanent delegate, pausable, default
// account state, confidential transfers, a (null) transfer hook, metadata
// and the ScaledUiAmount dividend multiplier), cloned into LiteSVM. Mocks
// can hide extension behaviour; this locks and returns the real thing.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { teamKeyFromWeights } from "@indx/core";
import { Builders, DEFAULT_PROGRAM_ID } from "../../server/src/chain/program";
import { LiteIO } from "../../server/src/chain/liteio";
import { LeagueReader } from "../../server/src/chain/reader";
import { createLookupTable, createMint, mintTo, setupLeague } from "../../server/src/chain/setup";
import { sendIxs } from "../../server/src/chain/io";

const fixture = JSON.parse(readFileSync("tests/fixtures/xstock-mints.json", "utf8")) as { accounts: Record<string, { address: string; owner: string; lamports: number; data: string }> };
const SHARE = 100_000_000n;

describe("league program with real xStock mints", () => {
  it("locks a basket of real xStocks and gives it back in full", async () => {
    const io = LiteIO.withProgram(DEFAULT_PROGRAM_ID, "target/deploy/league.so");
    const admin = Keypair.generate();
    const keeper = Keypair.generate();
    const player = Keypair.generate();
    for (const k of [admin, keeper, player]) io.airdrop(k.publicKey, 100);
    io.warpTo(1_800_000_000);

    const mints: PublicKey[] = [];
    for (const a of Object.values(fixture.accounts)) {
      const pk = new PublicKey(a.address);
      io.setAccount(pk, { data: Buffer.from(a.data, "base64"), owner: new PublicKey(a.owner), lamports: a.lamports });
      mints.push(pk);
    }
    const usdc = await createMint(io, admin, 6, TOKEN_PROGRAM_ID);
    const b = new Builders({ programId: DEFAULT_PROGRAM_ID, stakeMint: usdc, stakeTokenProgram: TOKEN_PROGRAM_ID, basketTokenProgram: () => TOKEN_2022_PROGRAM_ID });
    // Registering creates the program's vaults for the real mints (extension-sized token accounts).
    await setupLeague(io, b, admin, keeper.publicKey, mints.map((mint) => ({ mint, isCrypto: false })));
    const table = await createLookupTable(io, b, admin, mints);
    io.warpSlots(2);
    const lookupTables = [(await io.lookupTable(table))!];
    const reader = new LeagueReader(io, b);

    // The player's real-extension token accounts, with balances written directly
    // (we can't mint real xStocks): amount is the u64 at offset 64.
    const atas = mints.map((m) => getAssociatedTokenAddressSync(m, player.publicKey, true, TOKEN_2022_PROGRAM_ID));
    await sendIxs(io, [player], mints.map((m, i) => createAssociatedTokenAccountIdempotentInstruction(player.publicKey, atas[i], player.publicKey, m, TOKEN_2022_PROGRAM_ID)));
    for (const ata of atas) {
      const acc = (await io.getAccount(ata))!;
      const data = Buffer.from(acc.data);
      data.writeBigUInt64LE(10n * SHARE, 64);
      io.setAccount(ata, { data, owner: acc.owner, lamports: acc.lamports });
    }
    await mintTo(io, admin, usdc, player.publicKey, 100_000_000n, TOKEN_PROGRAM_ID);

    const now = await io.now();
    await sendIxs(io, [keeper], [await b.openRound(keeper.publicKey, 1n, now + 3600, now + 7200, 5_000_000n, 100, 20)]);
    const weights = [5000, 3000, 2000];
    const amounts = [5_000_000n, 3_000_000n, 2_000_000n];
    const key = teamKeyFromWeights(mints.map((m) => m.toBase58()), weights);
    await sendIxs(io, [player], [await b.enterCreator(player.publicKey, 1n, key, mints.map((mint, i) => ({ mint, amount: amounts[i], weightBps: weights[i] })), "Real xStocks", 100)], { lookupTables });

    const entry = (await reader.entry(1n, player.publicKey))!;
    expect(entry.basket.map((l) => l.amount)).toEqual(amounts);
    for (const [i, m] of mints.entries()) {
      expect(await reader.tokenBalance(atas[i])).toBe(10n * SHARE - amounts[i]);
      expect(await reader.tokenBalance(b.pdas.vault(m, TOKEN_2022_PROGRAM_ID))).toBe(amounts[i]);
    }

    // Void it (keeper) and return the basket: every token comes back.
    await sendIxs(io, [keeper], [await b.voidRound(keeper.publicKey, 1n)]);
    await sendIxs(io, [player], [await b.claim(player.publicKey, 1n), await b.returnBasket(player.publicKey, player.publicKey, 1n, mints)], { lookupTables });
    for (const ata of atas) expect(await reader.tokenBalance(ata)).toBe(10n * SHARE);
    expect(await reader.entry(1n, player.publicKey)).toBeNull();
  });
});
