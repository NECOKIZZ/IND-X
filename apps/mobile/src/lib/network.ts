// Testnet or mainnet: each has its own league server (and its own money).
// The choice is kept on the device; switching reloads the app against the
// other server and keeps you signed in.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { MAINNET_API_URL, TESTNET_API_URL } from "./config";
import { store } from "@/wallet/storage";

export type Network = "testnet" | "mainnet";

const KEY = "network";
let current: Network = "testnet";
let loaded = false;
const listeners = new Set<() => void>();

/** Mainnet is selectable once its server is configured (EXPO_PUBLIC_MAINNET_API_URL). */
export const mainnetAvailable = !!MAINNET_API_URL;

export function apiUrl() {
  return current === "mainnet" && MAINNET_API_URL ? MAINNET_API_URL : TESTNET_API_URL;
}

export function getNetwork() {
  return current;
}

export async function setNetwork(n: Network) {
  if (n === "mainnet" && !mainnetAvailable) throw new Error("Mainnet isn't live yet");
  current = n;
  await store.set(KEY, n);
  listeners.forEach((l) => l());
}

let reloader: (() => void) | null = null;

/** The root layout registers how to reload everything (splash, fresh data). */
export function onReload(fn: () => void) {
  reloader = fn;
  return () => {
    if (reloader === fn) reloader = null;
  };
}

/** Reload the app: the browser reloads the page, the native app refetches behind the splash. */
export function reloadApp() {
  if (Platform.OS === "web" && typeof window !== "undefined") window.location.reload();
  else reloader?.();
}

export function useNetwork() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => current,
  );
}

/** Load the saved choice once at startup; true when ready. */
export function useNetworkReady() {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    store
      .get(KEY)
      .then((v) => {
        if (v === "mainnet" && mainnetAvailable) current = "mainnet";
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        setReady(true);
      });
  }, []);
  return ready;
}
