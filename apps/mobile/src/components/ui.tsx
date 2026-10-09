// UI primitives, all styled from the theme tokens.

import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { radius, space, type, useColors } from "@/theme";
import { tap } from "@/lib/haptics";

type Variant = keyof typeof type;

export function Text({ v = "body", color, style, children, numberOfLines, selectable }: { v?: Exclude<Variant, "number">; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean }) {
  const c = useColors();
  return (
    <RNText selectable={selectable} numberOfLines={numberOfLines} style={[type[v], { color: color ?? c.text }, style]}>
      {children}
    </RNText>
  );
}

/** Tabular numbers. */
export function Num({ v = "bodyStrong", color, style, children }: { v?: Exclude<Variant, "number">; color?: string; style?: StyleProp<TextStyle>; children: ReactNode }) {
  return (
    <Text v={v} color={color} style={[type.number, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const body = <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, borderCurve: "continuous" }, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      {body}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const bg = kind === "primary" ? c.accent : kind === "secondary" ? c.surfaceAlt : kind === "danger" ? c.down : "transparent";
  const fg = kind === "primary" ? c.accentText : kind === "danger" ? "#fff" : kind === "ghost" ? c.accent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: small ? space.sm : space.md + 2,
          paddingHorizontal: small ? space.md : space.xl,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          minHeight: small ? 36 : 50,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text v={small ? "smallStrong" : "bodyStrong"} color={fg}>{title}</Text>}
    </Pressable>
  );
}

export function Pill({ label, color, bg, style }: { label: string; color?: string; bg?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: bg ?? c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 3, alignSelf: "flex-start" }, style]}>
      <Text v="smallStrong" color={color ?? c.text}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => (tap(), onPress())}
      style={{ borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: selected ? c.text : c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? c.text : c.border }}
    >
      <Text v="smallStrong" color={selected ? c.bg : c.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderRadius: radius.pill, padding: 3 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => (tap(), onChange(o.value))} style={{ flex: 1, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: o.value === value ? c.bg : "transparent", alignItems: "center" }}>
          <Text v="smallStrong" color={o.value === value ? c.text : c.textMuted}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stat({ label, value, color, align = "left" }: { label: string; value: string; color?: string; align?: "left" | "right" | "center" }) {
  const c = useColors();
  return (
    <View style={{ alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}>
      <Text v="label" color={c.textMuted}>
        {label}
      </Text>
      <Num v="heading" color={color}>
        {value}
      </Num>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }, style]} />;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: space.xl, marginBottom: space.sm }}>
      <Text v="heading">{title}</Text>
      {action}
    </Row>
  );
}

export function Skeleton({ height = 18, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height, width, borderRadius: radius.sm, backgroundColor: c.surfaceAlt }, style]} />;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", padding: space.xxl, gap: space.sm }}>
      <Text v="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text color={c.textMuted} style={{ textAlign: "center" }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <Empty title="Something went wrong" body={(error as Error)?.message ?? String(error)} action={onRetry ? <Button title="Try again" kind="secondary" small onPress={onRetry} /> : undefined} />;
}

/** A scrolling screen with pull-to-refresh, padded for large headers. */
export function Screen({ children, onRefresh, contentStyle }: { children: ReactNode; onRefresh?: () => Promise<unknown>; contentStyle?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[{ padding: space.lg, paddingBottom: space.xxxl * 2 }, contentStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await onRefresh().catch(() => {});
              setRefreshing(false);
            }}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}
