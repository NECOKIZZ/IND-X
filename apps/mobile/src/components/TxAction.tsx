// Plan → sign → send, with haptics and a toast. Screens pass a function
// that asks the server for the plan.

import { useState } from "react";
import { router } from "expo-router";
import type { TxPlan } from "@indx/core";
import { useWallet } from "@/wallet/WalletProvider";
import { failure, success } from "@/lib/haptics";
import { useToast } from "./Toast";

export function useTxAction() {
  const wallet = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(makePlan: (wallet: string) => Promise<TxPlan>, done: string, after?: (plan: TxPlan) => void): Promise<boolean> {
    if (!wallet.address) {
      router.push("/connect");
      return false;
    }
    setBusy(true);
    try {
      const plan = await makePlan(wallet.address);
      await wallet.signAndSend(plan);
      success();
      toast(done, "ok");
      after?.(plan);
      return true;
    } catch (e) {
      failure();
      const msg = (e as Error).message ?? String(e);
      toast(/declin|reject|cancel/i.test(msg) ? "Cancelled in your wallet" : msg, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}
