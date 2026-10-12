// Results: the live pool, the all-time leaderboard and past rounds.

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { brand, radius, signColor, space, useColors } from "@/theme";
import { useLeaderboard, usePool, useRounds } from "@/lib/queries";
import { pct, short, usd, when } from "@/lib/format";
import { useWallet } from "@/wallet/WalletProvider";
import { PageTitle } from "@/components/Header";
import { Glow } from "@/components/Glow";
import { Icon } from "@/components/Icon";
import { Card, Divider, Empty, Label, Num, Pill, Row, Screen, Segmented, Skeleton, Text } from "@/components/ui";

/** Counts smoothly to a new value when it changes. */
function useTicker(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - start) / 900);
      const v = a + (target - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      if (k >= 1) {
        from.current = target;
        clearInterval(id);
      }
    }, 30);
    return () => clearInterval(id);
  }, [target]);
  return shown;
}

function PoolCard() {
  const pool = usePool().data;
  if (!pool) return <Skeleton height={180} style={{ borderRadius: radius.xl, marginBottom: space.md }} />;
  return <PoolBody seasonUsd={pool.seasonUsd} />;
}

function PoolBody({ seasonUsd }: { seasonUsd: number }) {
  const c = useColors();
  const shown = useTicker(seasonUsd);
  // What it was when you opened the page, to show it growing.
  const [first] = useState(seasonUsd);
  const grown = seasonUsd - first;
  return (
    <View style={{ borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, marginBottom: space.md }}>
      <Glow variant={0} />
      <View style={{ padding: space.xl, gap: space.md }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Label color={c.text}>Season pot</Label>
          <Row gap={6}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.up }} />
            <Label color={c.up}>Live</Label>
          </Row>
        </Row>
        <View>
          <Num v="display">{usd(shown)}</Num>
          <Text v="small" color={c.textMuted}>
            {grown > 0 ? <Text v="small" color={c.up}>{`+${usd(grown)} `}</Text> : null}
            {grown > 0 ? "while you've been here" : "Grows with every round's take"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function Results() {
  const c = useColors();
  const [tab, setTab] = useState<"rounds" | "leaders">("leaders");
  const rounds = useRounds();
  const leaders = useLeaderboard();
  const { address } = useWallet();

  return (
    <Screen onRefresh={() => Promise.all([rounds.refetch(), leaders.refetch()])}>
      <PageTitle title="Results" />
      <Segmented value={tab} onChange={setTab} options={[{ value: "leaders", label: "Leaderboard" }, { value: "rounds", label: "Rounds" }]} />
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {tab === "leaders" ? <PoolCard /> : null}
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
                      <Text v="bodyStrong">{l.wallet === address ? "You" : l.tag ? `@${l.tag}` : short(l.wallet)}</Text>
                      <Text v="small" color={c.textMuted}>
                        {l.wins}W {l.rounds - l.wins}L{l.bestRetPct !== null ? ` · best ${pct(l.bestRetPct)}` : ""}
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
