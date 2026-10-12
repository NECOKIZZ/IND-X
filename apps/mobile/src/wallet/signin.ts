// Sign-in methods. Google, email and passkey go through Privy on the phone,
// which keeps an embedded Solana wallet for each user. "wallet" is the wallet
// on this phone through Mobile Wallet Adapter (Seed Vault on a Seeker). In
// the browser, where there's no Privy, the others use the test wallet on
// testnet.

import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useConfig } from "@/lib/queries";
import { useWallet } from "./WalletProvider";
import { privyAvailable, usePrivyLogins } from "./privy";
import type { WalletKind } from "./types";

export type SignInMethod = "google" | "passkey" | "email" | "wallet";

export function useSignIn() {
  const { connect } = useWallet();
  const cluster = useConfig().data?.cluster;
  const privy = usePrivyLogins();
  const [busy, setBusy] = useState<SignInMethod | null>(null);

  const fallback: WalletKind = cluster && cluster !== "mainnet" ? "dev" : Platform.OS === "android" ? "mwa" : "phantom";

  /** Finish a Privy login: pick up its wallet and go to the app. */
  const finishPrivy = useCallback(async () => {
    await connect("privy");
    router.replace("/");
  }, [connect]);

  const signIn = useCallback(
    async (method: SignInMethod) => {
      // Email asks for an address and a code first (its own sheet).
      if (method === "email" && privyAvailable) {
        router.push("/email");
        return;
      }
      setBusy(method);
      try {
        if (method === "wallet") await connect(Platform.OS === "android" ? "mwa" : "phantom");
        else if (privy && method === "google") {
          await privy.google();
          return await finishPrivy();
        } else if (privy && method === "passkey") {
          await privy.passkey();
          return await finishPrivy();
        } else await connect(fallback);
        router.replace("/");
      } finally {
        setBusy(null);
      }
    },
    [connect, privy, fallback, finishPrivy],
  );

  return { signIn, busy, privy, finishPrivy };
}
