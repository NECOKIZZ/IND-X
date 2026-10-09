// Keeper and app data: price samples, published settlement inputs, push
// tokens and sent-notification markers. BigInts are saved as strings.
//
//   DATABASE_URL set  → Postgres (e.g. Supabase), one small key/value table,
//                       so rounds survive restarts and redeploys.
//   otherwise         → JSON files under LEAGUE_DATA_DIR (default data/).
//   memory            → new Store(new MemoryKV()) for tests.
//
// Keys: rounds/<id>/<phase>/<13-digit ms>, rounds/<id>/inputs,
//       push/<wallet>/<token>, sent/<event key>.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import type { PriceSample } from "@indx/core";

/** start / end: the scoring windows. track: chart samples while the round runs (never scored). */
export type Phase = "start" | "end" | "track";
export type SavedSample = { at: number; sample: Map<string, PriceSample> };
type Row = Omit<PriceSample, "value"> & { value: string };

export interface KV {
  get(k: string): Promise<unknown | null>;
  put(k: string, v: unknown): Promise<void>;
  /** Keys with this prefix, sorted. */
  list(prefix: string): Promise<{ k: string; v: unknown }[]>;
  del(k: string): Promise<void>;
}

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const plain = (x: unknown) => JSON.parse(JSON.stringify(x, replacer));
const toSample = (rows: Row[]) => new Map(rows.map((r) => [r.token, { ...r, value: BigInt(r.value) }]));
const pad = (at: number) => String(at).padStart(13, "0");

export class MemoryKV implements KV {
  private m = new Map<string, unknown>();
  async get(k: string) {
    return this.m.has(k) ? plain(this.m.get(k)) : null;
  }
  async put(k: string, v: unknown) {
    this.m.set(k, plain(v));
  }
  async list(prefix: string) {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => ({ k, v: this.m.get(k) }));
  }
  async del(k: string) {
    this.m.delete(k);
  }
}

/** One JSON file per key under `root` (keys are paths). */
export class FileKV implements KV {
  constructor(private root = process.env.LEAGUE_DATA_DIR ?? "data") {}
  private file(k: string) {
    return join(this.root, `${k}.json`);
  }
  async get(k: string) {
    const f = this.file(k);
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  }
  async put(k: string, v: unknown) {
    const f = this.file(k);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(v, replacer));
  }
  async list(prefix: string) {
    const dir = join(this.root, prefix.endsWith("/") ? prefix : dirname(prefix));
    if (!existsSync(dir)) return [];
    const out: { k: string; v: unknown }[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, name.name);
        if (name.isDirectory()) walk(p);
        else if (name.name.endsWith(".json")) {
          const k = p.slice(this.root.length + 1, -5);
          if (k.startsWith(prefix)) out.push({ k, v: JSON.parse(readFileSync(p, "utf8")) });
        }
      }
    };
    walk(dir);
    return out.sort((a, b) => (a.k < b.k ? -1 : 1));
  }
  async del(k: string) {
    rmSync(this.file(k), { force: true });
  }
}

const TABLE = "league_kv";

export class PgKV implements KV {
  private ready: Promise<unknown> | null = null;
  constructor(private sql: postgres.Sql) {}
  // Creates the table on first use; a failed attempt is retried next time.
  private table() {
    this.ready ??= this.sql`create table if not exists ${this.sql(TABLE)} (k text primary key, v jsonb not null, at timestamptz not null default now())`.catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }
  async get(k: string) {
    await this.table();
    const rows = await this.sql<{ v: unknown }[]>`select v from ${this.sql(TABLE)} where k = ${k}`;
    return rows[0]?.v ?? null;
  }
  async put(k: string, v: unknown) {
    await this.table();
    await this.sql`insert into ${this.sql(TABLE)} (k, v) values (${k}, ${this.sql.json(plain(v))}) on conflict (k) do update set v = excluded.v, at = now()`;
  }
  async list(prefix: string) {
    await this.table();
    return this.sql<{ k: string; v: unknown }[]>`select k, v from ${this.sql(TABLE)} where k like ${prefix + "%"} order by k`;
  }
  async del(k: string) {
    await this.table();
    await this.sql`delete from ${this.sql(TABLE)} where k = ${k}`;
  }
}

export class Store {
  constructor(readonly kv: KV) {}

  async saveSample(roundId: bigint, phase: Phase, sample: Map<string, PriceSample>, at: number) {
    const k = `rounds/${roundId}/${phase}/${pad(at)}`;
    await this.kv.put(k, [...sample.values()]);
    return k;
  }

  async loadSamples(roundId: bigint, phase: Phase): Promise<SavedSample[]> {
    const rows = await this.kv.list(`rounds/${roundId}/${phase}/`);
    return rows.map((r) => ({ at: Number(r.k.split("/").pop()), sample: toSample(r.v as Row[]) }));
  }

  async saveInputs(roundId: bigint, inputs: unknown) {
    const k = `rounds/${roundId}/inputs`;
    await this.kv.put(k, inputs);
    return k;
  }

  async loadInputs(roundId: bigint): Promise<any | null> {
    return this.kv.get(`rounds/${roundId}/inputs`);
  }

  /** Rounds with published inputs, newest first. */
  async settledRoundIds(): Promise<bigint[]> {
    const rows = await this.kv.list("rounds/");
    return rows
      .filter((r) => r.k.endsWith("/inputs"))
      .map((r) => BigInt(r.k.split("/")[1]))
      .sort((a, b) => (b > a ? 1 : -1));
  }

  async addPushToken(wallet: string, token: string) {
    await this.kv.put(`push/${wallet}/${encodeURIComponent(token)}`, { at: Date.now() });
  }
  async removePushToken(wallet: string, token: string) {
    await this.kv.del(`push/${wallet}/${encodeURIComponent(token)}`);
  }
  async pushTokens(wallet?: string): Promise<{ wallet: string; token: string }[]> {
    const rows = await this.kv.list(wallet ? `push/${wallet}/` : "push/");
    return rows.map((r) => {
      const [, w, t] = r.k.split("/");
      return { wallet: w, token: decodeURIComponent(t) };
    });
  }

  /** True the first time it is called for `key` (dedupes notifications). */
  async firstTime(key: string): Promise<boolean> {
    if (await this.kv.get(`sent/${key}`)) return false;
    await this.kv.put(`sent/${key}`, { at: Date.now() });
    return true;
  }
}

let shared: Store | null = null;

/** The app's store: Postgres when DATABASE_URL is set, files otherwise. */
export function leagueStore(): Store {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  // prepare: false works through Supabase's transaction pooler too.
  shared = new Store(url ? new PgKV(postgres(url, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} })) : new FileKV());
  return shared;
}

export function setLeagueStore(s: Store) {
  shared = s;
}
