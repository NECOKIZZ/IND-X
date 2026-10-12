// Sign-in methods on the welcome screen. Google, Apple, passkey, email and
// wallet import belong to the embedded wallet provider (Privy, once its app
// id is set). Until then every method signs in with the wallet that works
// here: the device test wallet on testnet, a wallet app on mainnet. On a
// Seeker, Seed Vault comes first.

import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useConfig } from "@/lib/queries";
import { useWallet } from "./WalletProvider";
import type { WalletKind } from "./types";

export type SignInMethod = "google" | "apple" | "passkey" | "email" | "import" | "wallet";

export function useSignIn() {
  const { connect } = useWallet();
  const cluster = useConfig().data?.cluster;
  const [busy, setBusy] = useState<SignInMethod | null>(null);

  const signIn = useCallback(
    async (method: SignInMethod) => {
      // "wallet" = the wallet on this phone through Mobile Wallet Adapter
      // (Seed Vault on a Seeker; Phantom, Solflare… elsewhere on Android).
      const kind: WalletKind =
        method === "wallet" ? (Platform.OS === "android" ? "mwa" : "phantom") : cluster && cluster !== "mainnet" ? "dev" : Platform.OS === "android" ? "mwa" : "phantom";
      setBusy(method);
      try {
        await connect(kind);
        router.replace("/");
      } finally {
        setBusy(null);
      }
    },
    [cluster, connect],
  );

  return { signIn, busy };
}
