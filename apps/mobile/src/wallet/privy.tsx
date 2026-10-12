// The browser build (and the default for type checking) has no Privy (its SDK here is for phones): Google, email
// and passkey fall back to the test wallet on testnet.

import type { ReactNode } from "react";
import type { PrivyLogins } from "./privyBridge";

export const privyAvailable = false;

export function PrivyRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function usePrivyLogins(): PrivyLogins | null {
  return null;
}
