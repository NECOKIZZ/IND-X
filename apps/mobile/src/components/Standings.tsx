// ETFs ranked by return, with MEDIAN drawn as a line between those above
// and those below.

import { Fragment } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { EtfSummary, RoundView } from "@indx/core";
import { radius, signColor, space, useColors } from "@/theme";
import { pct, short } from "@/lib/format";
import { LogoStack } from "./AssetLogo";
import { Card, Num, Row, Text } from "./ui";

export function MedianLine({ medianPct, live }: { medianPct: number | null; live: boolean }) {
  const c = useColors();
  return (
    <Row style={{ marginVertical: space.sm }}>
      <View style={{ flex: 1, height: 0, borderTopWidth: 1.5, borderColor: c.median, borderStyle: "dashed" }} />
      <View style={{ backgroundColor: c.median, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
        <Text v="label" color="#000">
          MEDIAN {medianPct !== null ? pct(medianPct) : ""}
          {live ? " · live" : ""}
        </Text>
      </View>
      <View style={{ flex: 1, height: 0, borderTopWidth: 1.5, borderColor: c.median, borderStyle: "dashed" }} />
    </Row>
  );
}

export function EtfRow({ etf, roundId, mine }: { etf: EtfSummary; roundId: string; mine?: boolean }) {
  const c = useColors();
  const tone = etf.standing === "above" ? c.up : etf.standing === "below" ? c.down : etf.standing === "draw" ? c.median : c.textMuted;
  return (
    <Card onPress={() => router.push(`/etf/${roundId}/${etf.key}`)} style={{ marginBottom: space.sm, borderWidth: mine ? 1.5 : 0, borderColor: c.accent }}>
      <Row gap={space.md}>
        <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: tone }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {etf.rank ? `${etf.rank}. ` : ""}
              {etf.name}
            </Text>
            <Num color={signColor(c, etf.retPct)}>{pct(etf.retPct)}</Num>
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Row>
              <LogoStack legs={etf.legs} size={20} />
              <Text v="small" color={c.textMuted}>
                {etf.tickets} {etf.tickets === 1 ? "ticket" : "tickets"} · {short(etf.captain)}
              </Text>
            </Row>
            {etf.refunded ? (
              <Text v="small" color={c.textMuted}>
                refunded
              </Text>
            ) : etf.ticketPayoutUsd !== null ? (
              <Text v="small" color={c.textMuted}>
                ticket → ${etf.ticketPayoutUsd.toFixed(2)}
              </Text>
            ) : null}
          </Row>
        </View>
      </Row>
    </Card>
  );
}

export function Standings({ round, mineKey }: { round: RoundView; mineKey?: string | null }) {
  const c = useColors();
  const etfs = round.etfs;
  if (!etfs.length) return null;
  // MEDIAN goes after the last ETF above it (draws sit on the line).
  const scored = round.medianPct !== null;
  const lastAbove = scored ? etfs.reduce((i, e, j) => (e.standing === "above" ? j : i), -1) : -2;
  return (
    <View>
      {round.pricing === "preview" ? (
        <Text v="small" color={c.textMuted} style={{ marginBottom: space.sm }}>
          Before the round starts: ranked by each basket’s last 24 hours.
        </Text>
      ) : null}
      {scored && lastAbove === -1 ? <MedianLine medianPct={round.medianPct} live={round.pricing !== "final"} /> : null}
      {etfs.map((e, i) => (
        <Fragment key={e.key}>
          <EtfRow etf={e} roundId={round.id} mine={e.key === mineKey} />
          {i === lastAbove ? <MedianLine medianPct={round.medianPct} live={round.pricing !== "final"} /> : null}
        </Fragment>
      ))}
    </View>
  );
}
