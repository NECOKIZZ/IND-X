// A tiny line of an ETF's return over the round.

import Svg, { Line, Path } from "react-native-svg";

export function Sparkline({ values, width = 64, height = 22, color, baseline }: { values: number[]; width?: number; height?: number; color: string; baseline?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(max - min, 1e-6);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      {baseline ? <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={baseline} strokeWidth={1} strokeDasharray="2 3" /> : null}
      <Path d={d} stroke={color} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
