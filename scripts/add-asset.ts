// Add a catalog token to an existing test league (devnet/localnet): creates
// its test mint (the admin is the mint authority, so the test desk can sell
// it), registers it with the program, adds it to the lookup table and to
// deployments/<cluster>.json.
//
//   ADMIN_KEYPAIR=keys/admin.json tsx scripts/add-asset.ts devnet SKR

import { readFileSync, writeFileSync } from "node:fs";
import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MAINNET_ASSETS } from "@indx/core";
import { RpcIO, sendIxs } from "../server/src/chain/io";
import { Builders } from "../server/src/chain/program";
import { createMint } from "../server/src/chain/setup";
import { leagueEnv, loadKeypair, rpcUrl, type Cluster, type Deployment } from "../server/src/config";

const [c, symbol] = process.argv.slice(2) as [Cluster, string];
if (c !== "devnet" && c !== "localnet") throw new Error("usage: add-asset.ts devnet|localnet SYMBOL");
const info = MAINNET_ASSETS.find((a) => a.symbol === symbol);
if (!info) throw new Error(`${symbol} is not in the catalog`);
const file = `deployments/${c}.json`;
const d = JSON.parse(readFileSync(file, "utf8")) as Deployment;
if (d.assets.some((a) => a.symbol === symbol)) throw new Error(`${symbol} is already in ${file}`);

const io = new RpcIO(rpcUrl(c));
const admin = loadKeypair(process.env.ADMIN_KEYPAIR ?? "~/.config/solana/id.json", "ADMIN_KEYPAIR");
const tp = info.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
const mint = await createMint(io, admin, info.decimals, tp);
console.log(`test ${symbol} ${mint.toBase58()}`);

d.assets.push({ symbol, mint: mint.toBase58(), priceMint: info.mint });
const b = new Builders(leagueEnv(d));
await sendIxs(io, [admin], [await b.setAsset(admin.publicKey, mint, true, info.kind === "crypto")]);
console.log("registered with the league");
if (d.lookupTable) {
  await sendIxs(io, [admin], [
    AddressLookupTableProgram.extendLookupTable({ lookupTable: new PublicKey(d.lookupTable), authority: admin.publicKey, payer: admin.publicKey, addresses: [mint, b.pdas.vault(mint, tp)] }),
  ]);
  console.log("added to the lookup table");
}
writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
console.log(`wrote ${file}`);
process.exit(0);
