// PLACEHOLDER LOGO until the real mark arrives: a rounded ink tile with an
// X, plus the wordmark. Swap <Mark> for the logo asset when it's ready.

import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { brand, font, useColors } from "@/theme";
import { Text } from "./ui";

export function Mark({ size = 28 }: { size?: number }) {
  const c = useColors();
  const fg = c.scheme === "dark" ? c.primary : c.brand;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: c.scheme === "dark" ? c.secondary : c.text, alignItems: "center", justifyContent: "center", borderCurve: "continuous" }}>
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24">
        <Path d="M5 5 L19 19 M19 5 L5 19" stroke={fg} strokeWidth={3.2} strokeLinecap="round" />
      </Svg>
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
