// Push notifications through Expo's push service. The app registers its
// Expo push token per wallet (POST /v1/push); the keeper's events fan out:
//   opened         → everyone: a new round is open
//   entries-closed → the round's players: it's live
//   settled        → each player: beat the median / draw / below, and the payout
// Each notification is sent once (dedupe key in the store).

import { formatUsd, type Settlement } from "@indx/core";
import type { League } from "./league.js";
import type { KeeperEvent } from "./keeper/keeper.js";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
}

export type PushSender = (msgs: PushMessage[]) => Promise<void>;

/** Expo's push API (EXPO_ACCESS_TOKEN optional, for projects with enhanced security). */
export const expoSender: PushSender = async (msgs) => {
  for (let i = 0; i < msgs.length; i += 100) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(msgs.slice(i, i + 100)),
    });
    if (!res.ok) console.warn(`expo push ${res.status}: ${await res.text()}`);
  }
};

let sender: PushSender = process.env.PUSH_DISABLED === "1" ? async () => {} : expoSender;
export const setPushSender = (s: PushSender) => {
  sender = s;
};

const fmtTime = (unix: number) =>
  new Date(unix * 1000).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET";

/** The message each player of a settled round gets. */
export function resultMessage(s: Settlement, wallet: string, stakeDecimals = 6): { title: string; body: string } | null {
  const rows = (s.inputs.entries as { wallet: string; status: { kind: string; team?: string }; payout: string }[]).filter((e) => e.wallet === wallet);
  if (!rows.length) return null;
  const e = rows[0];
  const payout = BigInt(e.payout);
  const usd = formatUsd(payout, stakeDecimals);
  if (s.void) return { title: "Round voided", body: `Your ticket (${usd}) is on its way back.` };
  if (e.status.kind === "refunded") return { title: "Ticket refunded", body: `Your entry didn't qualify this round, so your ${usd} is coming back.` };
  const team = s.teams.find((t) => t.teamKey === e.status.team);
  if (team?.isWinner) return { title: "You beat the median", body: `${usd} is on its way to your wallet.` };
  if (team?.isDraw) return { title: "Right on the median", body: `A draw: your ticket (${usd}) comes back.` };
  return { title: "Below the median this week", body: "Your basket is on its way back. New round, new chance." };
}

export function notifier(L: League) {
  return async (e: KeeperEvent) => {
    try {
      await handle(L, e);
    } catch (err) {
      console.warn(`push failed: ${(err as Error).message}`);
    }
  };
}

async function handle(L: League, e: KeeperEvent) {
  const st = L.store;
  if (e.kind === "opened") {
    if (!(await st.firstTime(`opened/${e.roundId}`))) return;
    const all = await st.pushTokens();
    await sender(all.map(({ token }) => ({ to: token, title: `Round ${e.roundId} is open`, body: `Build an ETF that beats the median. Entries close ${fmtTime(e.entryClose)}.`, data: { url: `/round/${e.roundId}` }, sound: "default" })));
  } else if (e.kind === "entries-closed") {
    const entries = await L.reader.entries(e.roundId);
    const wallets = new Set(entries.map((x) => x.wallet.toBase58()));
    const tokens = (await st.pushTokens()).filter((t) => wallets.has(t.wallet));
    await sender(tokens.map(({ token }) => ({ to: token, title: `Round ${e.roundId} is live`, body: "Entries are closed. Follow your ETF against the median.", data: { url: `/round/${e.roundId}` } })));
  } else if (e.kind === "settled") {
    const msgs: PushMessage[] = [];
    for (const { wallet, token } of await st.pushTokens()) {
      const m = resultMessage(e.settlement, wallet, L.deployment.stakeDecimals);
      if (m && (await st.firstTime(`settled/${e.roundId}/${wallet}/${token}`))) msgs.push({ to: token, ...m, data: { url: `/round/${e.roundId}` }, sound: "default" });
    }
    await sender(msgs);
  }
}
