// A player's avatar: one of 10, picked from the wallet address so it stays
// the same everywhere. PLACEHOLDER art until the designed set arrives.

import { View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

const SET = [
  { bg: "#293234", a: "#C5DAC5", b: "#F6F8F5" },
  { bg: "#C5DAC5", a: "#293234", b: "#F6F8F5" },
  { bg: "#8FB3D9", a: "#0B0C0E", b: "#F6F8F5" },
  { bg: "#E3B98F", a: "#293234", b: "#F6F8F5" },
  { bg: "#C9A6E0", a: "#241F33", b: "#F6F8F5" },
  { bg: "#9FD3C7", a: "#0B0C0E", b: "#F6F8F5" },
  { bg: "#0B0C0E", a: "#8FD3AD", b: "#C5DAC5" },
  { bg: "#1C2224", a: "#E3B98F", b: "#C5DAC5" },
  { bg: "#3A4547", a: "#C9A6E0", b: "#F6F8F5" },
  { bg: "#F2D74E", a: "#293234", b: "#F6F8F5" },
];

export function avatarIndex(wallet: string) {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  return h % SET.length;
}

export function Avatar({ wallet, size = 52 }: { wallet: string; size?: number }) {
  const i = avatarIndex(wallet);
  const s = SET[i];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="50" fill={s.bg} />
        {i % 3 === 0 ? (
          <>
            <Circle cx="50" cy="50" r="22" fill={s.a} />
            <Ellipse cx="50" cy="50" rx="40" ry="14" fill="none" stroke={s.b} strokeWidth={3} transform="rotate(-25 50 50)" />
          </>
        ) : i % 3 === 1 ? (
          <Path d="M50 18 L80 72 H20 Z" fill={s.a} />
        ) : (
          <Path d="M14 44c9-8 18-8 27 0s18 8 27 0 14-6 18-4 M14 60c9-8 18-8 27 0s18 8 27 0 14-6 18-4" fill="none" stroke={s.a} strokeWidth={6} strokeLinecap="round" />
        )}
      </Svg>
    </View>
  );
}
