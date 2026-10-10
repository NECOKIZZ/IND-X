// Return chart: the ETF against the S&P 500 and the Index's current level.

import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import type { ChartPoint } from "@indx/core";
import { brand, space, useColors } from "@/theme";
import { pct } from "@/lib/format";
import { Row, Text } from "./ui";

export function ReturnChart({ points, medianPct, height = 180 }: { points: ChartPoint[]; medianPct: number | null; height?: number }) {
  const c = useColors();
  const [w, setW] = useState(0);
  if (points.length < 2) {
    return (
      <View style={{ height: 56, alignItems: "flex-start", justifyContent: "center" }}>
        <Text v="small" color={c.textMuted}>The chart starts when entries close.</Text>
      </View>
    );
  }
  const ys = points.flatMap((p) => [p.retPct, p.benchPct ?? p.retPct]).concat(medianPct ?? 0, 0);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(max - min, 0.2);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => height - 8 - ((v - min) / span) * (height - 16);
  const path = (get: (p: ChartPoint) => number | null) =>
    points
      .filter((p) => get(p) !== null)
      .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(get(p)!).toFixed(1)}`)
      .join(" ");
  const last = points[points.length - 1].retPct;
  const lineColor = last >= (medianPct ?? 0) ? c.up : c.down;
  return (
    <View>
      <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke={c.border} strokeWidth={1} />
            {medianPct !== null ? <Line x1={0} x2={w} y1={y(medianPct)} y2={y(medianPct)} stroke={c.line} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} /> : null}
            <Path d={path((p) => p.benchPct)} stroke={c.textMuted} strokeWidth={1.5} fill="none" opacity={0.6} />
            <Path d={path((p) => p.retPct)} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        ) : null}
      </View>
      <Row gap={space.lg} style={{ marginTop: space.sm }}>
        <Legend color={lineColor} label={`This ETF ${pct(last)}`} />
        {medianPct !== null ? <Legend color={c.line} label={`${brand.Line} ${pct(medianPct)}`} dashed /> : null}
        <Legend color={c.textMuted} label="S&P 500" />
      </Row>
    </View>
  );
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
