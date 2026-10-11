// Data hooks (TanStack Query). Live screens poll; everything refreshes on focus.

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useConfig = () => useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000 });
export const useAssets = () => useQuery({ queryKey: ["assets"], queryFn: api.assets, refetchInterval: 30_000 });
export const useRound = (id = "current") => useQuery({ queryKey: ["round", id], queryFn: () => api.round(id), refetchInterval: 15_000 });
export const useRounds = () => useQuery({ queryKey: ["rounds"], queryFn: api.rounds, refetchInterval: 60_000 });
export const useEtf = (round: string, key: string) => useQuery({ queryKey: ["etf", round, key], queryFn: () => api.etf(round, key), refetchInterval: 15_000 });
export const useActivity = (round = "current") => useQuery({ queryKey: ["activity", round], queryFn: () => api.activity(round), refetchInterval: 20_000 });
export const usePool = () => useQuery({ queryKey: ["pool"], queryFn: api.pool, refetchInterval: 5_000 });
export const useLeaderboard = () => useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard, staleTime: 60_000 });
export const useWalletView = (wallet: string | null) =>
  useQuery({ queryKey: ["wallet", wallet], queryFn: () => api.wallet(wallet!), enabled: !!wallet, refetchInterval: 20_000 });
