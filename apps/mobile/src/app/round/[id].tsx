import { useLocalSearchParams } from "expo-router";
import { brand, space, useColors } from "@/theme";
import { useRound } from "@/lib/queries";
import { pct, usd, when } from "@/lib/format";
import { BackBar } from "@/components/Header";
import { Card, ErrorView, Label, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";
import { Standings } from "@/components/Standings";

export default function RoundScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const round = useRound(id);
  if (round.isLoading)
    return (
      <Screen bottom={40}>
        <BackBar />
        <Skeleton height={160} />
      </Screen>
    );
  if (round.error) return <ErrorView error={round.error} onRetry={() => round.refetch()} />;
  const r = round.data!;
  return (
    <Screen onRefresh={() => round.refetch()} bottom={60}>
      <BackBar />
      <Label>
        {when(r.entryClose)} → {when(r.end)}
      </Label>
      <Text v="hero" style={{ marginTop: space.sm, marginBottom: space.xl }}>
        Round {r.id}
      </Text>
      <Card style={{ gap: space.lg }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Stat label="Pot" value={usd(r.potUsd, 0)} />
          <Stat label="Players" value={String(r.players)} />
          <Stat label={brand.Line} value={pct(r.medianPct)} align="right" />
        </Row>
        {r.voidReason ? <Text color={c.textMuted}>Void ({r.voidReason}): every ticket came back.</Text> : null}
        {r.inputsHash ? (
          <Text v="mono" color={c.textFaint} selectable>
            inputs {r.inputsHash.slice(0, 24)}…
          </Text>
        ) : null}
      </Card>
      <SectionTitle title="Standings" />
      <Standings round={r} />
    </Screen>
  );
}
