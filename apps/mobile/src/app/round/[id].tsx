import { Linking, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { brand, space, useColors } from "@/theme";
import { useConfig, useRound } from "@/lib/queries";
import { pct, usd, when } from "@/lib/format";
import { BackBar } from "@/components/Header";
import { Card, ErrorView, Label, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";
import { Standings } from "@/components/Standings";

const TX_LABEL: Record<string, string> = { opened: "Round opened", settled: "Settlement", voided: "Voided" };

function TxRow({ label, value, href }: { label: string; value: string; href: string }) {
  const c = useColors();
  return (
    <Pressable onPress={() => Linking.openURL(href)} style={({ pressed }) => ({ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md, opacity: pressed ? 0.7 : 1 })}>
      <Text v="smallStrong">{label}</Text>
      <Text v="mono" color={c.brand} numberOfLines={1} style={{ flexShrink: 1 }}>
        {value.slice(0, 6)}…{value.slice(-6)} ↗
      </Text>
    </Pressable>
  );
}

export default function RoundScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const round = useRound(id);
  const cluster = useConfig().data?.cluster;
  const explorer = (path: string) => `https://solscan.io/${path}${cluster && cluster !== "mainnet" ? "?cluster=devnet" : ""}`;
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

      {/* The on-chain record: anyone can check it on Solscan. */}
      <SectionTitle title="On-chain record" />
      <Card style={{ gap: space.md }}>
        <TxRow label="Round account" value={r.account} href={explorer(`account/${r.account}`)} />
        {r.txs.length ? (
          r.txs.map((t) => <TxRow key={t.sig} label={TX_LABEL[t.kind] ?? t.kind} value={t.sig} href={explorer(`tx/${t.sig}`)} />)
        ) : (
          <Text v="small" color={c.textMuted}>
            {r.phase === "settled" || r.phase === "voided" ? "Transactions from before this record was kept are on the round account." : "The settlement transactions appear here when the round ends."}
          </Text>
        )}
        {r.inputsHash ? (
          <Text v="small" color={c.textFaint}>
            The settlement inputs hash above is stored on-chain; anyone can recompute the payouts from the published inputs.
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}
