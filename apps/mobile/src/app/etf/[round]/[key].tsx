// One ETF: return vs MEDIAN, chart, basket, members; back it or buy it.

import { View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { signColor, space, useColors } from "@/theme";
import { useEtf, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { bpsToPct, pct, short, usd } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { ReturnChart } from "@/components/Chart";
import { Countdown } from "@/components/Countdown";
import { useTxAction } from "@/components/TxAction";
import { Button, Card, Divider, ErrorView, Num, Pill, Row, Screen, SectionTitle, Skeleton, Text } from "@/components/ui";

export default function EtfScreen() {
  const c = useColors();
  const { round, key } = useLocalSearchParams<{ round: string; key: string }>();
  const etf = useEtf(round, key);
  const { address } = useWallet();
  const mine = useWalletView(address).data?.entries.find((e) => e.roundId === round);
  const { run, busy } = useTxAction();

  if (etf.isLoading) {
    return (
      <Screen>
        <Skeleton height={60} />
        <Skeleton height={180} style={{ marginTop: space.md }} />
      </Screen>
    );
  }
  if (etf.error) return <ErrorView error={etf.error} onRetry={() => etf.refetch()} />;
  const e = etf.data!;
  const open = e.roundPhase === "open";
  const standingText = e.standing === "above" ? "Above MEDIAN" : e.standing === "below" ? "Below MEDIAN" : e.standing === "draw" ? "On MEDIAN" : null;
  const standingColor = e.standing === "above" ? c.up : e.standing === "below" ? c.down : c.median;
  const inThis = mine?.etfKey === e.key;
  const full = e.members >= 20;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: e.name }} />
      <Screen onRefresh={() => etf.refetch()} contentStyle={{ paddingBottom: 160 }}>
        <Text v="label" color={c.textMuted}>
          Round {e.roundId} · by {short(e.captain)} · {e.tickets} {e.tickets === 1 ? "ticket" : "tickets"}
        </Text>
        <Text v="title" style={{ marginTop: 4 }}>
          {e.name}
        </Text>
        <Row style={{ marginTop: space.sm, alignItems: "flex-end" }} gap={space.md}>
          <Num v="hero" color={signColor(c, e.retPct)}>
            {pct(e.retPct)}
          </Num>
          {standingText ? <Pill label={`${standingText}${e.vsMedianPct !== null ? ` ${pct(e.vsMedianPct)}` : ""}`} color={standingColor} style={{ marginBottom: 8 }} /> : null}
        </Row>
        {e.ticketPayoutUsd !== null ? (
          <Text color={c.textMuted}>
            A {usd(e.stakeUsd, 0)} ticket {e.roundPhase === "settled" ? "paid" : "would pay"} {usd(e.ticketPayoutUsd)}
            {e.roundPhase === "settled" ? "" : " if the round ended now"}.
          </Text>
        ) : null}

        <Card style={{ marginTop: space.lg }}>
          <ReturnChart points={e.chart} medianPct={e.medianPct} />
        </Card>

        <SectionTitle title="Basket" />
        <Card style={{ gap: space.md }}>
          {e.legs.map((l, i) => (
            <View key={l.mint} style={{ gap: space.md }}>
              {i ? <Divider /> : null}
              <Row style={{ justifyContent: "space-between" }}>
                <Row gap={space.md}>
                  <AssetLogo uri={l.logo} ticker={l.ticker} size={32} />
                  <View>
                    <Text v="bodyStrong">{l.ticker}</Text>
                    <Text v="small" color={c.textMuted}>
                      {l.name} · {usd(l.price)}
                    </Text>
                  </View>
                </Row>
                <View style={{ alignItems: "flex-end" }}>
                  <Num>{bpsToPct(l.weightBps)}</Num>
                  <Text v="small" color={signColor(c, l.retPct)}>
                    {pct(l.retPct)}
                  </Text>
                </View>
              </Row>
            </View>
          ))}
        </Card>

        <SectionTitle title={`Team · ${e.memberList.length}`} />
        <Card style={{ gap: space.sm }}>
          {e.memberList.map((m) => (
            <Row key={m.wallet} style={{ justifyContent: "space-between" }}>
              <Text>{m.wallet === address ? "You" : short(m.wallet, 6)}</Text>
              <Text v="small" color={c.textMuted}>
                {m.isCaptain ? "creator" : m.isCreator ? "co-creator" : "backer"}
              </Text>
            </Row>
          ))}
        </Card>
        <Text v="small" color={c.textMuted} style={{ marginTop: space.md }}>
          Buying this ETF pays the creator a {bpsToPct(e.buyFeeBps)} fee. Backers’ winnings pay the creator 10%.
        </Text>
      </Screen>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: space.xxl, backgroundColor: c.bg, borderTopWidth: 0.5, borderColor: c.border, gap: space.sm }}>
        {open ? (
          <Row style={{ justifyContent: "space-between" }}>
            <Text v="small" color={c.textMuted}>
              Entries close in
            </Text>
            <Countdown to={e.entryClose} v="bodyStrong" />
          </Row>
        ) : null}
        <Row>
          <Button title="Buy" kind="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/amount", params: { round: e.roundId, key: e.key, name: e.name } })} />
          {open ? (
            <Button
              title={inThis ? "You're in" : mine ? "In another ETF" : full ? "Team full" : `Back · ${usd(e.stakeUsd, 0)}`}
              style={{ flex: 2 }}
              disabled={!!mine || full}
              loading={busy}
              onPress={() => run((w) => api.planBack({ wallet: w, roundId: e.roundId, etfKey: e.key }), `You're backing ${e.name}`)}
            />
          ) : null}
        </Row>
      </View>
    </View>
  );
}
