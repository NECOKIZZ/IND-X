// A collectible-style ETF card: a gradient, the basket's real logos, the
// return, and our mark in the corner. Used on the sign-up screen and in the
// League carousel.

import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { font } from "@/theme";
import { LogoStack } from "./AssetLogo";
import { Text } from "./ui";

/** Gradient stops and the text colour that reads on them. */
export const CARD_THEMES = [
  { stops: ["#C5DAC5", "#5E8C78", "#293234"], ink: "#0B0C0E" },
  { stops: ["#C9A6E0", "#6E5A9E", "#241F33"], ink: "#F6F8F5" },
  { stops: ["#E3B98F", "#A0643F", "#3A2418"], ink: "#0B0C0E" },
  { stops: ["#8FB3D9", "#3F6390", "#17243A"], ink: "#F6F8F5" },
  { stops: ["#9FD3C7", "#3E8A7B", "#142A26"], ink: "#0B0C0E" },
] as const;

function MarkBadge() {
  return (
    <View style={{ position: "absolute", right: 10, top: 10, width: 22, height: 22, borderRadius: 7, backgroundColor: "rgba(11,12,14,0.82)", alignItems: "center", justifyContent: "center" }}>
      <Svg width={10} height={10} viewBox="0 0 24 24">
        <Path d="M6 6 L18 18 M18 6 L6 18" stroke="#C5DAC5" strokeWidth={3.4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export function EtfCard({
  name,
  legs,
  retPct,
  theme = 0,
  width = 132,
  height = 172,
  footer,
  style,
}: {
  name: string;
  legs: { logo: string | null; ticker: string }[];
  retPct: string;
  theme?: number;
  width?: number;
  height?: number;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = CARD_THEMES[theme % CARD_THEMES.length];
  const id = `g${theme}`;
  return (
    <View
      style={[
        { width, height, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", boxShadow: "0 18px 40px rgba(0,0,0,0.55)", borderCurve: "continuous" },
        style,
      ]}
    >
      <Svg width="100%" height="100%" style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={t.stops[0]} />
            <Stop offset="0.55" stopColor={t.stops[1]} />
            <Stop offset="1" stopColor={t.stops[2]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <MarkBadge />
      <View style={{ flex: 1, padding: 13, justifyContent: "space-between" }}>
        <Text v="smallStrong" color={t.ink} numberOfLines={2} style={{ fontFamily: font.semibold, marginRight: 24 }}>
          {name}
        </Text>
        <View>
          <LogoStack legs={legs} size={20} max={4} ring="rgba(0,0,0,0.25)" />
          <Text v="title" color={t.ink} style={{ fontSize: 22, lineHeight: 28, marginTop: 6 }}>
            {retPct}
          </Text>
          {footer}
        </View>
      </View>
    </View>
  );
}
