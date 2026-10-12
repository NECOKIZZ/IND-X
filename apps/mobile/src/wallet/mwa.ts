// Solana Mobile Wallet Adapter (Android): Phantom, Solflare, Backpack,
// Seed Vault… on the device. Needs a development build (native module).

import { Buffer } from "buffer";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { transact, type Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { brand } from "@/theme";
import { store } from "./storage";
import type { Chain, WalletAdapter } from "./types";

const TOKEN = "mwa.authToken";
const ADDRESS = "mwa.address";
const identity = { name: brand.name, uri: "https://ind-x-app.onrender.com", icon: "favicon.ico" };

export function mwaWallet(chain: Chain): WalletAdapter {
  let authToken: string | null = null;
  let address: string | null = null;

  async function authorize(w: Web3MobileWallet) {
    const auth = await w.authorize({ chain, identity, auth_token: authToken ?? undefined });
    authToken = auth.auth_token;
    address = new PublicKey(Buffer.from(auth.accounts[0].address, "base64")).toBase58();
    await store.set(TOKEN, authToken);
    await store.set(ADDRESS, address);
    return address;
  }

  return {
    kind: "mwa",
    label: "Wallet app on this phone",
    async connect() {
      return await transact((w) => authorize(w));
    },
    async restore() {
      authToken = await store.get(TOKEN);
      address = await store.get(ADDRESS);
      return authToken ? address : null;
    },
    async disconnect() {
      if (authToken) {
        const token = authToken;
        await transact((w) => w.deauthorize({ auth_token: token })).catch(() => {});
      }
      authToken = null;
      address = null;
      await store.del(TOKEN);
      await store.del(ADDRESS);
    },
    async signTransactions(txs) {
      return await transact(async (w) => {
        await authorize(w);
        const signed = await w.signTransactions({ transactions: txs.map((b) => VersionedTransaction.deserialize(Buffer.from(b, "base64"))) });
        return signed.map((t) => Buffer.from(t.serialize()).toString("base64")) as string[];
      });
    },
  };
}
