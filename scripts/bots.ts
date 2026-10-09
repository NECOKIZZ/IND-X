// Demo players: create wallets, take test tokens from the faucet, buy a
// basket at the test desk, then create ETFs or back them, all through the
// HTTP API exactly like the app. Fills a test league for demos.
//
//   pnpm tsx scripts/bots.ts [--api http://localhost:8787] [--n 8] [--keys data/bots.json]
//
// Bot keys are saved (default data/bots.json) and reused, so the same bots
// play every round.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import type { AssetView, ConfigView, RoundView, TxPlan } from "@indx/core";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const API = opt("api", process.env.API_URL ?? "http://localhost:8787");
const N = Number(opt("n", "8"));
const KEYS = opt("keys", "data/bots.json");

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${(json as { error: string }).error}`);
  return json as T;
}

async function signAndSend(plan: TxPlan, kp: Keypair) {
  for (const b64 of plan.transactions) {
    const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
    tx.sign([kp]);
    await api("/v1/tx/send", { tx: Buffer.from(tx.serialize()).toString("base64") });
  }
}

const NAMES = ["Chip Stack", "Mag 7 Lite", "Dividend Ducks", "AI Picks", "Steady Eddie", "Moon Basket", "Gold Bugs", "Cash Cows", "Robo Rally", "Big Box"];
const pick = <T>(xs: T[], n: number) => [...xs].sort(() => Math.random() - 0.5).slice(0, n);

const keys: number[][] = existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, "utf8")) : [];
while (keys.length < N) keys.push(Array.from(Keypair.generate().secretKey));
mkdirSync(dirname(KEYS), { recursive: true });
writeFileSync(KEYS, JSON.stringify(keys));
const bots = keys.slice(0, N).map((k) => Keypair.fromSecretKey(Uint8Array.from(k)));

const cfg = await api<ConfigView>("/v1/config");
const assets = (await api<AssetView[]>("/v1/assets")).filter((a) => a.price && a.kind !== "crypto");
const round = await api<RoundView>("/v1/rounds/current");
if (round.phase !== "open") throw new Error(`round ${round.id} is ${round.phase}: wait for the next one`);
console.log(`round ${round.id} on ${cfg.cluster}: ${N} bots`);

const created: string[] = round.etfs.map((e) => e.key);
for (const [i, kp] of bots.entries()) {
  const wallet = kp.publicKey.toBase58();
  try {
    if (cfg.faucet) await api("/v1/faucet", { wallet }).catch((e) => console.log(`  faucet: ${(e as Error).message}`));
    // Two in three create; the rest back an existing ETF.
    if (created.length < 4 || i % 3 !== 2) {
      const n = 3 + Math.floor(Math.random() * 3);
      const raw = Array.from({ length: n }, () => 1 + Math.random() * 2);
      const total = raw.reduce((s, x) => s + x, 0);
      let w = raw.map((x) => Math.round((x / total) * 10_000));
      w = w.map((x) => Math.min(x, 5000));
      w[0] += 10_000 - w.reduce((s, x) => s + x, 0);
      if (w[0] > 5000) throw new Error("weights");
      const legs = pick(assets, n).map((a, j) => ({ mint: a.mint, weightBps: w[j] }));
      await signAndSend(await api<TxPlan>("/v1/tx/buy", { wallet, legs, usd: 15 }), kp);
      const plan = await api<TxPlan>("/v1/tx/create", { wallet, legs, usd: 12, name: NAMES[i % NAMES.length], buyFeeBps: 100 });
      await signAndSend(plan, kp);
      created.push(plan.meta!.teamKey as string);
      console.log(`  ${wallet.slice(0, 6)} created ${NAMES[i % NAMES.length]}`);
    } else {
      const key = created[Math.floor(Math.random() * created.length)];
      await signAndSend(await api<TxPlan>("/v1/tx/back", { wallet, etfKey: key }), kp);
      console.log(`  ${wallet.slice(0, 6)} backed ${key.slice(0, 8)}`);
    }
  } catch (e) {
    console.log(`  ${wallet.slice(0, 6)}: ${(e as Error).message}`);
  }
}
const after = await api<RoundView>("/v1/rounds/current");
console.log(`round ${after.id}: ${after.players} players, ${after.etfCount} ETFs, pot $${after.potUsd}`);
