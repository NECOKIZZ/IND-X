// Results: past rounds and the all-time leaderboard.

import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { signColor, space, useColors } from "@/theme";
import { useLeaderboard, useRounds } from "@/lib/queries";
import { pct, short, usd, when } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { Card, Empty, Num, Pill, Row, Screen, Segmented, Skeleton, Text } from "@/components/ui";

export default function Results() {
  const c = useColors();
  const [tab, setTab] = useState<"rounds" | "leaders">("rounds");
  const rounds = useRounds();
  const leaders = useLeaderboard();
  const { address } = useWallet();

  return (
    <Screen onRefresh={() => Promise.all([rounds.refetch(), leaders.refetch()])}>
      <Segmented value={tab} onChange={setTab} options={[{ value: "rounds", label: "Rounds" }, { value: "leaders", label: "Leaderboard" }]} />
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {tab === "rounds" ? (
          rounds.isLoading ? (
            <Skeleton height={100} />
          ) : !rounds.data?.length ? (
            <Empty title="No rounds yet" />
          ) : (
            rounds.data.map((r) => (
              <Card key={r.id} onPress={() => router.push(`/round/${r.id}`)} style={{ gap: space.sm }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text v="bodyStrong">Round {r.id}</Text>
                  <Pill label={r.phase} />
                </Row>
                <Text v="small" color={c.textMuted}>
                  {when(r.entryClose)} → {when(r.end)} · {r.players} players · {usd(r.potUsd, 0)} pot
                </Text>
                {r.medianPct !== null ? (
                  <Text v="small" color={c.median}>
                    MEDIAN {pct(r.medianPct)}
                  </Text>
                ) : null}
                {r.top.map((t, i) => (
                  <Row key={t.key} style={{ justifyContent: "space-between" }}>
                    <Text v="small" numberOfLines={1} style={{ flex: 1 }}>
                      {["🥇", "🥈", "🥉"][i]} {t.name} <Text v="small" color={c.textMuted}>by {short(t.captain)}</Text>
                    </Text>
                    <Num v="smallStrong" color={signColor(c, t.retPct)}>
                      {pct(t.retPct)}
                    </Num>
                  </Row>
                ))}
              </Card>
            ))
          )
        ) : leaders.isLoading ? (
          <Skeleton height={100} />
        ) : !leaders.data?.length ? (
          <Empty title="No results yet" body="The leaderboard fills in as rounds settle." />
        ) : (
          leaders.data.map((l, i) => (
            <Card key={l.wallet} style={{ borderWidth: l.wallet === address ? 1.5 : 0, borderColor: c.accent, padding: space.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row gap={space.md}>
                  <Num v="heading" color={c.textMuted} style={{ width: 28 }}>
                    {i + 1}
                  </Num>
                  <View>
                    <Text v="bodyStrong">{l.wallet === address ? "You" : short(l.wallet)}</Text>
                    <Text v="small" color={c.textMuted}>
                      {l.wins}W {l.draws}D {l.rounds - l.wins - l.draws}L{l.bestRetPct !== null ? ` · best ${pct(l.bestRetPct)}` : ""}
                    </Text>
                  </View>
                </Row>
                <Num color={signColor(c, l.netUsd)}>{(l.netUsd >= 0 ? "+" : "−") + usd(Math.abs(l.netUsd))}</Num>
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
