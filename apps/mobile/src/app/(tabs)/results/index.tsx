// Results: past rounds and the all-time leaderboard.

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { brand, signColor, space, useColors } from "@/theme";
import { useLeaderboard, useRounds } from "@/lib/queries";
import { pct, short, usd, when } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { PageTitle, TopBar } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Card, Divider, Empty, Label, Num, Pill, Row, Screen, Segmented, Skeleton, Text } from "@/components/ui";

export default function Results() {
  const c = useColors();
  const [tab, setTab] = useState<"rounds" | "leaders">("rounds");
  const rounds = useRounds();
  const leaders = useLeaderboard();
  const { address } = useWallet();

  return (
    <Screen onRefresh={() => Promise.all([rounds.refetch(), leaders.refetch()])}>
      <TopBar />
      <PageTitle title="Results" />
      <Segmented value={tab} onChange={setTab} options={[{ value: "rounds", label: "Rounds" }, { value: "leaders", label: "Leaderboard" }]} />
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {tab === "rounds" ? (
          rounds.isLoading ? (
            <Skeleton height={140} />
          ) : !rounds.data?.length ? (
            <Empty title="No rounds yet" />
          ) : (
            rounds.data.map((r) => (
              <Card key={r.id} onPress={() => router.push(`/round/${r.id}`)} style={{ gap: space.md }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text v="title" style={{ fontSize: 26, lineHeight: 30 }}>
                    Round {r.id}
                  </Text>
                  <Row>
                    <Pill label={r.phase} dot={r.phase === "live" || r.phase === "open" ? c.up : undefined} />
                    <Icon name="arrow" size={14} color={c.textMuted} />
                  </Row>
                </Row>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text v="small" color={c.textMuted}>
                    {when(r.end)}
                  </Text>
                  <Text v="small" color={c.textMuted}>
                    {r.players} players · {usd(r.potUsd, 0)} pot
                    {r.medianPct !== null ? ` · ${brand.Line} ${pct(r.medianPct)}` : ""}
                  </Text>
                </Row>
                {r.top.length ? (
                  <View>
                    <Divider style={{ marginBottom: space.xs }} />
                    {r.top.map((t, i) => (
                      <Row key={t.key} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                        <Row style={{ flex: 1 }}>
                          <Num v="smallStrong" color={c.textFaint} style={{ width: 16 }}>
                            {i + 1}
                          </Num>
                          <Text v="small" numberOfLines={1} style={{ flex: 1 }}>
                            {t.name} <Text v="small" color={c.textFaint}>{short(t.captain)}</Text>
                          </Text>
                        </Row>
                        <Num v="smallStrong" color={signColor(c, t.retPct)}>
                          {pct(t.retPct)}
                        </Num>
                      </Row>
                    ))}
                  </View>
                ) : null}
              </Card>
            ))
          )
        ) : leaders.isLoading ? (
          <Skeleton height={140} />
        ) : !leaders.data?.length ? (
          <Empty title="No results yet" body="The leaderboard fills in as rounds settle." />
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {leaders.data.map((l, i) => (
              <View key={l.wallet}>
                {i ? <Divider /> : null}
                <Row style={{ justifyContent: "space-between", paddingVertical: space.md }}>
                  <Row gap={space.md}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: i < 3 ? c.brand : c.fill, borderWidth: l.wallet === address ? 1 : StyleSheet.hairlineWidth, borderColor: l.wallet === address ? c.text : c.border }}>
                      <Num v="smallStrong" color={i < 3 ? "#0B0C0E" : c.text}>
                        {i + 1}
                      </Num>
                    </View>
                    <View>
                      <Text v="bodyStrong">{l.wallet === address ? "You" : short(l.wallet)}</Text>
                      <Text v="small" color={c.textMuted}>
                        {l.wins}W {l.draws}D {l.rounds - l.wins - l.draws}L{l.bestRetPct !== null ? ` · best ${pct(l.bestRetPct)}` : ""}
                      </Text>
                    </View>
                  </Row>
                  <View style={{ alignItems: "flex-end" }}>
                    <Label>Net</Label>
                    <Num color={signColor(c, l.netUsd)}>{(l.netUsd >= 0 ? "+" : "−") + usd(Math.abs(l.netUsd))}</Num>
                  </View>
                </Row>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
