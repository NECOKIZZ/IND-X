// The floating glass tab bar: a frosted pill hovering above the content,
// the active tab marked by a sage capsule.

import { Platform, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComponentProps } from "react";
import type { Tabs } from "expo-router";
import { font, radius, useColors } from "@/theme";
import { tap } from "@/lib/haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./ui";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  "(home)": { label: "League", icon: "league" },
  create: { label: "Build", icon: "build" },
  portfolio: { label: "Portfolio", icon: "portfolio" },
  results: { label: "Results", icon: "results" },
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 4, alignItems: "center" }}>
      <View
        style={{
          borderRadius: radius.pill,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: c.glassBorder,
          boxShadow: `0 10px 30px ${c.shadow}`,
        }}
      >
        <BlurView intensity={Platform.OS === "android" ? 0 : 40} tint={c.scheme === "dark" ? "dark" : "light"} style={{ flexDirection: "row", padding: 6, gap: 2, backgroundColor: c.glass }}>
          {state.routes.map((route, i) => {
            const t = TABS[route.name];
            if (!t) return null;
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={t.label}
                onPress={() => {
                  tap();
                  const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  height: 46,
                  paddingHorizontal: focused ? 16 : 14,
                  borderRadius: radius.pill,
                  backgroundColor: focused ? (c.scheme === "dark" ? c.secondary : c.brand) : "transparent",
                }}
              >
                <Icon name={t.icon} size={21} color={focused ? (c.scheme === "dark" ? c.brand : c.text) : c.textMuted} />
                {focused ? (
                  <Text v="smallStrong" color={c.scheme === "dark" ? c.brand : c.text} style={{ fontFamily: font.medium }}>
                    {t.label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}
