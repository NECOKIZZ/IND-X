// Set up the league on a cluster once the program is deployed
// (`anchor deploy --provider.cluster <cluster>`), and write
// deployments/<cluster>.json for the server and keeper.
//
//   pnpm tsx scripts/deploy.ts localnet|devnet|mainnet
//
// Env:
//   ADMIN_KEYPAIR   admin (and, on test clusters, test-token mint authority / faucet)
//                   default ~/.config/solana/id.json
//   KEEPER_KEYPAIR  the keeper's keypair (or KEEPER_PUBKEY), default: the admin
//   RPC_URL         default per cluster
//
// Test clusters (localnet/devnet) get test USDC and test copies of the
// xStocks (same decimals and token program), priced by the real ones on
// mainnet. Mainnet uses real USDC and the real xStocks.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { MAINNET_ASSETS, USDC_MAINNET } from "@indx/core";
import { RpcIO } from "../server/src/chain/io";
import { Builders, DEFAULT_PROGRAM_ID } from "../server/src/chain/program";
import { createLookupTable, setupLeague } from "../server/src/chain/setup";
import { deployedAssets, leagueEnv, loadKeypair, rpcUrl, type Cluster, type Deployment } from "../server/src/config";
import { bootstrapTestDeployment } from "../server/src/league";

const c = (process.argv[2] ?? "localnet") as Cluster;
if (!["localnet", "devnet", "mainnet"].includes(c)) throw new Error("usage: deploy.ts localnet|devnet|mainnet");
const io = new RpcIO(rpcUrl(c));
const admin = loadKeypair(process.env.ADMIN_KEYPAIR ?? "~/.config/solana/id.json", "ADMIN_KEYPAIR");
const keeper = process.env.KEEPER_PUBKEY ? new PublicKey(process.env.KEEPER_PUBKEY) : process.env.KEEPER_KEYPAIR ? loadKeypair(process.env.KEEPER_KEYPAIR).publicKey : admin.publicKey;
const programId = new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID.toBase58());
const log = (m: string) => console.log(m);

const prog = await io.getAccount(programId);
if (!prog) throw new Error(`program ${programId.toBase58()} is not deployed on ${c}: run \`anchor deploy --provider.cluster ${c}\` first`);
log(`cluster ${c} (${rpcUrl(c)}), program ${programId.toBase58()}, admin ${admin.publicKey.toBase58()}, keeper ${keeper.toBase58()}`);

let d: Deployment;
if (c === "mainnet") {
  d = {
    cluster: c,
    programId: programId.toBase58(),
    stakeMint: USDC_MAINNET,
    stakeDecimals: 6,
    stakeTokenProgram: "token",
    assets: MAINNET_ASSETS.map((a) => ({ symbol: a.symbol, mint: a.mint })),
  };
  const b = new Builders(leagueEnv(d));
  const assets = deployedAssets(d);
  await setupLeague(io, b, admin, keeper, assets.map((a) => ({ mint: new PublicKey(a.mint), isCrypto: a.kind === "crypto" })));
  d.lookupTable = (await createLookupTable(io, b, admin, assets.map((a) => new PublicKey(a.mint)))).toBase58();
} else {
  d = await bootstrapTestDeployment(io, c, programId, admin, keeper, undefined, log);
}

mkdirSync("deployments", { recursive: true });
const file = `deployments/${c}.json`;
if (existsSync(file)) log(`overwriting ${file}`);
writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
log(`wrote ${file}`);
if (d.faucet) log("faucet: set FAUCET_KEYPAIR to the admin keypair on the server to mint test tokens");
