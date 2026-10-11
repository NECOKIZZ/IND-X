// Headers. The League has the app bar (Ind-X, Testnet when on testnet, the
// ⋯ menu); other tabs have a large light page title; pushed screens a back
// button.

import { useState, type ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, font, space, useAppearance, useColors, type Appearance } from "@/theme";
import { tap } from "@/lib/haptics";
import { useConfig, useRound } from "@/lib/queries";
import { Icon, type IconName } from "./Icon";
import { Divider, IconButton, Label, Pill, Row, Segmented, Text } from "./ui";

/** Shown only on testnet, so nobody confuses test money with real money. */
export function NetworkBadge() {
  const c = useColors();
  const cluster = useConfig().data?.cluster;
  if (!cluster || cluster === "mainnet") return null;
  return <Pill label="Testnet" dot={c.up} bg={c.upSoft} color={c.up} style={{ alignSelf: "center" }} />;
}

export const APP_BAR_HEIGHT = 58;

/** The League's app bar. */
export function AppBar() {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <Row style={{ height: APP_BAR_HEIGHT, alignItems: "center" }} gap={10}>
      <Text v="title" style={{ flex: 1, fontFamily: font.medium, fontSize: 30, lineHeight: 36, letterSpacing: -1 }}>
        {brand.name}
      </Text>
      <NetworkBadge />
      <Pressable
        accessibilityLabel="Menu"
        onPress={() => (tap(), setOpen(true))}
        style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: c.fill, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
      >
        <Icon name="more" size={18} color={c.text} />
      </Pressable>
      <Menu open={open} onClose={() => setOpen(false)} />
    </Row>
  );
}

function Menu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { appearance, setAppearance } = useAppearance();
  const roundId = useRound().data?.id;
  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };
  const item = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 13, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={20} color={c.brand} />
      <Text>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(5,6,7,0.55)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: space.lg + 4,
            top: insets.top + space.sm + APP_BAR_HEIGHT - 4,
            width: 268,
            borderRadius: 24,
            backgroundColor: c.scheme === "dark" ? "rgba(28,34,36,0.97)" : c.surface,
            borderWidth: 1,
            borderColor: c.border,
            overflow: "hidden",
            boxShadow: `0 24px 60px ${c.shadow}`,
          }}
        >
          <View style={{ padding: space.lg, paddingBottom: space.md, gap: space.sm }}>
            <Label>Appearance</Label>
            <Segmented<Appearance>
              value={appearance}
              onChange={setAppearance}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "system", label: "System" },
              ]}
            />
          </View>
          <Divider style={{ marginVertical: 0 }} />
          {item("league", "How Ind-X works", () => go("/rules"))}
          {item("rules", "Rules & payouts", () => go("/rules"))}
          {item("docs", "FAQ & docs", () => go("/rules"))}
          {item("shield", "Verify a round", () => go(roundId ? `/round/${roundId}` : "/results"))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.xl }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text v="hero" style={{ flex: 1 }}>
          {title}
        </Text>
        {right}
      </Row>
      {subtitle ? (
        <Text color={c.textMuted} style={{ marginTop: space.sm }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Header for pushed screens: back button (and optional right action). */
export function BackBar({ right }: { right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: space.lg }}>
      <IconButton icon="back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      {right ?? null}
    </Row>
  );
}


