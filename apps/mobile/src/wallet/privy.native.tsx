// Privy on the phone: Google, email codes and passkeys, each with an embedded
// Solana wallet that Privy keeps for the user. A small bridge lets the wallet
// adapter (outside React) read the address and sign with it.

import { useEffect, type ReactNode } from "react";
import { PrivyProvider, useEmbeddedSolanaWallet, useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/expo";
import { useLoginWithPasskey, useSignupWithPasskey } from "@privy-io/expo/passkey";
import { PASSKEY_DOMAIN, PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/lib/config";
import { setPrivyBridge, type PrivyLogins } from "./privyBridge";

export const privyAvailable = !!PRIVY_APP_ID;

export function PrivyRoot({ children }: { children: ReactNode }) {
  if (!privyAvailable) return <>{children}</>;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID} config={{ embedded: { solana: { createOnLogin: "users-without-wallets" } } }}>
      <Bridge />
      {children}
    </PrivyProvider>
  );
}

function Bridge() {
  const { isReady, user, logout } = usePrivy();
  const sol = useEmbeddedSolanaWallet();
  useEffect(() => {
    setPrivyBridge({
      ready: isReady,
      loggedIn: !!user,
      address: sol.wallets?.[0]?.address ?? null,
      status: sol.status,
      create: async () => {
        if ("create" in sol && sol.create) await sol.create();
      },
      sign: async (txs) => {
        const w = sol.wallets?.[0];
        if (!w) throw new Error("No Privy wallet yet");
        const provider = await w.getProvider();
        const out: Uint8Array[] = [];
        for (const transaction of txs) out.push((await provider.request({ method: "signTransaction", params: { transaction } })).signedTransaction);
        return out;
      },
      logout,
    });
  }, [isReady, user, sol, logout]);
  return null;
}

export function usePrivyLogins(): PrivyLogins | null {
  const oauth = useLoginWithOAuth();
  const email = useLoginWithEmail();
  const passkeyLogin = useLoginWithPasskey();
  const passkeySignup = useSignupWithPasskey();
  if (!privyAvailable) return null;
  return {
    google: async () => {
      await oauth.login({ provider: "google" });
    },
    sendEmailCode: async (address) => {
      await email.sendCode({ email: address });
    },
    loginWithEmailCode: async (address, code) => {
      await email.loginWithCode({ email: address, code });
    },
    passkey: async () => {
      try {
        await passkeyLogin.loginWithPasskey({ relyingParty: PASSKEY_DOMAIN });
      } catch (e) {
        // No passkey for IndX on this phone yet: make one (unless they cancelled).
        if (/cancel/i.test((e as Error).message)) throw e;
        await passkeySignup.signupWithPasskey({ relyingParty: PASSKEY_DOMAIN });
      }
    },
  };
}
