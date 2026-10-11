import { dark, light, type Colors } from "./tokens";
import { useAppearance } from "./scheme";

export * from "./tokens";
export { brand } from "./brand";
export { AppearanceProvider, useAppearance, type Appearance } from "./scheme";

export function useColors(): Colors {
  return useAppearance().scheme === "dark" ? dark : light;
}

/** Color for a return. */
export function signColor(c: Colors, v: number | null | undefined) {
  if (v === null || v === undefined || Math.abs(v) < 0.005) return c.textMuted; // rounds to 0.00%
  return v > 0 ? c.up : c.down;
}
