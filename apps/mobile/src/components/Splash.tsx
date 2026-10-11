// The opening animation: just the logo (pop and a ring), then it fades out.
// PLACEHOLDER mark until the real logo arrives.

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { palette } from "@/theme";

export function Splash({ onDone }: { onDone: () => void }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const ring = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(withTiming(1.06, { duration: 520, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 220 }));
    opacity.value = withTiming(1, { duration: 360 });
    ring.value = withDelay(260, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    fade.value = withDelay(1300, withTiming(0, { duration: 320 }, (done) => done && runOnJS(onDone)()));
  }, [scale, opacity, ring, fade, onDone]);

  const mark = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 0.7 + ring.value * 1.4 }], opacity: 0.5 * (1 - ring.value) }));
  const root = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.ink, alignItems: "center", justifyContent: "center", zIndex: 100 }, root]}>
      <View style={{ width: 96, height: 96 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 30, borderWidth: 1, borderColor: "rgba(197,218,197,0.6)" }, halo]} />
        <Animated.View style={[{ width: 96, height: 96, borderRadius: 30, backgroundColor: palette.sage, alignItems: "center", justifyContent: "center", borderCurve: "continuous" }, mark]}>
          <Svg width={44} height={44} viewBox="0 0 24 24">
            <Path d="M6 6 L18 18 M18 6 L6 18" stroke={palette.ink} strokeWidth={2.6} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** Show the splash once per app start. */
export function useSplash() {
  const [show, setShow] = useState(true);
  return { show, done: () => setShow(false) };
}
