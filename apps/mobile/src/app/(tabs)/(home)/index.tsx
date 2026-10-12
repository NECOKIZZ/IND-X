// League: this week's round. The app bar (hides as you scroll down), the
// guide and hot-ETF carousel, a glowing hero (phase, countdown, pot, the
// median), your entry, live standings around the median, and activity.

import { useState } from "react";
import { Pressable, RefreshControl, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { RoundView } from "@indx/core";
import { brand, radius, signColor, space, TAB_BAR_SPACE, useColors } from "@/theme";
import { useActivity, useRound, useWalletView } from "@/lib/queries";
import { pct, short, usd, when } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { Button, Card, Divider, Empty, ErrorView, Label, Num, Row, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";
import { Carousel } from "@/components/Carousel";
import { Countdown } from "@/components/Countdown";
import { Glow } from "@/components/Glow";
import { APP_BAR_HEIGHT, AppBar } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { useFaucet } from "@/components/useFaucet";
import { Standings } from "@/components/Standings";
import { Sparkline } from "@/components/Sparkline";

const PHASE: Record<RoundView["phase"], string> = { open: "Entries open", live: "Live", settling: "Settling", settled: "Settled", voided: "Voided" };

function Hero({ r }: { r: RoundView }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const settling = (r.phase === "live" && r.serverTime >= r.end) || r.phase === "settling";
  const target = r.phase === "open" ? r.entryClose : r.end;
  return (
    <View style={{ borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surface, borderCurve: "continuous", borderWidth: 1, borderColor: c.border }}>
      <Glow />
      <View style={{ padding: width < 360 ? space.lg : space.xl, gap: space.xl }}>
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: space.sm }}>
          <Row gap={8}>
            {r.phase === "open" || r.phase === "live" ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.up }} /> : null}
            <Label color={c.text}>
              Round {r.id} · {PHASE[r.phase]}
            </Label>
          </Row>
          <Pressable onPress={() => router.push("/rules")} hitSlop={10}>
            <Row gap={4}>
              <Text v="smallStrong">How it works</Text>
              <Icon name="arrow" size={13} color={c.text} strokeWidth={2} />
            </Row>
          </Pressable>
        </Row>

        <View style={{ gap: 4 }}>
          {settling ? (
            <>
              <Label>The round is over</Label>
              <Text v="hero">Settling results</Text>
              <Text v="small" color={c.textMuted}>
                Closing prices are in. Payouts arrive in wallets automatically.
              </Text>
            </>
          ) : r.phase === "open" || r.phase === "live" ? (
            <>
              <Label>{r.phase === "open" ? "Entries close in" : "Round ends in"}</Label>
              <Countdown to={target} serverTime={r.serverTime} v="display" />
              <Text v="small" color={c.textMuted}>
                {when(target)}
              </Text>
            </>
          ) : (
            <>
              <Label>{brand.Line} finished at</Label>
              <Num v="display">{pct(r.medianPct)}</Num>
              {r.voidReason ? (
                <Text v="small" color={c.textMuted}>
                  Void ({r.voidReason}): every ticket came back.
                </Text>
              ) : null}
            </>
          )}
        </View>

        {r.medianSeries.length >= 2 ? (
          <View style={{ gap: 6 }}>
            <Label>{brand.Line} over the round</Label>
            <Sparkline values={r.medianSeries.map((p) => p.pct)} width={300} height={44} color={c.text} baseline={c.border} />
          </View>
        ) : null}

        <Row style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: space.md, columnGap: space.lg }}>
          <Stat label="Pot" value={usd(r.potUsd, 0)} />
          <Stat label="Players" value={String(r.players)} />
          <Stat label="ETFs" value={String(r.etfCount)} />
          {/* Before the round starts there's no real median yet: show the 24h preview as such. */}
          <Stat label={r.pricing === "preview" ? `${brand.Line} · 24h` : brand.Line} value={pct(r.medianPct)} align="right" />
        </Row>
      </View>
    </View>
  );
}

function YourEntry({ r }: { r: RoundView }) {
  const c = useColors();
  const { address } = useWallet();
  const w = useWalletView(address);
  const e = w.data?.entries.find((x) => x.roundId === r.id);
  const faucet = useFaucet();
  if (!address) return null;
  if (!e) {
    if (r.phase !== "open") return null;
    return (
      <Row style={{ marginTop: space.md }}>
        <Button title="Build an ETF" style={{ flex: 1 }} onPress={() => router.push("/create")} />
        {faucet.available ? (
          <Button title="Get test funds" kind="secondary" style={{ flex: 1 }} loading={faucet.busy} onPress={faucet.drip} />
        ) : (
          <Button title="How it works" kind="secondary" style={{ flex: 1 }} onPress={() => router.push("/rules")} />
        )}
      </Row>
    );
  }
  const tone = e.standing === "above" ? c.up : c.down;
  return (
    <Card onPress={() => router.push(`/etf/${r.id}/${e.etfKey}`)} style={{ marginTop: space.md, gap: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Label>You’re in · {e.isCaptain ? "creator" : e.isCreator ? "co-creator" : "backer"}</Label>
        <Icon name="arrow" size={14} color={c.textMuted} />
      </Row>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text v="title" style={{ flex: 1 }} numberOfLines={1}>
          {e.etfName}
        </Text>
        <Num v="title" color={signColor(c, e.retPct)}>
          {pct(e.retPct)}
        </Num>
      </Row>
      {e.standing ? (
        <Row gap={6}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone }} />
          <Text v="small" color={c.textMuted}>
            {e.standing === "above" ? `Above ${brand.line}` : `Not above ${brand.line}`}
            {e.payoutUsd !== null ? ` · ${r.phase === "settled" ? "paid" : "would pay"} ${usd(e.payoutUsd)}` : ""}
          </Text>
        </Row>
      ) : null}
    </Card>
  );
}

/** Page with the app bar on top that slides away as you scroll down and comes back as you scroll up. */
function LeaguePage({ children, onRefresh }: { children: React.ReactNode; onRefresh?: () => Promise<unknown> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const barH = insets.top + space.sm + APP_BAR_HEIGHT;
  const last = useSharedValue(0);
  const hidden = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    if (y > last.value + 4 && y > APP_BAR_HEIGHT) hidden.value = withTiming(1, { duration: 220 });
    else if (y < last.value - 4 || y <= 0) hidden.value = withTiming(0, { duration: 220 });
    last.value = y;
  });
  const bar = useAnimatedStyle(() => ({ transform: [{ translateY: -hidden.value * (barH + 4) }] }));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg + 4, paddingTop: barH + space.sm, paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              tintColor={c.textMuted}
              progressViewOffset={barH}
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await onRefresh().catch(() => {});
                setRefreshing(false);
              }}
            />
          ) : undefined
        }
      >
        {children}
      </Animated.ScrollView>
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg + 4, backgroundColor: c.bg }, bar]}>
        <AppBar />
      </Animated.View>
    </View>
  );
}

export default function League() {
  const c = useColors();
  const round = useRound();
  const activity = useActivity();
  const { address } = useWallet();
  const mine = useWalletView(address).data?.entries.find((e) => e.roundId === round.data?.id)?.etfKey;

  if (round.isLoading) {
    return (
      <LeaguePage>
        <Skeleton height={186} style={{ borderRadius: radius.xl }} />
        <Skeleton height={300} style={{ borderRadius: radius.xl, marginTop: space.md }} />
        <Skeleton height={84} style={{ marginTop: space.md }} />
      </LeaguePage>
    );
  }
  if (round.error) return <ErrorView error={round.error} onRetry={() => round.refetch()} />;
  const r = round.data!;
  return (
    <LeaguePage onRefresh={() => Promise.all([round.refetch(), activity.refetch()])}>
      <Carousel round={r} />
      <View style={{ height: space.md }} />
      <Hero r={r} />
      <YourEntry r={r} />
      <SectionTitle title={r.phase === "settled" ? "Final standings" : "Standings"} />
      {r.etfs.length ? <Standings round={r} mineKey={mine} /> : <Empty title="No ETFs yet" body="Be the first to build one this round." action={<Button title="Build an ETF" small onPress={() => router.push("/create")} />} />}
      {activity.data?.length ? (
        <>
          <SectionTitle title="Activity" />
          <Card style={{ paddingVertical: space.sm }}>
            {activity.data.slice(0, 8).map((a, i) => (
              <View key={a.index}>
                {i ? <Divider /> : null}
                <Row style={{ justifyContent: "space-between", paddingVertical: space.md }}>
                  <Text v="small" style={{ flex: 1 }} numberOfLines={1}>
                    <Text v="smallStrong">{short(a.wallet)}</Text>
                    <Text v="small" color={c.textMuted}>
                      {" "}
                      {a.kind === "created" ? "built" : a.kind === "cloned" ? "copied" : "backed"}{" "}
                    </Text>
                    {a.etfName}
                  </Text>
                  <Text v="mono" color={c.textFaint}>
                    #{a.index + 1}
                  </Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </LeaguePage>
  );
}
