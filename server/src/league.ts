// The league context the API and keeper share: deployment, chain access,
// builders, reader, store. One per process.

import { AddressLookupTableAccount, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MAINNET_ASSETS } from "@indx/core";
import { cluster, deployedAssets, keeperKeypair, leagueEnv, loadDeployment, loadKeypair, rpcFallbackUrls, rpcUrl, type Cluster, type DeployedAsset, type Deployment } from "./config.js";
import { RpcIO, rpcHost, type ChainIO } from "./chain/io.js";
import { LiteIO } from "./chain/liteio.js";
import { Builders, DEFAULT_PROGRAM_ID } from "./chain/program.js";
import { LeagueReader } from "./chain/reader.js";
import { createLookupTable, createMint, setupLeague } from "./chain/setup.js";
import { leagueStore, type Store } from "./store.js";

export interface League {
  cluster: Cluster;
  deployment: Deployment;
  assets: DeployedAsset[];
  io: ChainIO;
  b: Builders;
  reader: LeagueReader;
  store: Store;
  /** The keeper's key, when this process runs the keeper. */
  keeper: Keypair | null;
  /** Mint authority of the test tokens (devnet/localnet/lite faucet). */
  faucet: Keypair | null;
  lookupTables(): Promise<AddressLookupTableAccount[]>;
  assetByMint(mint: string): DeployedAsset | undefined;
}

export function makeLeague(c: Cluster, deployment: Deployment, io: ChainIO, store: Store, keeper: Keypair | null, faucet: Keypair | null): League {
  const assets = deployedAssets(deployment);
  const b = new Builders(leagueEnv(deployment));
  let tables: AddressLookupTableAccount[] | null = null;
  const byMint = new Map(assets.map((a) => [a.mint, a]));
  return {
    cluster: c,
    deployment,
    assets,
    io,
    b,
    reader: new LeagueReader(io, b),
    store,
    keeper,
    faucet,
    async lookupTables() {
      if (tables) return tables;
      if (!deployment.lookupTable) return (tables = []);
      const t = await io.lookupTable(new PublicKey(deployment.lookupTable));
      return (tables = t ? [t] : []);
    },
    assetByMint: (m) => byMint.get(m),
  };
}

let shared: Promise<League> | null = null;

/** The process's league, from the environment (see config.ts). */
export function league(): Promise<League> {
  shared ??= (async () => {
    const c = cluster();
    if (c === "lite") return liteLeague();
    const keeper = process.env.KEEPER_KEYPAIR ? keeperKeypair() : null;
    const faucet = process.env.FAUCET_KEYPAIR ? loadKeypair(process.env.FAUCET_KEYPAIR, "FAUCET_KEYPAIR") : null;
    console.log(`rpc: ${[rpcUrl(c), ...rpcFallbackUrls(c)].map(rpcHost).join(" -> ")}`);
    return makeLeague(c, loadDeployment(c), new RpcIO(rpcUrl(c), "confirmed", rpcFallbackUrls(c)), leagueStore(), keeper, faucet);
  })();
  return shared;
}

export function setLeague(l: League) {
  shared = Promise.resolve(l);
}

/** Default test basket tokens: a spread of stocks, two ETFs, gold and the crypto slice. */
export const TEST_SYMBOLS = ["AAPLx", "MSFTx", "NVDAx", "GOOGLx", "AMZNx", "METAx", "TSLAx", "NFLXx", "COINx", "PLTRx", "SPYx", "QQQx", "GLDx", "cbBTC", "ETH", "SOL", "BNB", "SKR"];

/**
 * Create test tokens mirroring mainnet ones (same decimals and token
 * program, priced by the real token), initialize the league, register the
 * tokens and build the lookup table. Returns the deployment.
 */
export async function bootstrapTestDeployment(io: ChainIO, c: Cluster, programId: PublicKey, admin: Keypair, keeper: PublicKey, symbols = TEST_SYMBOLS, log: (m: string) => void = () => {}): Promise<Deployment> {
  const stakeMint = await createMint(io, admin, 6, TOKEN_PROGRAM_ID);
  log(`test USDC ${stakeMint.toBase58()}`);
  const assets: Deployment["assets"] = [];
  for (const sym of symbols) {
    const info = MAINNET_ASSETS.find((a) => a.symbol === sym);
    if (!info) throw new Error(`unknown symbol ${sym}`);
    const mint = await createMint(io, admin, info.decimals, info.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
    assets.push({ symbol: sym, mint: mint.toBase58(), priceMint: info.mint });
    log(`test ${sym} ${mint.toBase58()}`);
  }
  const d: Deployment = { cluster: c, programId: programId.toBase58(), stakeMint: stakeMint.toBase58(), stakeDecimals: 6, stakeTokenProgram: "token", faucet: true, assets };
  const b = new Builders(leagueEnv(d));
  const deployed = deployedAssets(d);
  await setupLeague(io, b, admin, keeper, deployed.map((a) => ({ mint: new PublicKey(a.mint), isCrypto: a.kind === "crypto" })));
  log("league initialized, tokens registered");
  d.lookupTable = (await createLookupTable(io, b, admin, deployed.map((a) => new PublicKey(a.mint)))).toBase58();
  log(`lookup table ${d.lookupTable}`);
  return d;
}

/** An in-process chain with a fresh test deployment: the whole stack offline. */
async function liteLeague(): Promise<League> {
  const io = LiteIO.withProgram(new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID.toBase58()), process.env.LEAGUE_SO ?? "target/deploy/league.so");
  const admin = Keypair.generate();
  const keeper = Keypair.generate();
  io.airdrop(admin.publicKey, 1000);
  io.airdrop(keeper.publicKey, 1000);
  io.warpTo(Math.floor(Date.now() / 1000));
  const d = await bootstrapTestDeployment(io, "lite", new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID.toBase58()), admin, keeper.publicKey);
  io.warpSlots(2);
  // The lite chain's clock follows the wall clock.
  setInterval(() => io.warpTo(Math.max(Math.floor(Date.now() / 1000), Number(io.svm.getClock().unixTimestamp))), 1000).unref();
  return makeLeague("lite", d, io, leagueStore(), keeper, admin);
}
