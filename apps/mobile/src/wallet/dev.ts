// A wallet kept on this device (secure storage). For test clusters and
// development: the key never leaves the phone, but it isn't backed up.

import { Buffer } from "buffer";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { store } from "./storage";
import type { WalletAdapter } from "./types";

const KEY = "devWallet.secret";

async function load(): Promise<Keypair | null> {
  const s = await store.get(KEY);
  return s ? Keypair.fromSecretKey(bs58.decode(s)) : null;
}

export function devWallet(): WalletAdapter {
  let kp: Keypair | null = null;
  return {
    kind: "dev",
    label: "Test wallet on this device",
    async connect() {
      kp = (await load()) ?? Keypair.generate();
      await store.set(KEY, bs58.encode(kp.secretKey));
      return kp.publicKey.toBase58();
    },
    async restore() {
      kp = await load();
      return kp?.publicKey.toBase58() ?? null;
    },
    async disconnect() {
      // Keep the key: reconnecting gives the same test wallet back.
      kp = null;
    },
    async signTransactions(txs) {
      if (!kp) throw new Error("wallet not connected");
      return txs.map((b64) => {
        const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
        tx.sign([kp!]);
        return Buffer.from(tx.serialize()).toString("base64");
      });
    },
  };
}
