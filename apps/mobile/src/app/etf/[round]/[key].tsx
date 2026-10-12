// One ETF: return against the median, chart, basket, team; back it or buy it.

import { useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, radius, signColor, space, useColors } from "@/theme";
import { useEtf, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { bpsToPct, pct, short, usd } from "@/lib/format";
import { closedReason } from "@/lib/closed";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { ReturnChart } from "@/components/Chart";
import { Avatar } from "@/components/Avatar";
import { Countdown } from "@/components/Countdown";
import { Glow } from "@/components/Glow";
import { BackBar } from "@/components/Header";
import { useTxAction } from "@/components/TxAction";
import { Button, Card, Divider, ErrorView, Label, Num, Pill, Row, Screen, SectionTitle, Skeleton, Text } from "@/components/ui";

export default function EtfScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { round, key } = useLocalSearchParams<{ round: string; key: string }>();
  const etf = useEtf(round, key);
  const { address } = useWallet();
  const mine = useWalletView(address).data?.entries.find((e) => e.roundId === round);
  const { run, busy } = useTxAction();

  if (etf.isLoading) {
    return (
      <Screen bottom={40}>
        <BackBar />
        <Skeleton height={80} />
        <Skeleton height={200} style={{ marginTop: space.md }} />
      </Screen>
    );
  }
  if (etf.error) return <ErrorView error={etf.error} onRetry={() => etf.refetch()} />;
  const e = etf.data!;
  const open = e.roundPhase === "open";
  const standing = e.standing === "above" ? `Above ${brand.line}` : e.standing === "below" ? `Not above ${brand.line}` : null;
  const tone = e.standing === "above" ? c.up : e.standing === "below" ? c.down : c.line;
  const inThis = mine?.etfKey === e.key;
  const full = e.members >= e.maxBackers; // members excludes the captain
  const pad = width < 360 ? space.lg : space.xl;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen onRefresh={() => etf.refetch()} bottom={150}>
        <BackBar />
        <Label>
          Round {e.roundId} · by {short(e.captain)} · {e.tickets} {e.tickets === 1 ? "ticket" : "tickets"}
        </Label>
        <Text v="hero" style={{ marginTop: space.sm }}>
          {e.name}
        </Text>

        <View style={{ marginTop: space.xl, borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
          <Glow variant={2} />
          <View style={{ padding: pad, gap: space.lg }}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", rowGap: space.sm }}>
              <View style={{ flexShrink: 1 }}>
                <Label>{e.roundPhase === "settled" ? "Final return" : e.roundPhase === "open" ? "Last 24 hours" : "Since the open"}</Label>
                <Num v="display" color={signColor(c, e.retPct)}>
                  {pct(e.retPct)}
                </Num>
              </View>
              {standing ? <Pill label={standing} dot={tone} bg={c.surface} /> : null}
            </Row>
            {e.ticketPayoutUsd !== null ? (
              <Text v="small" color={c.textMuted}>
                A {usd(e.stakeUsd, 0)} ticket {e.roundPhase === "settled" ? "paid" : "would pay"} <Text v="smallStrong">{usd(e.ticketPayoutUsd)}</Text>
                {e.roundPhase === "settled" ? "." : " if the round ended now."}
              </Text>
            ) : null}
            <ReturnChart points={e.chart} medianPct={e.medianPct} height={160} from={e.entryClose} to={e.end} />
          </View>
        </View>

        <SectionTitle title="Basket" />
        <Card style={{ paddingVertical: space.xs }}>
          {e.legs.map((l, i) => (
            <View key={l.mint}>
              {i ? <Divider style={{ marginLeft: 48 }} /> : null}
              <Row style={{ justifyContent: "space-between", paddingVertical: space.md }}>
                <Row gap={space.md}>
                  <AssetLogo uri={l.logo} ticker={l.ticker} size={36} />
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

        <SectionTitle title={`Backers · ${e.members} of ${e.maxBackers}`} />
        <Card style={{ paddingVertical: space.xs }}>
          {e.memberList.map((m, i) => (
            <View key={m.wallet}>
              {i ? <Divider /> : null}
              <Row style={{ justifyContent: "space-between", paddingVertical: space.md }}>
                <Row gap={space.md}>
                  <Avatar wallet={m.wallet} size={30} />
                  <Text v="mono">{m.wallet === address ? "You" : short(m.wallet, 6)}</Text>
                </Row>
                <Text v="small" color={c.textMuted}>
                  {m.isCaptain ? "Creator" : m.isCreator ? "Co-creator" : "Backer"}
                </Text>
              </Row>
            </View>
          ))}
        </Card>
        <Text v="small" color={c.textFaint} style={{ marginTop: space.md }}>
          Buying this ETF pays its creator a {bpsToPct(e.buyFeeBps)} fee. Backers pay the creator 10% of what they win.
        </Text>
      </Screen>

      <View style={{ position: "absolute", left: space.lg, right: space.lg, bottom: Math.max(insets.bottom, 12) + 4 }}>
        <View style={{ borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: c.glassBorder, boxShadow: `0 10px 30px ${c.shadow}` }}>
          <BlurView intensity={30} tint={c.scheme === "dark" ? "dark" : "light"} style={{ padding: space.md, gap: space.sm, backgroundColor: c.glass }}>
            {open ? (
              <Row style={{ justifyContent: "space-between", paddingHorizontal: space.sm }}>
                <Label>Entries close in</Label>
                <Countdown to={e.entryClose} v="bodyStrong" />
              </Row>
            ) : e.roundPhase === "live" || e.roundPhase === "settling" ? (
              <Text v="small" color={c.textMuted} style={{ paddingHorizontal: space.sm }}>
                {closedReason({ id: e.roundId, phase: e.roundPhase, end: e.end }).body}
              </Text>
            ) : null}
            <Row>
              <Button title="Buy" kind="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/amount", params: { round: e.roundId, key: e.key, name: e.name } })} />
              {open ? (
                <Button
                  title={inThis ? "You’re in" : mine ? "In another ETF" : full ? "Team full" : `Back · ${usd(e.stakeUsd, 0)}`}
                  style={{ flex: 2 }}
                  disabled={!!mine || full}
                  loading={busy}
                  onPress={() => run((w) => api.planBack({ wallet: w, roundId: e.roundId, etfKey: e.key }), `You’re backing ${e.name}`)}
                />
              ) : null}
            </Row>
          </BlurView>
        </View>
      </View>
    </View>
  );
}
