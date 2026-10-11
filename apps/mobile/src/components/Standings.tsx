// ETFs ranked by return, with the median drawn as a line between those
// above it and those below.

import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { EtfSummary, RoundView } from "@indx/core";
import { brand, radius, signColor, space, useColors } from "@/theme";
import { pct, short, usd } from "@/lib/format";
import { LogoStack } from "./AssetLogo";
import { Sparkline } from "./Sparkline";
import { Card, Num, Row, Text } from "./ui";

export function MedianLine({ value, live }: { value: number | null; live: boolean }) {
  const c = useColors();
  return (
    <Row style={{ marginVertical: space.md }} gap={space.sm}>
      <View style={{ flex: 1, height: 0, borderTopWidth: 1, borderColor: c.line, borderStyle: "dashed", opacity: 0.5 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: c.scheme === "dark" ? c.secondary : c.text }}>
        {live ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.brand }} /> : null}
        <Text v="label" color={c.scheme === "dark" ? c.brand : c.bg}>
          {brand.Line} {value !== null ? pct(value) : ""}
        </Text>
      </View>
      <View style={{ flex: 1, height: 0, borderTopWidth: 1, borderColor: c.line, borderStyle: "dashed", opacity: 0.5 }} />
    </Row>
  );
}

export function EtfRow({ etf, roundId, mine }: { etf: EtfSummary; roundId: string; mine?: boolean }) {
  const c = useColors();
  const tone = etf.standing === "above" ? c.up : etf.standing === "below" ? c.down : c.textFaint;
  return (
    <Card onPress={() => router.push(`/etf/${roundId}/${etf.key}`)} style={{ marginBottom: space.sm, paddingVertical: space.md + 2, borderColor: mine ? c.text : c.border, borderWidth: mine ? 1 : StyleSheet.hairlineWidth }}>
      <Row gap={space.md}>
        <Num v="small" color={c.textFaint} style={{ width: 18 }}>
          {etf.rank ?? "–"}
        </Num>
        <View style={{ flex: 1, gap: 6 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Row style={{ flex: 1 }} gap={6}>
              <Text v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {etf.name}
              </Text>
              {mine ? (
                <Text v="label" color={c.up}>
                  you
                </Text>
              ) : null}
            </Row>
            <Row gap={space.sm}>
              <Sparkline values={etf.spark} color={signColor(c, etf.retPct)} baseline={c.border} />
              <Num v="bodyStrong" color={signColor(c, etf.retPct)}>
                {pct(etf.retPct)}
              </Num>
            </Row>
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Row>
              <LogoStack legs={etf.legs} size={18} />
              <Text v="small" color={c.textMuted}>
                {etf.tickets} {etf.tickets === 1 ? "ticket" : "tickets"} · {short(etf.captain)}
              </Text>
            </Row>
            {etf.refunded ? (
              <Text v="small" color={c.textFaint}>
                refunded
              </Text>
            ) : etf.ticketPayoutUsd !== null ? (
              <Row gap={5}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
                <Text v="small" color={c.textMuted}>
                  $5 → {usd(etf.ticketPayoutUsd)}
                </Text>
              </Row>
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
  const scored = round.medianPct !== null;
  const lastAbove = scored ? etfs.reduce((i, e, j) => (e.standing === "above" ? j : i), -1) : -2;
  const live = round.pricing !== "final";
  return (
    <View>
      {round.pricing === "preview" ? (
        <Text v="small" color={c.textMuted} style={{ marginBottom: space.md }}>
          Before the round starts, ETFs are ranked by their last 24 hours.
        </Text>
      ) : null}
      {scored && lastAbove === -1 ? <MedianLine value={round.medianPct} live={live} /> : null}
      {etfs.map((e, i) => (
        <Fragment key={e.key}>
          <EtfRow etf={e} roundId={round.id} mine={e.key === mineKey} />
          {i === lastAbove ? <MedianLine value={round.medianPct} live={live} /> : null}
        </Fragment>
      ))}
    </View>
  );
}
