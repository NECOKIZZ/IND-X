// Design tokens. PLACEHOLDER BRAND: neutral palette and system fonts until
// the name, colors, fonts and logo are decided. Every screen reads colors,
// type and spacing from here, so the brand drops in by editing this file
// (and `brand.ts`).

import { Platform } from "react-native";

/** Raw palette (placeholder). */
const palette = {
  ink: "#0B0D12",
  ink2: "#151821",
  ink3: "#1F2330",
  paper: "#FFFFFF",
  paper2: "#F4F5F7",
  paper3: "#E8EAEE",
  gray400: "#9AA0AB",
  gray600: "#5F6672",
  accent: "#4F6BFF", // placeholder brand color
  accentDark: "#7D93FF",
  green: "#12A150",
  greenDark: "#2BD37A",
  red: "#E5484D",
  redDark: "#FF6B6F",
  amber: "#D9930D",
  amberDark: "#F5B841",
};

export interface Colors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentText: string;
  /** Above MEDIAN / gains. */
  up: string;
  /** Below MEDIAN / losses. */
  down: string;
  /** On MEDIAN / draws, and the MEDIAN line itself. */
  median: string;
  overlay: string;
}

export const light: Colors = {
  bg: palette.paper,
  surface: palette.paper2,
  surfaceAlt: palette.paper3,
  border: "#E2E4E9",
  text: palette.ink,
  textMuted: palette.gray600,
  textInverse: palette.paper,
  accent: palette.accent,
  accentText: palette.paper,
  up: palette.green,
  down: palette.red,
  median: palette.amber,
  overlay: "rgba(0,0,0,0.4)",
};

export const dark: Colors = {
  bg: palette.ink,
  surface: palette.ink2,
  surfaceAlt: palette.ink3,
  border: "#262B38",
  text: "#F2F3F5",
  textMuted: palette.gray400,
  textInverse: palette.ink,
  accent: palette.accentDark,
  accentText: palette.ink,
  up: palette.greenDark,
  down: palette.redDark,
  median: palette.amberDark,
  overlay: "rgba(0,0,0,0.6)",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Placeholder: system fonts. Swap for the brand's (load them with expo-font). */
export const fonts = {
  body: Platform.select({ ios: "System", default: undefined }),
  display: Platform.select({ ios: "System", default: undefined }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

export const type = {
  hero: { fontSize: 40, lineHeight: 46, fontWeight: "800" as const, letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800" as const, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
  number: { fontVariant: ["tabular-nums" as const] },
};
