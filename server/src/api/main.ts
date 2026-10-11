// API server entry point. With LEAGUE_RUN_KEEPER=1 (the default on the lite
// cluster) the keeper runs in the same process.
//
//   pnpm start                                  # uses .env
//   LEAGUE_CLUSTER=lite LEAGUE_SCHEDULE=demo:10:20 LEAGUE_PRICE_SOURCE=demo pnpm start

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

// On a free host that sleeps when idle (Render sets RENDER_EXTERNAL_URL), tick
// the keeper through the public URL every 4 minutes: it keeps the instance
// awake and the keeper running even when the external cron is late.
// SELF_TICK=0 turns it off.
const selfUrl = process.env.RENDER_EXTERNAL_URL ?? process.env.SELF_TICK_URL;
const tickSecret = process.env.KEEPER_TICK_SECRET;
if (!runKeeper && selfUrl && tickSecret && process.env.SELF_TICK !== "0") {
  const tick = () =>
    fetch(`${selfUrl.replace(/\/$/, "")}/v1/keeper/tick`, { method: "POST", headers: { authorization: `Bearer ${tickSecret}` }, signal: AbortSignal.timeout(120_000) })
      .then((r) => { if (!r.ok) console.warn(`self tick: HTTP ${r.status}`); })
      .catch((e) => console.warn(`self tick: ${(e as Error).message}`));
  setTimeout(tick, 20_000);
  setInterval(tick, 4 * 60_000);
  console.log(`self tick every 4 min via ${selfUrl}`);
}
