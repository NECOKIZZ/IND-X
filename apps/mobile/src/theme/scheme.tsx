// Appearance: dark by default. Light or "follow the phone" can be chosen in
// Portfolio; the choice is remembered on the device.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { store } from "@/wallet/storage";

export type Appearance = "dark" | "light" | "system";
const KEY = "appearance";

const Ctx = createContext<{ appearance: Appearance; scheme: "dark" | "light"; setAppearance: (a: Appearance) => void }>({
  appearance: "dark",
  scheme: "dark",
  setAppearance: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setState] = useState<Appearance>("dark");
  useEffect(() => {
    store
      .get(KEY)
      .then((v) => {
        if (v === "dark" || v === "light" || v === "system") setState(v);
      })
      .catch(() => {});
  }, []);
  const setAppearance = (a: Appearance) => {
    setState(a);
    void store.set(KEY, a).catch(() => {});
  };
  const scheme = appearance === "system" ? (system === "light" ? "light" : "dark") : appearance;
  return <Ctx.Provider value={{ appearance, scheme, setAppearance }}>{children}</Ctx.Provider>;
}

export const useAppearance = () => useContext(Ctx);
