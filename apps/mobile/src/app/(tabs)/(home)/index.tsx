// League: this week's round. Hero (phase, countdown, pot, MEDIAN), live
// standings around MEDIAN, and what people are doing.

import { View } from "react-native";
import { Link, router } from "expo-router";
import type { RoundView } from "@indx/core";
import { brand, signColor, space, useColors } from "@/theme";
import { useActivity, useRound, useWalletView } from "@/lib/queries";
import { pct, short, usd, when } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { Button, Card, Empty, ErrorView, Num, Pill, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { Standings } from "@/components/Standings";

const PHASE_LABEL: Record<RoundView["phase"], string> = {
  open: "Entries open",
  live: "Live",
  settling: "Settling",
  settled: "Settled",
  voided: "Voided",
};

function Hero({ r }: { r: RoundView }) {
  const c = useColors();
  const target = r.phase === "open" ? r.entryClose : r.end;
  return (
    <Card style={{ gap: space.lg }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Pill label={`Round ${r.id} · ${PHASE_LABEL[r.phase]}`} bg={r.phase === "live" ? c.up : r.phase === "open" ? c.accent : c.surfaceAlt} color={r.phase === "live" || r.phase === "open" ? "#fff" : c.text} />
        <Link href="/rules">
          <Text v="smallStrong" color={c.accent}>
            How it works
          </Text>
        </Link>
      </Row>
      {r.phase === "open" || r.phase === "live" ? (
        <View>
          <Text v="label" color={c.textMuted}>
            {r.phase === "open" ? "Entries close in" : "Round ends in"}
          </Text>
          <Countdown to={target} serverTime={r.serverTime} v="hero" />
          <Text v="small" color={c.textMuted}>
            {when(target)}
          </Text>
        </View>
      ) : (
        <View>
          <Text v="label" color={c.textMuted}>
            MEDIAN finished at
          </Text>
          <Num v="hero" color={c.median}>
            {pct(r.medianPct)}
          </Num>
          {r.voidReason ? <Text color={c.textMuted}>Void ({r.voidReason}): every ticket came back.</Text> : null}
        </View>
      )}
      <Row style={{ justifyContent: "space-between" }}>
        <Stat label="Pot" value={usd(r.potUsd, 0)} />
        <Stat label="Players" value={String(r.players)} align="center" />
        <Stat label="ETFs" value={String(r.etfCount)} align="center" />
        <Stat label="MEDIAN" value={pct(r.medianPct)} color={r.medianPct === null ? undefined : c.median} align="right" />
      </Row>
    </Card>
  );
}

function YourEntry({ r }: { r: RoundView }) {
  const c = useColors();
  const { address } = useWallet();
  const w = useWalletView(address);
  const e = w.data?.entries.find((x) => x.roundId === r.id);
  if (!address) {
    return (
      <Card style={{ gap: space.md, marginTop: space.md }}>
        <Text v="bodyStrong">{brand.tagline}</Text>
        <Text color={c.textMuted}>{brand.pitch}</Text>
        <Button title="Connect a wallet" onPress={() => router.push("/connect")} />
      </Card>
    );
  }
  if (!e) {
    if (r.phase !== "open") return null;
    return (
      <Row style={{ marginTop: space.md }}>
        <Button title="Build an ETF" style={{ flex: 1 }} onPress={() => router.push("/create")} />
        <Button title="Back one" kind="secondary" style={{ flex: 1 }} onPress={() => r.etfs[0] && router.push(`/etf/${r.id}/${r.etfs[0].key}`)} disabled={!r.etfs.length} />
      </Row>
    );
  }
  const tone = e.standing === "above" ? c.up : e.standing === "below" ? c.down : c.median;
  return (
    <Card onPress={() => router.push(`/etf/${r.id}/${e.etfKey}`)} style={{ marginTop: space.md, gap: 6 }}>
      <Text v="label" color={c.textMuted}>
        You’re in · {e.isCaptain ? "creator" : e.isCreator ? "co-creator" : "backer"}
      </Text>
      <Row style={{ justifyContent: "space-between" }}>
        <Text v="heading">{e.etfName}</Text>
        <Num v="heading" color={signColor(c, e.retPct)}>
          {pct(e.retPct)}
        </Num>
      </Row>
      {e.standing ? (
        <Text color={tone}>
          {e.standing === "above" ? "Above MEDIAN" : e.standing === "below" ? "Below MEDIAN" : "On MEDIAN"}
          {e.payoutUsd !== null ? ` · ${r.phase === "settled" ? "paid" : "would pay"} ${usd(e.payoutUsd)}` : ""}
        </Text>
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
        <Skeleton height={220} />
        <Skeleton height={72} style={{ marginTop: space.md }} />
        <Skeleton height={72} style={{ marginTop: space.sm }} />
      </Screen>
    );
  }
  if (round.error) return <ErrorView error={round.error} onRetry={() => round.refetch()} />;
  const r = round.data!;
  return (
    <Screen onRefresh={() => Promise.all([round.refetch(), activity.refetch()])}>
      <Hero r={r} />
      <YourEntry r={r} />
      <SectionTitle title={r.phase === "settled" ? "Final standings" : "Standings"} />
      {r.etfs.length ? <Standings round={r} mineKey={mine} /> : <Empty title="No ETFs yet" body="Be the first to build one this round." action={<Button title="Build an ETF" small onPress={() => router.push("/create")} />} />}
      {activity.data?.length ? (
        <>
          <SectionTitle title="Activity" />
          <Card style={{ gap: space.md }}>
            {activity.data.slice(0, 8).map((a) => (
              <Row key={a.index} style={{ justifyContent: "space-between" }}>
                <Text v="small" style={{ flex: 1 }} numberOfLines={1}>
                  <Text v="smallStrong">{short(a.wallet)}</Text> {a.kind === "created" ? "built" : a.kind === "cloned" ? "copied" : "backed"} {a.etfName}
                </Text>
                <Text v="small" color={c.textMuted}>
                  #{a.index + 1}
                </Text>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
