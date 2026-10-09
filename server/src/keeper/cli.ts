// Keeper CLI.
//
//   pnpm keeper run                 tick forever (opens, samples, settles, pays out)
//   pnpm keeper tick                one tick
//   pnpm keeper open [--entry-min 60 --run-min 60]
//   pnpm keeper sample <roundId> start|end|track
//   pnpm keeper settle <roundId> [--dry-run]
//   pnpm keeper distribute <roundId>
//   pnpm keeper void <roundId>
//   pnpm keeper status [roundId]
//
// Config: see server/src/config.ts and keeperOptionsFromEnv (LEAGUE_SCHEDULE,
// LEAGUE_SAMPLES, LEAGUE_SAMPLE_EVERY_MIN, LEAGUE_WINDOW_MIN, LEAGUE_STAKE_USD…).

import { league } from "../league.js";
import { sendIxs } from "../chain/io.js";
import { Keeper, keeperOptionsFromEnv } from "./keeper.js";
import { notifier } from "../push.js";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);
const id = () => {
  if (!args[1]) throw new Error("round id required");
  return BigInt(args[1]);
};

const L = await league();
const k = new Keeper(L, keeperOptionsFromEnv());
k.onEvent = notifier(L);

switch (cmd) {
  case "run":
    await k.run(Number(opt("every-sec", "30")) * 1000);
    break;
  case "tick":
    console.log((await k.tick()).join("\n") || "nothing due");
    break;
  case "open": {
    const now = Date.now();
    const times = opt("entry-min") ? { entryClose: now + Number(opt("entry-min")) * 60_000, end: now + (Number(opt("entry-min")) + Number(opt("run-min", "60"))) * 60_000 } : undefined;
    await k.openRound(times);
    break;
  }
  case "sample":
    await k.sample(id(), (args[2] ?? "start") as "start" | "end" | "track");
    break;
  case "settle":
    await k.settle(id(), flag("dry-run"));
    break;
  case "distribute":
    await k.distribute(id());
    break;
  case "void":
    await sendIxs(L.io, [L.keeper!], [await L.b.voidRound(L.keeper!.publicKey, id())]);
    console.log(`voided round ${args[1]}`);
    break;
  case "status": {
    const cfg = await L.reader.config();
    const rid = args[1] ? BigInt(args[1]) : cfg?.roundCount ?? 0n;
    const r = rid > 0n ? await L.reader.round(rid) : null;
    console.log({ cluster: L.cluster, config: cfg && { ...cfg, admin: cfg.admin.toBase58(), keeper: cfg.keeper.toBase58(), stakeMint: cfg.stakeMint.toBase58() }, round: r });
    break;
  }
  default:
    console.log("usage: keeper run|tick|open|sample|settle|distribute|void|status");
}
process.exit(0);
