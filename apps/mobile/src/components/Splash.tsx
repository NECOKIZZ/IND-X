// The opening animation, a wordmark that becomes the mark:
//   1. "IndX" settles in, letter by letter.
//   2. The typed X breaks apart and our X assembles in its place: the long
//      stroke slashes through, the two short ones snap in from the corners.
//      It now reads Ind + our X.
//   3. "Ind" whips off to the left with a speed skew, and the X glides to
//      centre stage and grows, with a sage shockwave.
//   4. Everything fades into the app.

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { font, palette } from "@/theme";
import { MARK_PATHS, MarkGlyph, MARK_RATIO } from "./Logo";

const SIZE = 46; // wordmark font size
const GLYPH = 34; // our X, sized to the letters' cap height
const SLOT = 38; // the X's place in the word
const out = Easing.out(Easing.cubic);
const LETTERS = ["I", "n", "d"];

function Letter({ ch, i, t }: { ch: string; i: number; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const v = interpolate(t.value, [i * 0.18, i * 0.18 + 0.46], [0, 1], "clamp");
    return { opacity: v, transform: [{ translateY: (1 - v) * 14 }] };
  });
  return <Animated.Text style={[{ fontFamily: font.medium, fontSize: SIZE, lineHeight: SIZE * 1.15, letterSpacing: -1.5, color: palette.mist }, style]}>{ch}</Animated.Text>;
}

export function Splash({ onDone }: { onDone: () => void }) {
  const type = useSharedValue(0); // 1. letters in
  const morph = useSharedValue(0); // 2. typed X → our X
  const slash = useSharedValue(0);
  const snapA = useSharedValue(0);
  const snapB = useSharedValue(0);
  const swoosh = useSharedValue(0); // 3. Ind away, X to centre
  const wave = useSharedValue(0);
  const fade = useSharedValue(1);
  // How far the X travels to reach the centre: half of "Ind" plus its gap.
  const half = useSharedValue(43);

  useEffect(() => {
    type.value = withTiming(1, { duration: 620, easing: out });
    morph.value = withDelay(700, withTiming(1, { duration: 260, easing: out }));
    slash.value = withDelay(760, withTiming(1, { duration: 300, easing: out }));
    snapA.value = withDelay(960, withTiming(1, { duration: 240, easing: out }));
    snapB.value = withDelay(1030, withTiming(1, { duration: 240, easing: out }));
    swoosh.value = withDelay(1480, withTiming(1, { duration: 560, easing: Easing.inOut(Easing.cubic) }));
    wave.value = withDelay(1820, withTiming(1, { duration: 820, easing: Easing.out(Easing.quad) }));
    fade.value = withDelay(2460, withSequence(withTiming(0, { duration: 340 }, (done) => done && runOnJS(onDone)())));
  }, [type, morph, slash, snapA, snapB, swoosh, wave, fade, onDone]);

  // "Ind" whips left: accelerates, skews with speed, and fades.
  const ind = useAnimatedStyle(() => ({
    opacity: 1 - interpolate(swoosh.value, [0.15, 0.7], [0, 1], "clamp"),
    transform: [{ translateX: -swoosh.value * swoosh.value * 220 }, { skewX: `${-swoosh.value * 18}deg` }, { scaleX: 1 + swoosh.value * 0.35 }],
  }));
  // The X glides to the centre of the screen and grows.
  const slot = useAnimatedStyle(() => ({ transform: [{ translateX: -half.value * swoosh.value }, { scale: 1 + swoosh.value * 1.25 }] }));
  // The typed X spins away as ours arrives.
  const typedX = useAnimatedStyle(() => ({
    opacity: interpolate(type.value, [0.5, 1], [0, 1], "clamp") * (1 - morph.value),
    transform: [{ scale: 1 + morph.value * 0.5 }, { rotate: `${morph.value * 45}deg` }],
  }));
  const longStroke = useAnimatedStyle(() => ({ opacity: slash.value, transform: [{ translateX: (1 - slash.value) * -22 }, { translateY: (1 - slash.value) * 20 }] }));
  const strokeA = useAnimatedStyle(() => ({ opacity: snapA.value, transform: [{ translateX: (1 - snapA.value) * 16 }, { translateY: (1 - snapA.value) * 14 }] }));
  const strokeB = useAnimatedStyle(() => ({ opacity: snapB.value, transform: [{ translateX: (1 - snapB.value) * -16 }, { translateY: (1 - snapB.value) * -14 }] }));
  const shock = useAnimatedStyle(() => ({ opacity: interpolate(wave.value, [0, 0.04, 1], [0, 0.6, 0]), transform: [{ scale: 0.4 + wave.value * 3.2 }] }));
  const root = useAnimatedStyle(() => ({ opacity: fade.value }));

  const stroke = (d: string, style: object) => (
    <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, style]}>
      <MarkGlyph width={GLYPH} color={palette.sage} paths={[d]} />
    </Animated.View>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.ink, alignItems: "center", justifyContent: "center", zIndex: 100 }, root]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Animated.View
          style={[{ flexDirection: "row" }, ind]}
          onLayout={(e) => {
            half.value = (e.nativeEvent.layout.width + 2) / 2;
          }}
        >
          {LETTERS.map((ch, i) => (
            <Letter key={ch} ch={ch} i={i} t={type} />
          ))}
        </Animated.View>
        <Animated.View style={[{ width: SLOT, height: SIZE * 1.15, marginLeft: 2 }, slot]}>
          <Animated.Text style={[StyleSheet.absoluteFill, { fontFamily: font.medium, fontSize: SIZE, lineHeight: SIZE * 1.15, color: palette.mist, textAlign: "center" }, typedX]}>X</Animated.Text>
          <View style={[StyleSheet.absoluteFill, { top: (SIZE * 1.15 - GLYPH * MARK_RATIO) * 0.1 }]}>
            {stroke(MARK_PATHS[0], longStroke)}
            {stroke(MARK_PATHS[1], strokeA)}
            {stroke(MARK_PATHS[2], strokeB)}
          </View>
        </Animated.View>
      </View>
      {/* The shockwave starts where the X lands. */}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: palette.sage }, shock]} />
    </Animated.View>
  );
}

/** Show the splash once per app start. */
export function useSplash() {
  const [show, setShow] = useState(true);
  const again = useCallback(() => setShow(true), []);
  return { show, done: () => setShow(false), again };
}
