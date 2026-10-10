// League: this week's round. A glowing hero (phase, countdown, pot, the
// median), your entry, live standings around the median, and activity.

import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { RoundView } from "@indx/core";
import { brand, radius, signColor, space, useColors } from "@/theme";
import { useActivity, useRound, useWalletView } from "@/lib/queries";
import { pct, short, usd, when } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { Button, Card, Divider, Empty, ErrorView, Label, Num, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { Glow } from "@/components/Glow";
import { TopBar } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Standings } from "@/components/Standings";

const PHASE: Record<RoundView["phase"], string> = { open: "Entries open", live: "Live", settling: "Settling", settled: "Settled", voided: "Voided" };

function Hero({ r }: { r: RoundView }) {
  const c = useColors();
  const settling = (r.phase === "live" && r.serverTime >= r.end) || r.phase === "settling";
  const target = r.phase === "open" ? r.entryClose : r.end;
  return (
    <View style={{ borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surface, borderCurve: "continuous", borderWidth: 1, borderColor: c.border }}>
      <Glow />
      <View style={{ padding: space.xl, gap: space.xl }}>
        <Row style={{ justifyContent: "space-between" }}>
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

        <Row style={{ justifyContent: "space-between" }}>
          <Stat label="Pot" value={usd(r.potUsd, 0)} />
          <Stat label="Players" value={String(r.players)} />
          <Stat label="ETFs" value={String(r.etfCount)} />
          <Stat label={brand.Line} value={pct(r.medianPct)} align="right" />
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
  if (!address) {
    return (
      <Card style={{ marginTop: space.md, gap: space.md }}>
        <Text v="title" style={{ fontSize: 26, lineHeight: 30 }}>
          {brand.tagline}
        </Text>
        <Text color={c.textMuted}>{brand.pitch}</Text>
        <Row>
          <Button title="Get started" onPress={() => router.push("/connect")} />
          <Button title="Learn more" kind="ghost" icon="arrow" onPress={() => router.push("/rules")} />
        </Row>
      </Card>
    );
  }
  if (!e) {
    if (r.phase !== "open") return null;
    return (
      <Row style={{ marginTop: space.md }}>
        <Button title="Build an ETF" style={{ flex: 1 }} onPress={() => router.push("/create")} />
        <Button title="Back one" kind="secondary" style={{ flex: 1 }} disabled={!r.etfs.length} onPress={() => r.etfs[0] && router.push(`/etf/${r.id}/${r.etfs[0].key}`)} />
      </Row>
    );
  }
  const tone = e.standing === "above" ? c.up : e.standing === "below" ? c.down : c.line;
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
            {e.standing === "above" ? `Above ${brand.line}` : e.standing === "below" ? `Below ${brand.line}` : `On ${brand.line}`}
            {e.payoutUsd !== null ? ` · ${r.phase === "settled" ? "paid" : "would pay"} ${usd(e.payoutUsd)}` : ""}
          </Text>
        </Row>
      ) : null}
    </Card>
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
      <Screen>
        <TopBar />
        <Skeleton height={300} style={{ borderRadius: radius.xl }} />
        <Skeleton height={84} style={{ marginTop: space.md }} />
        <Skeleton height={84} style={{ marginTop: space.sm }} />
      </Screen>
    );
  }
  if (round.error) return <ErrorView error={round.error} onRetry={() => round.refetch()} />;
  const r = round.data!;
  return (
    <Screen onRefresh={() => Promise.all([round.refetch(), activity.refetch()])}>
      <TopBar />
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
    </Screen>
  );
}
