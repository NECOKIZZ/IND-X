// API server entry point. With LEAGUE_RUN_KEEPER=1 (the default on the lite
// cluster) the keeper runs in the same process.
//
//   pnpm server                                  # uses .env
//   LEAGUE_CLUSTER=lite LEAGUE_SCHEDULE=demo:10:20 LEAGUE_PRICE_SOURCE=demo pnpm server

import { serve } from "@hono/node-server";
import { league } from "../league.js";
import { createApp } from "./app.js";
import { Keeper, keeperOptionsFromEnv } from "../keeper/keeper.js";
import { notifier } from "../push.js";

const L = await league();
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(L).fetch, port, hostname: process.env.HOST ?? "0.0.0.0" });
console.log(`API on http://localhost:${port} (cluster ${L.cluster}, program ${L.deployment.programId})`);

const runKeeper = process.env.LEAGUE_RUN_KEEPER ? process.env.LEAGUE_RUN_KEEPER === "1" : L.cluster === "lite";
if (runKeeper) {
  const k = new Keeper(L, keeperOptionsFromEnv());
  k.onEvent = notifier(L);
  console.log(`keeper running (${k.opts.schedule}, prices: ${k.opts.source})`);
  void k.run(Number(process.env.LEAGUE_TICK_SEC ?? (L.cluster === "lite" ? 10 : 30)) * 1000);
}
