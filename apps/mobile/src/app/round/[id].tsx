import { Stack, useLocalSearchParams } from "expo-router";
import { space, useColors } from "@/theme";
import { useRound } from "@/lib/queries";
import { pct, usd, when } from "@/lib/format";
import { Card, ErrorView, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";
import { Standings } from "@/components/Standings";

export default function RoundScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const round = useRound(id);
  if (round.isLoading) return <Screen><Skeleton height={120} /></Screen>;
  if (round.error) return <ErrorView error={round.error} onRetry={() => round.refetch()} />;
  const r = round.data!;
  return (
    <Screen onRefresh={() => round.refetch()}>
      <Stack.Screen options={{ title: `Round ${r.id}` }} />
      <Card style={{ gap: space.md }}>
        <Text v="small" color={c.textMuted}>
          {when(r.entryClose)} → {when(r.end)}
        </Text>
        <Row style={{ justifyContent: "space-between" }}>
          <Stat label="Pot" value={usd(r.potUsd, 0)} />
          <Stat label="Players" value={String(r.players)} align="center" />
          <Stat label="MEDIAN" value={pct(r.medianPct)} color={c.median} align="right" />
        </Row>
        {r.voidReason ? <Text color={c.textMuted}>Void ({r.voidReason}): every ticket came back.</Text> : null}
        {r.inputsHash ? (
          <Text v="small" color={c.textMuted} selectable>
            Settlement inputs hash {r.inputsHash.slice(0, 16)}… (recompute it at /v1/rounds/{r.id}/verify)
          </Text>
        ) : null}
      </Card>
      <SectionTitle title="Standings" />
      <Standings round={r} />
    </Screen>
  );
}
