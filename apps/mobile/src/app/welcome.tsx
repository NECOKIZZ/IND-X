// Sign up: our logo and name sitting quietly on top, a fan of the round's
// ETFs as gradient cards, the pitch, and the sign-in buttons.

import { useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, font, space, useColors } from "@/theme";
import { useAssets, useRound } from "@/lib/queries";
import { pct } from "@/lib/format";
import { useSignIn } from "@/wallet/signin";
import { isSeeker } from "@/lib/device";
import { EtfCard } from "@/components/EtfCard";
import { Glow } from "@/components/Glow";
import { Icon } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { Row, Text } from "@/components/ui";

// Where each card of the fan sits (relative to the middle), back to front.
const FAN = [
  { x: -104, y: -36, r: "-14deg" },
  { x: 104, y: -44, r: "13deg" },
  { x: -88, y: 116, r: "8deg" },
  { x: 94, y: 110, r: "-9deg" },
  { x: 0, y: 30, r: "-2deg" },
];

const SAMPLE = [
  { name: "Cash Cows", tickers: ["NVDA", "SOL", "TSLA"] },
  { name: "AI Picks", tickers: ["GOOGL", "NVDA", "COIN"] },
  { name: "Mag 7 Lite", tickers: ["AAPL", "META", "MSFT"] },
  { name: "Steady Eddie", tickers: ["AAPL", "GLD", "TSLA"] },
  { name: "Gold Bugs", tickers: ["GLD", "NVDA", "PLTR"] },
];

function useFanCards() {
  const round = useRound().data;
  const assets = useAssets().data ?? [];
  const logo = (t: string) => assets.find((a) => a.ticker === t || a.symbol === t)?.logo ?? null;
  const live = (round?.etfs ?? []).slice(0, 5).map((e) => ({ name: e.name, legs: e.legs.map((l) => ({ logo: l.logo, ticker: l.ticker })), ret: e.retPct }));
  if (live.length >= 5) return live;
  return SAMPLE.map((s, i) => live[i] ?? { name: s.name, legs: s.tickers.map((t) => ({ logo: logo(t), ticker: t })), ret: null });
}

export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The fan takes whatever height is left and scales to fit it.
  const [fan, setFan] = useState({ w: width, h: 360 });
  const toast = useToast();
  const { signIn, busy } = useSignIn();
  const cards = useFanCards();
  const seeker = isSeeker();
  const scale = Math.max(0.45, Math.min(1, fan.w / 390, fan.h / 380));
  const go = (m: Parameters<typeof signIn>[0]) => signIn(m).catch((e) => toast((e as Error).message, "error"));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}>
      <Row style={{ justifyContent: "center" }} gap={8}>
        <Mark size={26} />
        <Text v="heading" style={{ fontFamily: font.medium, fontSize: 20, letterSpacing: -0.6 }}>
          {brand.name}
        </Text>
      </Row>

      <View
        style={{ flex: 1, minHeight: 160, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        pointerEvents="none"
        onLayout={(e) => setFan({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <Glow variant={2} style={{ top: "20%", bottom: "20%" }} />
        {cards.map((card, i) => {
          const f = FAN[i];
          const front = i === FAN.length - 1;
          return (
            <View key={i} style={{ position: "absolute", transform: [{ translateX: f.x * scale }, { translateY: (f.y - 40) * scale }, { rotate: f.r }, { scale }] }}>
              <EtfCard name={card.name} legs={card.legs} retPct={card.ret === null ? "—" : pct(card.ret)} theme={(i + 2) % 5} width={front ? 140 : 132} height={front ? 184 : 172} />
            </View>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xl, alignItems: "center" }}>
        <Text v="hero" style={{ textAlign: "center", fontSize: 34, lineHeight: 38 }}>
          Gamified ETFs{"\n"}on Solana
        </Text>
        <Text color={c.textMuted} style={{ textAlign: "center", marginTop: space.md }}>
          Build an ETF, beat the median and get paid.
        </Text>
      </View>

      <View style={{ paddingHorizontal: space.lg + 4, gap: space.sm + 2 }}>
        <Text v="small" color={c.textMuted} style={{ textAlign: "center", marginBottom: 4 }}>
          By continuing, you agree to the{" "}
          <Text v="small" color={c.brand}>
            Terms
          </Text>{" "}
          and{" "}
          <Text v="small" color={c.brand}>
            Privacy Policy
          </Text>
        </Text>
        {seeker ? (
          <SignInButton icon="shield" title="Continue with Seed Vault" loading={busy === "wallet"} onPress={() => go("wallet")} />
        ) : (
          <>
            <SignInButton icon="google" title="Continue with Google" loading={busy === "google"} onPress={() => go("google")} />
            <SignInButton icon="apple" title="Continue with Apple" loading={busy === "apple"} onPress={() => go("apple")} />
          </>
        )}
        <Pressable onPress={() => router.push("/signin")} hitSlop={8} style={{ alignItems: "center", paddingTop: space.sm }}>
          <Text v="bodyStrong">More options</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SignInButton({ icon, title, onPress, loading }: { icon: "google" | "apple" | "shield"; title: string; onPress: () => void; loading?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({ height: 52, borderRadius: 26, paddingHorizontal: space.md, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: pressed || loading ? 0.85 : 1 })}
    >
      <Icon name={icon} size={18} color={c.onPrimary} />
      <Text v="bodyStrong" color={c.onPrimary} numberOfLines={1}>
        {loading ? "Signing in…" : title}
      </Text>
    </Pressable>
  );
}

