// Runtime configuration: which cluster, which deployment, which keys.
//
//   LEAGUE_CLUSTER   mainnet | devnet | localnet | lite   (default localnet)
//                    lite = an in-process LiteSVM chain (no validator), for
//                    offline demos and app development.
//   RPC_URL          RPC endpoint (defaults per cluster)
//   PUBLIC_RPC_URL   RPC the app may use directly (defaults to RPC_URL)
//   DEPLOYMENT_FILE  JSON written by scripts/deploy.ts (default deployments/<cluster>.json)
//   KEEPER_KEYPAIR   keeper key: a path to a keypair JSON, or the JSON array itself
//   JUPITER_API_KEY  optional: api.jup.ag with a key (else lite-api.jup.ag)
//   PYTH_API_KEY     optional: score with Pyth Hermes instead of Jupiter
//   DATABASE_URL     optional Postgres for keeper data (else files under LEAGUE_DATA_DIR)

import { existsSync, readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MAINNET_ASSETS, USDC_MAINNET, type AssetInfo } from "@indx/core";
import { DEFAULT_PROGRAM_ID, type LeagueEnv } from "./chain/program.js";

export type Cluster = "mainnet" | "devnet" | "localnet" | "lite";

/** A basket token as deployed on this cluster. */
export interface DeployedAsset extends AssetInfo {
  /** Mint on this cluster. */
  mint: string;
  /** Mainnet mint whose price scores this token (itself on mainnet; the real xStock on devnet). */
  priceMint: string;
}

export interface Deployment {
  cluster: Cluster;
  programId: string;
  stakeMint: string;
  stakeDecimals: number;
  stakeTokenProgram: "token" | "token2022";
  lookupTable?: string;
  /** Test tokens (devnet/localnet): the server can mint them to players. */
  faucet?: boolean;
  assets: { symbol: string; mint: string; priceMint?: string }[];
}

export function cluster(): Cluster {
  const c = (process.env.LEAGUE_CLUSTER ?? "localnet").toLowerCase();
  if (c === "mainnet" || c === "mainnet-beta") return "mainnet";
  if (c === "devnet" || c === "lite") return c;
  return "localnet";
}

export function rpcUrl(c = cluster()): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  return c === "mainnet" ? "https://api.mainnet-beta.solana.com" : c === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899";
}

/** The mainnet deployment needs only the program; tokens are the real ones. */
const MAINNET_DEFAULT = (): Deployment => ({
  cluster: "mainnet",
  programId: process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID.toBase58(),
  stakeMint: USDC_MAINNET,
  stakeDecimals: 6,
  stakeTokenProgram: "token",
  lookupTable: process.env.LOOKUP_TABLE,
  assets: MAINNET_ASSETS.map((a) => ({ symbol: a.symbol, mint: a.mint })),
});

export function deploymentFile(c = cluster()) {
  return process.env.DEPLOYMENT_FILE ?? `deployments/${c}.json`;
}

export function loadDeployment(c = cluster()): Deployment {
  const file = deploymentFile(c);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Deployment;
  if (c === "mainnet") return MAINNET_DEFAULT();
  throw new Error(`no deployment for ${c}: run \`pnpm deploy:${c}\` (or set DEPLOYMENT_FILE)`);
}

/** Basket tokens with metadata, mapped to the mainnet token that prices them. */
export function deployedAssets(d: Deployment): DeployedAsset[] {
  return d.assets.map((a) => {
    const info = MAINNET_ASSETS.find((m) => m.symbol === a.symbol);
    if (!info) throw new Error(`unknown asset ${a.symbol} in deployment`);
    return { ...info, mint: a.mint, priceMint: a.priceMint ?? info.mint };
  });
}

export function leagueEnv(d: Deployment): LeagueEnv {
  const assets = deployedAssets(d);
  const programOf = new Map(assets.map((a) => [a.mint, a.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID]));
  return {
    programId: new PublicKey(d.programId),
    stakeMint: new PublicKey(d.stakeMint),
    stakeTokenProgram: d.stakeTokenProgram === "token2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    basketTokenProgram: (m) => programOf.get(m.toBase58()) ?? TOKEN_2022_PROGRAM_ID,
  };
}

/** Load a keypair from a path or an inline JSON array. */
export function loadKeypair(spec: string | undefined, what = "keypair"): Keypair {
  if (!spec) throw new Error(`${what} not set`);
  const raw = spec.trim().startsWith("[") ? spec : readFileSync(spec.replace(/^~/, process.env.HOME ?? "~"), "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export const keeperKeypair = () => loadKeypair(process.env.KEEPER_KEYPAIR, "KEEPER_KEYPAIR");

/** The RPC the app may use directly (never one carrying a private API key). */
export function publicRpcUrl(c = cluster()): string {
  if (process.env.PUBLIC_RPC_URL) return process.env.PUBLIC_RPC_URL;
  if (c === "lite") return "";
  return c === "mainnet" ? "https://api.mainnet-beta.solana.com" : c === "devnet" ? "https://api.devnet.solana.com" : rpcUrl(c);
}
