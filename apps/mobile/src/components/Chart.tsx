// Return chart: the ETF against the S&P 500 and the median, on week axes.

import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import type { ChartPoint } from "@indx/core";
import { brand, space, useColors } from "@/theme";
import { pct } from "@/lib/format";
import { Row, Text } from "./ui";

const GUTTER = 34;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** A round number the returns fit in: ±2%, ±4%, ±6%… */
function niceRange(values: number[]) {
  const m = Math.max(2, ...values.map((v) => Math.abs(v)));
  return Math.ceil(m / 2) * 2;
}

/**
 * The ETF's return against the S&P 500 and the median, on axes drawn from the
 * start: the week along the bottom (Mon to Fri), returns up the side. Before
 * the round starts, the empty axes say when it starts.
 */
export function ReturnChart({ points, medianPct, height = 180, from, to }: { points: ChartPoint[]; medianPct: number | null; height?: number; from?: number; to?: number }) {
  const c = useColors();
  const [w, setW] = useState(0);
  const started = points.length >= 2;
  const range = niceRange(started ? points.flatMap((p) => [p.retPct, p.benchPct ?? 0, p.medianPct ?? 0]) : []);
  const plotW = Math.max(0, w - GUTTER);
  const t0 = from ? from * 1000 : started ? points[0].t : 0;
  const t1 = to ? to * 1000 : started ? points[points.length - 1].t : 1;
  const x = (t: number) => GUTTER + Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0))) * plotW;
  const y = (v: number) => 6 + ((range - v) / (2 * range)) * (height - 12);
  const path = (get: (p: ChartPoint) => number | null) =>
    points
      .filter((p) => get(p) !== null)
      .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(get(p)!).toFixed(1)}`)
      .join(" ");
  const last = started ? points[points.length - 1].retPct : null;
  const lastMedian = started ? (points[points.length - 1].medianPct ?? medianPct) : null;
  const lineColor = last === null || lastMedian === null || last > lastMedian ? c.up : c.down;
  const ticks = [range, range / 2, 0, -range / 2, -range];
  return (
    <View>
      <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            {ticks.map((v) => (
              <Line key={v} x1={GUTTER} x2={w} y1={y(v)} y2={y(v)} stroke={c.border} strokeWidth={1} strokeDasharray={v === 0 ? "4 4" : undefined} opacity={v === 0 ? 1 : 0.6} />
            ))}
            <Line x1={GUTTER} x2={GUTTER} y1={y(range)} y2={y(-range)} stroke={c.border} strokeWidth={1} />
            {started && points.some((p) => p.medianPct !== null) ? <Path d={path((p) => p.medianPct)} stroke={c.line} strokeWidth={1.2} strokeDasharray="4 4" fill="none" opacity={0.7} /> : null}
            {started ? <Path d={path((p) => p.benchPct)} stroke={c.textMuted} strokeWidth={1.5} fill="none" opacity={0.6} /> : null}
            {started ? <Path d={path((p) => p.retPct)} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          </Svg>
        ) : null}
        {ticks.map((v) => (
          <Text key={v} v="label" color={v === 0 ? c.textMuted : c.textFaint} style={{ position: "absolute", left: 0, width: GUTTER - 6, textAlign: "right", top: y(v) - 7, letterSpacing: 0, textTransform: "none" }}>
            {v > 0 ? `+${v}%` : v < 0 ? `−${-v}%` : "0%"}
          </Text>
        ))}
        {!started ? (
          <View style={{ position: "absolute", left: GUTTER, right: 0, top: y(0) - 15, alignItems: "center" }}>
            <View style={{ backgroundColor: c.fill, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text v="small">Not started{from ? ` · ${startLabel(from)}` : ""}</Text>
            </View>
          </View>
        ) : null}
      </View>
      <Row style={{ marginLeft: GUTTER, marginTop: 4 }}>
        {DAYS.map((d) => (
          <Text key={d} v="label" color={c.textFaint} style={{ flex: 1, textAlign: "center", letterSpacing: 0, textTransform: "none" }}>
            {d}
          </Text>
        ))}
      </Row>
      <Row gap={space.lg} style={{ marginTop: space.sm }}>
        <Legend color={lineColor} label={last === null ? "This ETF" : `This ETF ${pct(last)}`} />
        <Legend color={c.line} label={lastMedian === null ? brand.Line : `${brand.Line} ${pct(lastMedian)}`} dashed />
        <Legend color={c.textMuted} label="S&P 500" />
      </Row>
    </View>
  );
}

function startLabel(unix: number) {
  const d = new Date(unix * 1000);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const c = useColors();
  return (
    <Row gap={6}>
      <View style={{ width: 14, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      <Text v="small" color={c.textMuted}>
        {label}
      </Text>
    </Row>
  );
}
