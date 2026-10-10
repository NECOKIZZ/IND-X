// Soft sage glows behind hero cards (gloam's blurred gradient look), drawn
// as radial gradients so they cost nothing to render.

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useColors } from "@/theme";

export function Glow({ style, variant = 0 }: { style?: StyleProp<ViewStyle>; variant?: 0 | 1 | 2 }) {
  const c = useColors();
  // In dark mode the glows are sage at low strength, like light leaking in.
  const k = c.scheme === "dark" ? 0.22 : 1;
  const spots = [
    [
      { cx: "85%", cy: "90%", r: "75%", color: c.glowA, o: 0.95 },
      { cx: "10%", cy: "10%", r: "60%", color: c.glowB, o: 0.8 },
    ],
    [
      { cx: "100%", cy: "0%", r: "80%", color: c.glowA, o: 0.85 },
      { cx: "0%", cy: "100%", r: "55%", color: c.glowB, o: 0.7 },
    ],
    [{ cx: "50%", cy: "110%", r: "90%", color: c.glowA, o: 0.8 }],
  ][variant];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          {spots.map((s, i) => (
            <RadialGradient key={i} id={`g${variant}${i}`} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} fx={s.cx} fy={s.cy} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={c.scheme === "dark" ? c.brand : s.color} stopOpacity={s.o * k} />
              <Stop offset="1" stopColor={s.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {spots.map((_, i) => (
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#g${variant}${i})`} />
        ))}
      </Svg>
    </View>
  );
}
