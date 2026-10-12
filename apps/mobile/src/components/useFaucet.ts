// Testnet: 100 test USDC plus SOL for network fees, from the league's faucet.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { success } from "@/lib/haptics";
import { useConfig } from "@/lib/queries";
import { useWallet } from "@/wallet/WalletProvider";
import { useToast } from "./Toast";

export function useFaucet() {
  const { address } = useWallet();
  const available = !!useConfig().data?.faucet;
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const drip = async () => {
    if (!address || busy) return;
    setBusy(true);
    try {
      const r = await api.faucet(address);
      success();
      toast(`+${r.usdc} test USDC${r.sol ? ` and ${r.sol} SOL for fees` : ""}`, "ok");
      await qc.invalidateQueries();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return { available: available && !!address, busy, drip };
}
