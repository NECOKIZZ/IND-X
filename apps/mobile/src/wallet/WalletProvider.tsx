// The connected wallet, app-wide. Screens call signAndSend(plan): the wallet
// signs every transaction in one approval, then the server relays them.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { TxPlan } from "@indx/core";
import { api } from "@/lib/api";
import { useConfig } from "@/lib/queries";
import { store } from "./storage";
import { devWallet } from "./dev";
import { phantomWallet } from "./phantom";
import type { Chain, WalletAdapter, WalletKind } from "./types";

const KIND = "wallet.kind";

export interface WalletOption {
  kind: WalletKind;
  label: string;
  detail: string;
}

interface WalletState {
  address: string | null;
  kind: WalletKind | null;
  ready: boolean;
  options: WalletOption[];
  connect(kind: WalletKind): Promise<string>;
  disconnect(): Promise<void>;
  /** Sign and relay a plan; returns the signatures. */
  signAndSend(plan: TxPlan): Promise<string[]>;
  /** Sign without sending (proofs like claiming a @tag). */
  signOnly(txs: string[]): Promise<string[]>;
}

const Ctx = createContext<WalletState | null>(null);

function makeAdapter(kind: WalletKind, chain: Chain): WalletAdapter {
  if (kind === "dev") return devWallet();
  if (kind === "phantom") return phantomWallet(chain);
  // Loaded lazily: a native module that only exists in Android builds.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mwaWallet } = require("./mwa") as typeof import("./mwa");
  return mwaWallet(chain);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const chain: Chain = config?.cluster === "mainnet" ? "solana:mainnet" : "solana:devnet";
  const [adapter, setAdapter] = useState<WalletAdapter | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const options = useMemo<WalletOption[]>(() => {
    const o: WalletOption[] = [];
    if (Platform.OS === "android") o.push({ kind: "mwa", label: "Wallet on this phone", detail: "Phantom, Solflare, Backpack, Seed Vault…" });
    if (Platform.OS !== "web") o.push({ kind: "phantom", label: "Phantom", detail: "Opens the Phantom app to approve" });
    if (config && config.cluster !== "mainnet") o.push({ kind: "dev", label: "Test wallet", detail: "A wallet kept on this device, for test money" });
    return o;
  }, [config]);

  // Restore the last session.
  useEffect(() => {
    if (!config) return;
    (async () => {
      const kind = (await store.get(KIND)) as WalletKind | null;
      if (kind) {
        try {
          const a = makeAdapter(kind, chain);
          const addr = await a.restore();
          if (addr) {
            setAdapter(a);
            setAddress(addr);
          }
        } catch {
          // A wallet that isn't available any more: start disconnected.
        }
      }
      setReady(true);
    })();
  }, [config, chain]);

  const connect = useCallback(
    async (kind: WalletKind) => {
      const a = makeAdapter(kind, chain);
      const addr = await a.connect();
      await store.set(KIND, kind);
      setAdapter(a);
      setAddress(addr);
      return addr;
    },
    [chain],
  );

  const disconnect = useCallback(async () => {
    await adapter?.disconnect();
    await store.del(KIND);
    setAdapter(null);
    setAddress(null);
    qc.removeQueries({ queryKey: ["wallet"] });
  }, [adapter, qc]);

  const signAndSend = useCallback(
    async (plan: TxPlan) => {
      if (!adapter) throw new Error("Connect a wallet first");
      const signed = await adapter.signTransactions(plan.transactions);
      const sigs: string[] = [];
      for (const tx of signed) sigs.push((await api.send(tx)).signature);
      await qc.invalidateQueries();
      return sigs;
    },
    [adapter, qc],
  );

  const signOnly = useCallback(
    async (txs: string[]) => {
      if (!adapter) throw new Error("Connect a wallet first");
      return adapter.signTransactions(txs);
    },
    [adapter],
  );

  const value = useMemo(
    () => ({ address, kind: adapter?.kind ?? null, ready, options, connect, disconnect, signAndSend, signOnly }),
    [address, adapter, ready, options, connect, disconnect, signAndSend, signOnly],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
