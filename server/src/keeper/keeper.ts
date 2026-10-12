// The keeper: runs rounds by itself. Call tick() every minute or so; each
// tick looks at the latest round and does whatever is due, so it survives
// restarts and missed ticks:
//
//   no open round        → open the next one (weekly: entries close Monday
//                          9:30am New York, the round ends Friday 4pm; or a
//                          demo schedule of N minutes)
//   entries closed       → take the start price samples (N, `every` apart)
//   while running        → chart samples (display only, never scored)
//   round ended          → take the end samples, then settle: compute with
//                          the engine, publish the inputs, write payouts
//   settled / voided     → distribute: pay every entry out and send baskets
//                          back (permissionless; users can also do it)
//   stuck                → a round that can't be settled (price problems are
//                          settled as a void by the engine, which refunds)

import {
  buildSnapshot,
  nextWeeklyRound,
  settleRound,
  type ChainEntry,
  type PriceSample,
  type Settlement,
} from "@indx/core";
import type { League } from "../league.js";
import type { EntryAccount, RoundAccount } from "../chain/program.js";
import { sendIxs } from "../chain/io.js";
import { submitSettlement } from "../chain/settle.js";
import { ensureAtaIx } from "../chain/setup.js";
import { priceSourceFromEnv, readMultipliers, samplePrices, type PriceSource } from "../prices.js";
import type { Phase } from "../store.js";

export interface KeeperOptions {
  /** "weekly" or "demo:<entryMin>:<runMin>". */
  schedule: string;
  /** Scoring samples per phase, `everyMs` apart. */
  samples: number;
  everyMs: number;
  /** Samples count only inside [phase time, phase time + windowMs]. */
  windowMs: number;
  /** Chart samples while running (0 = off). */
  trackMs: number;
  stake: bigint;
  capMultiple: number;
  maxBackers: number;
  source: PriceSource;
  /** Auto-open the next round. */
  autoOpen: boolean;
}

export function keeperOptionsFromEnv(): KeeperOptions {
  const usd = Number(process.env.LEAGUE_STAKE_USD ?? "5");
  return {
    schedule: process.env.LEAGUE_SCHEDULE ?? "weekly",
    samples: Number(process.env.LEAGUE_SAMPLES ?? "3"),
    everyMs: Number(process.env.LEAGUE_SAMPLE_EVERY_MIN ?? "5") * 60_000,
    windowMs: Number(process.env.LEAGUE_WINDOW_MIN ?? "30") * 60_000,
    trackMs: Number(process.env.LEAGUE_TRACK_MIN ?? "60") * 60_000,
    stake: BigInt(Math.round(usd * 1e6)),
    capMultiple: Number(process.env.LEAGUE_CAP ?? "100"),
    maxBackers: Number(process.env.LEAGUE_MAX_BACKERS ?? "20"),
    source: priceSourceFromEnv(),
    autoOpen: process.env.LEAGUE_AUTO_OPEN !== "0",
  };
}

export type KeeperEvent =
  | { kind: "opened"; roundId: bigint; entryClose: number; end: number }
  | { kind: "entries-closed"; roundId: bigint }
  | { kind: "settled"; roundId: bigint; settlement: Settlement }
  | { kind: "paid"; roundId: bigint; wallet: string; amount: bigint };

export class Keeper {
  readonly log: (msg: string) => void;
  onEvent: (e: KeeperEvent) => Promise<void> | void = () => {};
  /** Clock for scheduling (ms). The chain's own clock decides what the program accepts. */
  clock: () => number = () => Date.now();

  constructor(readonly L: League, readonly opts: KeeperOptions, log?: (msg: string) => void) {
    if (!L.keeper) throw new Error("keeper key not set (KEEPER_KEYPAIR)");
    this.log = log ?? ((m) => console.log(new Date().toISOString().slice(11, 19), m));
  }

  private get kp() {
    return this.L.keeper!;
  }

  private async send(ixs: Parameters<typeof sendIxs>[2]) {
    return sendIxs(this.L.io, [this.kp], ixs, { lookupTables: await this.L.lookupTables() });
  }

  /** Times for the next round opened at `now` (ms). */
  nextTimes(now: number): { entryClose: number; end: number } {
    const demo = /^demo:(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(this.opts.schedule);
    if (demo) {
      const entryClose = now + Number(demo[1]) * 60_000;
      return { entryClose, end: entryClose + Number(demo[2]) * 60_000 };
    }
    return nextWeeklyRound(now);
  }

  async openRound(times?: { entryClose: number; end: number }): Promise<bigint> {
    // Schedule from the later of our clock and the chain's: the program checks
    // the chain's, so a server clock running behind can't open a round in the past.
    times ??= this.nextTimes(Math.max(this.clock(), (await this.L.io.now()) * 1000));
    const cfg = await this.L.reader.config();
    if (!cfg) throw new Error("league not initialized");
    const id = cfg.roundCount + 1n;
    const entryClose = Math.floor(times.entryClose / 1000);
    const end = Math.floor(times.end / 1000);
    await this.send([await this.L.b.openRound(this.kp.publicKey, id, entryClose, end, this.opts.stake, this.opts.capMultiple, this.opts.maxBackers)]);
    this.log(`opened round ${id}: entries close ${new Date(entryClose * 1000).toISOString()}, ends ${new Date(end * 1000).toISOString()}`);
    await this.onEvent({ kind: "opened", roundId: id, entryClose, end });
    return id;
  }

  /** Mints scored in a round: every creator's basket tokens. */
  roundMints(entries: EntryAccount[]): string[] {
    return [...new Set(entries.flatMap((e) => e.basket.map((l) => l.mint.toBase58())))];
  }

  async sample(roundId: bigint, phase: Phase, mints?: string[]): Promise<Map<string, PriceSample>> {
    const at = this.clock();
    const assets = mints ? this.L.assets.filter((a) => mints.includes(a.mint)) : this.L.assets;
    const multipliers = this.opts.source === "pyth" && this.L.cluster === "mainnet" ? await readMultipliers(this.L.io, assets.map((a) => a.priceMint), at) : undefined;
    const s = await samplePrices(assets, this.opts.source, at, multipliers);
    await this.L.store.saveSample(roundId, phase, s, at);
    const stale = [...s.values()].filter((p) => !p.trading).length;
    this.log(`round ${roundId}: ${phase} sample from ${this.opts.source} (${s.size} tokens${stale ? `, ${stale} not trading` : ""})`);
    return s;
  }

  private async samplesIn(roundId: bigint, phase: "start" | "end", fromMs: number) {
    return (await this.L.store.loadSamples(roundId, phase)).filter((s) => s.at >= fromMs && s.at <= fromMs + this.opts.windowMs);
  }

  /** Compute the settlement of a round from chain state + saved samples. */
  async computeSettlement(round: RoundAccount, entries: EntryAccount[]): Promise<Settlement> {
    const mints = this.roundMints(entries);
    const start = buildSnapshot((await this.samplesIn(round.id, "start", round.entryClose * 1000)).map((s) => s.sample), mints, this.opts.samples);
    const end = buildSnapshot((await this.samplesIn(round.id, "end", round.end * 1000)).map((s) => s.sample), mints, this.opts.samples);
    const cfg = (await this.L.reader.config())!;
    const crypto = this.L.assets.filter((a) => a.kind === "crypto").map((a) => a.mint);
    return settleRound({
      roundId: round.id,
      stake: round.stake,
      capMultiple: round.capMultiple,
      maxBackers: round.maxBackers,
      seasonPot: cfg.seasonPot,
      entries: entries.map(toChainEntry),
      start: start.prices,
      end: end.prices,
      priceProblems: [...start.problems, ...end.problems].map((p) => `${p.token}:${p.reason}`),
      bonus: round.bonus,
      cryptoTokens: crypto,
    });
  }

  async settle(roundId: bigint, dryRun = false): Promise<Settlement> {
    const round = await this.L.reader.round(roundId);
    if (!round) throw new Error(`no round ${roundId}`);
    if (round.status === "settled" || round.status === "voided") throw new Error(`round ${roundId} is ${round.status}`);
    const entries = await this.L.reader.entries(roundId);
    if (entries.length !== round.entryCount) throw new Error(`round ${roundId}: ${entries.length} of ${round.entryCount} entries found (an entry closed early?)`);
    const s = await this.computeSettlement(round, entries);
    this.log(`round ${roundId}: ${entries.length} entries, ${s.teams.length} teams, void=${s.void ?? "no"}${s.median !== null ? `, MEDIAN ${(Number(s.median) / 1e10).toFixed(3)}%` : ""}`);
    for (const t of s.teams) this.log(`  ${t.isWinner ? "WIN " : "    "} ${t.teamKey.slice(0, 8)} ${(Number(t.ret) / 1e10).toFixed(3)}% (${t.members} on team)`);
    if (dryRun) return s;
    await this.L.store.saveInputs(roundId, s.inputs);
    await submitSettlement(this.L.io, this.L.b, this.kp, roundId, s, entries, { lookupTables: await this.L.lookupTables(), log: (m) => this.log(`  ${m}`) });
    await this.onEvent({ kind: "settled", roundId, settlement: s });
    return s;
  }

  /** Pay every remaining entry out and send baskets back. Returns how many entries were closed. */
  async distribute(roundId: bigint): Promise<number> {
    const round = await this.L.reader.round(roundId);
    if (!round || (round.status !== "settled" && round.status !== "voided")) return 0;
    const entries = await this.L.reader.entries(roundId);
    let done = 0;
    for (const e of entries) {
      const ixs = [];
      const owner = e.wallet;
      if (!e.claimed) {
        ixs.push(ensureAtaIx(this.kp.publicKey, owner, this.L.b.env.stakeMint, this.L.b.env.stakeTokenProgram));
        ixs.push(await this.L.b.claim(owner, roundId, this.kp.publicKey));
      }
      const back = e.basket.filter((l) => !l.returned).map((l) => l.mint);
      if (back.length) {
        for (const m of back) ixs.push(ensureAtaIx(this.kp.publicKey, owner, m, this.L.b.tokenProgramOf(m)));
        ixs.push(await this.L.b.returnBasket(this.kp.publicKey, owner, roundId, back));
      }
      if (!ixs.length) continue;
      try {
        await this.send(ixs);
        done++;
        const amount = round.status === "settled" ? e.payout : round.stake;
        if (!e.claimed) await this.onEvent({ kind: "paid", roundId, wallet: owner.toBase58(), amount });
      } catch (err) {
        // e.g. a paused stock token: the owner (or a later tick) can retry.
        this.log(`  distribute ${owner.toBase58().slice(0, 8)}: ${(err as Error).message.split("\n")[0]}`);
      }
    }
    if (done) this.log(`round ${roundId}: paid out ${done} entries`);
    return done;
  }

  /** Do whatever is due. Returns a short description of what it did. */
  async tick(): Promise<string[]> {
    const did: string[] = [];
    const cfg = await this.L.reader.config();
    if (!cfg) throw new Error("league not initialized");
    const now = this.clock();
    const chainNow = (await this.L.io.now()) * 1000;

    // Earlier rounds still holding money: distribute.
    for (let id = cfg.roundCount - 1n; id >= 1n && id >= cfg.roundCount - 3n; id--) {
      if (await this.distribute(id)) did.push(`paid out round ${id}`);
    }

    const latest = cfg.roundCount > 0n ? await this.L.reader.round(cfg.roundCount) : null;
    if (!latest || latest.status === "settled" || latest.status === "voided") {
      if (latest && (await this.distribute(latest.id))) did.push(`paid out round ${latest.id}`);
      if (this.opts.autoOpen) did.push(`opened round ${await this.openRound()}`);
      return did;
    }

    // Rounds can overlap (the next one opens for entries while this one is
    // live): move every unfinished recent round along, oldest first.
    for (let id = cfg.roundCount > 3n ? cfg.roundCount - 3n : 1n; id <= cfg.roundCount; id++) {
      const round = id === latest.id ? latest : await this.L.reader.round(id);
      if (!round || round.status === "settled" || round.status === "voided") continue;
      did.push(...(await this.advance(round, now, chainNow)));
    }
    return did;
  }

  /** Samples, settles and pays one unfinished round as its times come due. */
  private async advance(round: { id: bigint; entryClose: number; end: number }, now: number, chainNow: number): Promise<string[]> {
    const did: string[] = [];
    const id = round.id;
    const closeMs = round.entryClose * 1000;
    const endMs = round.end * 1000;
    const due = async (phase: "start" | "end", from: number) => {
      const have = await this.samplesIn(id, phase, from);
      if (have.length >= this.opts.samples) return false;
      if (now < from || now > from + this.opts.windowMs) return false;
      const last = have.at(-1)?.at ?? 0;
      return now - last >= this.opts.everyMs;
    };

    if (now >= closeMs && (await this.L.store.firstTime(`entries-closed/${id}`))) await this.onEvent({ kind: "entries-closed", roundId: id });
    if (await due("start", closeMs)) {
      await this.sample(id, "start");
      did.push(`start sample round ${id}`);
    }
    if (this.opts.trackMs > 0 && now > closeMs && now < endMs) {
      const last = (await this.L.store.loadSamples(id, "track")).at(-1)?.at ?? 0;
      if (now - last >= this.opts.trackMs) {
        await this.sample(id, "track");
        did.push(`chart sample round ${id}`);
      }
    }
    if (await due("end", endMs)) {
      await this.sample(id, "end");
      did.push(`end sample round ${id}`);
    }
    // Settle when the end samples are in (or their window has passed) and the chain agrees the round is over.
    const endSamples = await this.samplesIn(id, "end", endMs);
    if (chainNow >= endMs && (endSamples.length >= this.opts.samples || now > endMs + this.opts.windowMs)) {
      await this.settle(id);
      did.push(`settled round ${id}`);
      await this.distribute(id);
    }
    return did;
  }

  /** Run tick() forever. */
  async run(everyMs = 30_000): Promise<never> {
    for (;;) {
      try {
        const did = await this.tick();
        if (did.length) this.log(did.join("; "));
      } catch (e) {
        this.log(`tick failed: ${(e as Error).message.split("\n")[0]}`);
      }
      await new Promise((r) => setTimeout(r, everyMs));
    }
  }
}

export function toChainEntry(e: EntryAccount): ChainEntry {
  return {
    index: e.index,
    wallet: e.wallet.toBase58(),
    teamKey: e.teamKey,
    isCreator: e.isCreator,
    claimed: e.claimed,
    payout: e.payout,
    basket: e.isCreator ? { mints: e.basket.map((l) => l.mint.toBase58()), amounts: e.basket.map((l) => l.amount), weightsBps: e.basket.map((l) => l.weightBps) } : undefined,
  };
}

