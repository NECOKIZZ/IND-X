// The IndX mark (an X: one long stroke and two short ones) and the wordmark.

import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { brand, font, useColors } from "@/theme";
import { Text } from "./ui";

/** The X's three strokes, in a 168 × 152.5 box. */
export const MARK_PATHS = [
  "M168 0H135.675L67.8369 76.2598L0 152.52H32.3252L100.162 76.2598L168 0Z",
  "M168 152.521H135.675L87.3457 98.1904L103.508 80.0215L168 152.521Z",
  "M80.6533 54.3291L64.4912 72.498L0 0H32.3252L80.6533 54.3291Z",
];
export const MARK_VIEWBOX = "0 0 168 153";
export const MARK_RATIO = 152.521 / 168;

/** Just the X, in a color. */
export function MarkGlyph({ width, color, paths = MARK_PATHS }: { width: number; color: string; paths?: string[] }) {
  return (
    <Svg width={width} height={width * MARK_RATIO} viewBox={MARK_VIEWBOX}>
      {paths.map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}

/** The X on its tile (app icon style). */
export function Mark({ size = 28 }: { size?: number }) {
  const c = useColors();
  const dark = c.scheme === "dark";
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: dark ? c.secondary : c.text, alignItems: "center", justifyContent: "center", borderCurve: "continuous" }}>
      <MarkGlyph width={size * 0.52} color={dark ? c.onSecondary : c.bg} />
    </View>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.32 }}>
      <Mark size={size} />
      <Text v="heading" style={{ fontFamily: font.medium, fontSize: size * 0.72, letterSpacing: -0.6 }}>
        {brand.name}
      </Text>
    </View>
  );
}
