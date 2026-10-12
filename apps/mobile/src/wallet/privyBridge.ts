// What the Privy provider shares with the wallet adapter, which lives outside
// React. Set from inside <PrivyProvider>; read by privyWallet().

import { Buffer } from "buffer";
import type { WalletAdapter } from "./types";

export interface PrivyBridgeState {
  ready: boolean;
  loggedIn: boolean;
  address: string | null;
  status: string;
  create(): Promise<void>;
  sign(txs: Uint8Array[]): Promise<Uint8Array[]>;
  logout(): Promise<void>;
}

export interface PrivyLogins {
  google(): Promise<void>;
  sendEmailCode(email: string): Promise<void>;
  loginWithEmailCode(email: string, code: string): Promise<void>;
  passkey(): Promise<void>;
}

let state: PrivyBridgeState | null = null;
const waiters = new Set<() => void>();

export function setPrivyBridge(s: PrivyBridgeState) {
  state = s;
  waiters.forEach((w) => w());
}

/** Wait until the bridge satisfies `ok` (or time out). */
function until(ok: (s: PrivyBridgeState) => boolean, ms: number): Promise<PrivyBridgeState | null> {
  return new Promise((resolve) => {
    const check = () => {
      if (state && ok(state)) {
        waiters.delete(check);
        clearTimeout(t);
        resolve(state);
      }
    };
    const t = setTimeout(() => {
      waiters.delete(check);
      resolve(state);
    }, ms);
    waiters.add(check);
    check();
  });
}

async function walletAddress(ms: number): Promise<string | null> {
  const s = await until((x) => x.ready, ms);
  if (!s?.loggedIn) return null;
  if (s.address) return s.address;
  // Logged in without a wallet yet: Privy makes one on login; nudge it if not.
  if (s.status === "not-created") await s.create().catch(() => {});
  return (await until((x) => !!x.address, 20_000))?.address ?? null;
}

export function privyWallet(): WalletAdapter {
  return {
    kind: "privy",
    label: "Privy wallet",
    async connect() {
      const a = await walletAddress(15_000);
      if (!a) throw new Error("Sign-in didn't finish. Try again.");
      return a;
    },
    async restore() {
      return walletAddress(8_000);
    },
    async disconnect() {
      await state?.logout().catch(() => {});
    },
    async signTransactions(txs) {
      if (!state) throw new Error("Wallet not ready");
      const signed = await state.sign(txs.map((b) => new Uint8Array(Buffer.from(b, "base64"))));
      return signed.map((t) => Buffer.from(t).toString("base64"));
    },
  };
}
