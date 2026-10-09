import { useColorScheme } from "react-native";
import { dark, light, type Colors } from "./tokens";

export * from "./tokens";
export { brand } from "./brand";

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/** Color for a return or a standing. */
export function signColor(c: Colors, v: number | null | undefined) {
  if (v === null || v === undefined || Math.abs(v) < 1e-9) return c.textMuted;
  return v > 0 ? c.up : c.down;
}
