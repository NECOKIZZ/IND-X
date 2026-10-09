// Writing a settlement on-chain: settle_begin (totals, conservation checked),
// settle_write in batches (one payout per entry), settle_finish.

import type { AddressLookupTableAccount, Keypair, PublicKey } from "@solana/web3.js";
import type { Settlement } from "@indx/core";
import { sendIxs, type ChainIO } from "./io.js";
import type { Builders, EntryAccount } from "./program.js";
import { LeagueReader } from "./reader.js";

/** Entries per settle_write transaction (each adds one writable account). */
export const WRITE_BATCH = 20;

export interface SubmitOpts {
  lookupTables?: AddressLookupTableAccount[];
  log?: (msg: string) => void;
}

export async function submitSettlement(
  io: ChainIO,
  b: Builders,
  keeper: Keypair,
  roundId: bigint,
  s: Pick<Settlement, "payouts" | "totalPayout" | "platformCut" | "seasonIn" | "seasonOut" | "inputsHash">,
  entries: Pick<EntryAccount, "address" | "index" | "payoutEpoch" | "payout">[],
  opts: SubmitOpts = {},
): Promise<string[]> {
  const log = opts.log ?? (() => {});
  const sigs: string[] = [];
  const send = (ixs: Parameters<typeof sendIxs>[2]) => sendIxs(io, [keeper], ixs, { lookupTables: opts.lookupTables });
  if (entries.length !== s.payouts.length) throw new Error(`${entries.length} entries on-chain but ${s.payouts.length} payouts`);
  const round = await new LeagueReader(io, b).round(roundId);
  if (!round) throw new Error(`no round ${roundId}`);
  if (round.status === "settled") throw new Error(`round ${roundId} is already settled`);

  // Begin (or resume a settlement already begun with the same totals).
  const sameTotals =
    round.status === "settling" &&
    round.totalPayout === s.totalPayout &&
    round.platformCut === s.platformCut &&
    round.seasonIn === s.seasonIn &&
    round.seasonOut === s.seasonOut &&
    round.inputsHash === s.inputsHash;
  if (!sameTotals) {
    sigs.push(await send([await b.settleBegin(keeper.publicKey, roundId, s)]));
    log(`settle_begin: total payout ${s.totalPayout}, platform ${s.platformCut}, season in ${s.seasonIn} out ${s.seasonOut}`);
  }

  // Write only what isn't already right.
  const todo = entries.filter((e) => !sameTotals || e.payoutEpoch !== round.settleEpoch || e.payout !== s.payouts[e.index]);
  for (let i = 0; i < todo.length; i += WRITE_BATCH) {
    const rows = todo.slice(i, i + WRITE_BATCH).map((e) => ({ entry: e.address as PublicKey, payout: s.payouts[e.index] }));
    sigs.push(await send([await b.settleWrite(keeper.publicKey, roundId, rows)]));
    log(`settle_write: ${Math.min(i + WRITE_BATCH, todo.length)}/${todo.length}`);
  }
  sigs.push(await send([await b.settleFinish(keeper.publicKey, roundId)]));
  log(`settle_finish: round ${roundId} settled`);
  return sigs;
}
