// UI primitives in the IndX style: airy surfaces with hairline borders,
// light display type, ink and sage pills, small-caps labels.

import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, TAB_BAR_SPACE, type, useColors } from "@/theme";
import { tap } from "@/lib/haptics";
import { Icon, type IconName } from "./Icon";

type Variant = Exclude<keyof typeof type, "number">;

/**
 * How much to shrink type on narrow phones: designs are drawn at 390pt wide;
 * a 320pt phone gets ~82%, never smaller. Big display numbers shrink the most.
 */
export function useTypeScale() {
  const { width } = useWindowDimensions();
  return Math.max(0.8, Math.min(1, width / 390));
}

function scaled(style: TextStyle, k: number): TextStyle {
  if (k >= 1) return style;
  const big = (style.fontSize ?? 16) >= 24;
  const f = big ? k : 1 - (1 - k) * 0.5; // body text shrinks half as much
  return {
    ...style,
    fontSize: style.fontSize ? style.fontSize * f : undefined,
    lineHeight: style.lineHeight ? style.lineHeight * f : undefined,
    letterSpacing: style.letterSpacing ? style.letterSpacing * f : undefined,
  };
}

export function Text({ v = "body", color, style, children, numberOfLines, selectable, onPress }: { v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean; onPress?: () => void }) {
  const c = useColors();
  const k = useTypeScale();
  const flat = StyleSheet.flatten([type[v], { color: color ?? c.text }, style]) as TextStyle;
  return (
    <RNText selectable={selectable} numberOfLines={numberOfLines} onPress={onPress} style={scaled(flat, k)}>
      {children}
    </RNText>
  );
}

/** Tabular numbers, light by default (gloam-style big figures). */
export function Num({ v = "bodyStrong", color, style, children, unit }: { v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; unit?: string }) {
  const c = useColors();
  return (
    <Text v={v} color={color} style={[type.number, style]}>
      {children}
      {unit ? (
        <RNText style={[type.small, { color: c.textFaint, letterSpacing: 0 }]}>
          {" "}
          {unit}
        </RNText>
      ) : null}
    </Text>
  );
}

export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <Text v="label" color={color ?? c.textMuted} style={style}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress, flat }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; flat?: boolean }) {
  const c = useColors();
  const body = (
    <View
      style={[
        {
          backgroundColor: flat ? c.fill : c.surface,
          borderRadius: radius.lg,
          padding: space.lg,
          borderCurve: "continuous",
          borderWidth: flat ? 0 : StyleSheet.hairlineWidth,
          borderColor: c.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }], opacity: pressed ? 0.9 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Spacer({ h = space.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
  style,
  small,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  icon?: IconName;
}) {
  const c = useColors();
  const bg = kind === "primary" ? c.primary : kind === "secondary" ? c.secondary : kind === "danger" ? c.down : "transparent";
  const fg = kind === "primary" ? c.onPrimary : kind === "secondary" ? c.onSecondary : kind === "danger" ? "#fff" : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          borderWidth: kind === "outline" ? 1 : 0,
          borderColor: c.border,
          paddingVertical: small ? 9 : 15,
          paddingHorizontal: small ? 14 : 24,
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.35 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <Text v={small ? "smallStrong" : "bodyStrong"} color={fg}>
            {title}
          </Text>
          {icon ? <Icon name={icon} size={small ? 14 : 16} color={fg} strokeWidth={2} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Round icon button (back, close, steppers). */
export function IconButton({ icon, onPress, size = 40, disabled }: { icon: IconName; onPress: () => void; size?: number; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      disabled={disabled}
      onPress={() => (tap(), onPress())}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: c.fill, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={size * 0.48} color={c.text} strokeWidth={2} />
    </Pressable>
  );
}

export function Pill({ label, color, bg, dot, style }: { label: string; color?: string; bg?: string; dot?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: bg ?? c.fill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }, style]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
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
      style={{ borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: selected ? c.primary : c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? c.primary : c.border }}
    >
      <Text v="smallStrong" color={selected ? c.onPrimary : c.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.fill, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => (tap(), onChange(o.value))}
            style={{ flex: 1, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: on ? c.surface : "transparent", alignItems: "center", boxShadow: on ? `0 1px 3px ${c.shadow}` : undefined }}
          >
            <Text v="smallStrong" color={on ? c.text : c.textMuted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stat({ label, value, color, align = "left", unit }: { label: string; value: string; color?: string; align?: "left" | "right" | "center"; unit?: string }) {
  return (
    <View style={{ alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center", gap: 2 }}>
      <Label>{label}</Label>
      <Num v="heading" color={color} unit={unit} style={{ fontFamily: type.title.fontFamily, fontSize: 24, lineHeight: 30, letterSpacing: -0.6 }}>
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
    <Row style={{ justifyContent: "space-between", marginTop: space.xxl, marginBottom: space.md }}>
      <Label>{title}</Label>
      {action}
    </Row>
  );
}

export function Skeleton({ height = 18, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height, width, borderRadius: radius.md, backgroundColor: c.fill }, style]} />;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.lg, gap: space.sm }}>
      <Text v="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text color={c.textMuted} style={{ textAlign: "center" }}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Screen>
      <Empty title="Something went wrong" body={(error as Error)?.message ?? String(error)} action={onRetry ? <Button title="Try again" kind="secondary" small onPress={onRetry} /> : undefined} />
    </Screen>
  );
}

/** A scrolling screen: safe-area top, room for the floating tab bar, pull-to-refresh. */
export function Screen({ children, onRefresh, contentStyle, bottom = TAB_BAR_SPACE, top = true }: { children: ReactNode; onRefresh?: () => Promise<unknown>; contentStyle?: StyleProp<ViewStyle>; bottom?: number; top?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[{ paddingHorizontal: space.lg + 4, paddingTop: top ? insets.top + space.sm : space.lg, paddingBottom: bottom + insets.bottom }, contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            tintColor={c.textMuted}
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
