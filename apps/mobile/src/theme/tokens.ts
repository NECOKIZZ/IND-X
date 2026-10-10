// Ind-X design tokens. Every screen reads colors, type and spacing from
// here.
//
// Brand palette:
//   sage      #C5DAC5  pastel green (the brand color)
//   gunmetal  #293234  its complement
//   ink       #0B0C0E  our black
//   mist      #F6F8F5  our white (a whisper of sage)
// Light mode leads (airy, glassy, iOS-like); dark mode is gunmetal-tinted.

export const palette = {
  sage: "#C5DAC5",
  sageDeep: "#9DBE9D",
  sageSoft: "#E4EEE4",
  gunmetal: "#293234",
  gunmetalSoft: "#3A4547",
  ink: "#0B0C0E",
  ink2: "#141819",
  ink3: "#1C2224",
  mist: "#F6F8F5",
  white: "#FFFFFF",
} as const;

export interface Colors {
  scheme: "light" | "dark";
  bg: string;
  /** Cards and sheets. */
  surface: string;
  /** Inputs, segmented controls, quiet fills. */
  fill: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Primary action: ink pill in light mode, sage pill in dark mode. */
  primary: string;
  onPrimary: string;
  /** Secondary action: sage pill. */
  secondary: string;
  onSecondary: string;
  brand: string;
  /** Gains / above the line. */
  up: string;
  upSoft: string;
  /** Losses / below the line. */
  down: string;
  downSoft: string;
  /** The round's line (the Index) and draws. */
  line: string;
  /** Glass (floating nav, sheets). */
  glass: string;
  glassBorder: string;
  /** Glow blobs behind hero cards. */
  glowA: string;
  glowB: string;
  shadow: string;
}

export const light: Colors = {
  scheme: "light",
  bg: palette.mist,
  surface: palette.white,
  fill: "#EEF2ED",
  border: "rgba(41,50,52,0.10)",
  text: palette.ink,
  textMuted: "rgba(41,50,52,0.68)",
  textFaint: "rgba(41,50,52,0.42)",
  primary: palette.ink,
  onPrimary: palette.white,
  secondary: palette.sageSoft,
  onSecondary: palette.gunmetal,
  brand: palette.sage,
  up: "#2F7D52",
  upSoft: "#E1F0E6",
  down: "#B4432F",
  downSoft: "#F7E5E1",
  line: palette.gunmetal,
  glass: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(41,50,52,0.08)",
  glowA: palette.sage,
  glowB: "#DCE7E2",
  shadow: "rgba(41,50,52,0.12)",
};

export const dark: Colors = {
  scheme: "dark",
  bg: palette.ink,
  surface: palette.ink2,
  fill: palette.ink3,
  border: "rgba(197,218,197,0.10)",
  text: "#EEF2ED",
  textMuted: "rgba(238,242,237,0.64)",
  textFaint: "rgba(238,242,237,0.38)",
  primary: palette.sage,
  onPrimary: palette.ink,
  secondary: palette.gunmetal,
  onSecondary: palette.sage,
  brand: palette.sage,
  up: "#8FD3AD",
  upSoft: "rgba(143,211,173,0.12)",
  down: "#F08A7E",
  downSoft: "rgba(240,138,126,0.12)",
  line: palette.sage,
  glass: "rgba(28,34,36,0.72)",
  glassBorder: "rgba(197,218,197,0.10)",
  glowA: palette.gunmetal,
  glowB: "#1E2A26",
  shadow: "rgba(0,0,0,0.5)",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Room to leave under scrolling content for the floating tab bar. */
export const TAB_BAR_SPACE = 120;

/**
 * Font families, one per weight (custom fonts ignore fontWeight on
 * Android). Geist for now; to use Aeonik (what gloam.trade uses, a licensed
 * font), add its files to assets/fonts and point these names at them in
 * src/theme/fonts.ts.
 */
export const font = {
  light: "Ind-Light",
  regular: "Ind-Regular",
  medium: "Ind-Medium",
  semibold: "Ind-SemiBold",
  mono: "Ind-Mono",
} as const;

export const type = {
  /** Big numbers and page titles: light and tight, like gloam's headlines. */
  display: { fontFamily: font.light, fontSize: 52, lineHeight: 56, letterSpacing: -2 },
  hero: { fontFamily: font.light, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 },
  title: { fontFamily: font.light, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  heading: { fontFamily: font.medium, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  /** Small caps labels: THE APP, ENTRIES CLOSE IN… */
  label: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: "uppercase" as const },
  mono: { fontFamily: font.mono, fontSize: 13, lineHeight: 18 },
  number: { fontVariant: ["tabular-nums" as const] },
};
