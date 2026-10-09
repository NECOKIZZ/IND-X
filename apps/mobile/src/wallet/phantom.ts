// Phantom via deeplinks (iOS and Android, no native module): connect and
// signAllTransactions round-trip through phantom.app/ul/v1 and back to
// this app's scheme, encrypted with an x25519 box per session.

import { Buffer } from "buffer";
import * as Linking from "expo-linking";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { SCHEME } from "@/lib/config";
import { store } from "./storage";
import type { Chain, WalletAdapter } from "./types";

const SESSION = "phantom.session";
const BASE = "https://phantom.app/ul/v1";

interface Session {
  dappSecret: string; // bs58 x25519 secret key
  phantomPublic: string;
  session: string;
  address: string;
}

const waiters = new Map<string, (url: URL) => void>();
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  Linking.addEventListener("url", ({ url }) => {
    const u = new URL(url);
    const key = u.pathname.replace(/^\/+/, "") || u.host; // indx://phantom-connect
    const w = waiters.get(key) ?? waiters.get(u.host);
    if (w) {
      waiters.delete(key);
      waiters.delete(u.host);
      w(u);
    }
  });
}

function waitFor(path: string, timeoutMs = 120_000): Promise<URL> {
  listen();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      waiters.delete(path);
      reject(new Error("Phantom didn't answer"));
    }, timeoutMs);
    waiters.set(path, (u) => {
      clearTimeout(t);
      const err = u.searchParams.get("errorMessage");
      if (err) reject(new Error(err));
      else resolve(u);
    });
  });
}

function decrypt(data: string, nonce: string, shared: Uint8Array): any {
  const out = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), shared);
  if (!out) throw new Error("couldn't read Phantom's answer");
  return JSON.parse(Buffer.from(out).toString("utf8"));
}

function encrypt(payload: unknown, shared: Uint8Array) {
  const nonce = nacl.randomBytes(24);
  const box = nacl.box.after(Buffer.from(JSON.stringify(payload)), nonce, shared);
  return { nonce: bs58.encode(nonce), payload: bs58.encode(box) };
}

export function phantomWallet(chain: Chain): WalletAdapter {
  let s: Session | null = null;
  const cluster = chain === "solana:mainnet" ? "mainnet-beta" : "devnet";
  const shared = () => nacl.box.before(bs58.decode(s!.phantomPublic), bs58.decode(s!.dappSecret));

  return {
    kind: "phantom",
    label: "Phantom",
    async connect() {
      const kp = nacl.box.keyPair();
      const redirect = Linking.createURL("phantom-connect", { scheme: SCHEME });
      const qs = new URLSearchParams({ app_url: "https://ind-x.app", dapp_encryption_public_key: bs58.encode(kp.publicKey), redirect_link: redirect, cluster });
      const answer = waitFor("phantom-connect");
      await Linking.openURL(`${BASE}/connect?${qs}`);
      const u = await answer;
      const phantomPublic = u.searchParams.get("phantom_encryption_public_key")!;
      const sh = nacl.box.before(bs58.decode(phantomPublic), kp.secretKey);
      const data = decrypt(u.searchParams.get("data")!, u.searchParams.get("nonce")!, sh);
      s = { dappSecret: bs58.encode(kp.secretKey), phantomPublic, session: data.session, address: data.public_key };
      await store.set(SESSION, JSON.stringify(s));
      return s.address;
    },
    async restore() {
      const raw = await store.get(SESSION);
      s = raw ? (JSON.parse(raw) as Session) : null;
      return s?.address ?? null;
    },
    async disconnect() {
      s = null;
      await store.del(SESSION);
    },
    async signTransactions(txs) {
      if (!s) throw new Error("wallet not connected");
      const transactions = txs.map((b) => bs58.encode(Buffer.from(b, "base64")));
      const { nonce, payload } = encrypt({ transactions, session: s.session }, shared());
      const redirect = Linking.createURL("phantom-sign", { scheme: SCHEME });
      const qs = new URLSearchParams({ dapp_encryption_public_key: bs58.encode(nacl.box.keyPair.fromSecretKey(bs58.decode(s.dappSecret)).publicKey), nonce, redirect_link: redirect, payload });
      const answer = waitFor("phantom-sign");
      await Linking.openURL(`${BASE}/signAllTransactions?${qs}`);
      const u = await answer;
      const data = decrypt(u.searchParams.get("data")!, u.searchParams.get("nonce")!, shared());
      return (data.transactions as string[]).map((t) => Buffer.from(VersionedTransaction.deserialize(bs58.decode(t)).serialize()).toString("base64"));
    },
  };
}
