// Page header: logo row (network badge, wallet pill) and a large light
// title, gloam-style.

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { radius, space, useColors } from "@/theme";
import { short } from "@/lib/format";
import { tap } from "@/lib/haptics";
import { useConfig } from "@/lib/queries";
import { useWallet } from "@/wallet/WalletProvider";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { IconButton, Pill, Row, Text } from "./ui";

/** Testnet / mainnet: always visible so nobody confuses test money with real money. */
export function NetworkBadge() {
  const c = useColors();
  const cluster = useConfig().data?.cluster;
  if (!cluster || cluster === "mainnet") return null;
  return <Pill label="Testnet" dot={c.up} bg={c.upSoft} color={c.up} style={{ alignSelf: "center" }} />;
}

export function WalletPill() {
  const c = useColors();
  const { address } = useWallet();
  return (
    <Pressable
      onPress={() => (tap(), router.push(address ? "/portfolio" : "/connect"))}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: address ? c.fill : c.primary,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {address ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.up }} /> : <Icon name="wallet" size={15} color={c.onPrimary} />}
      <Text v="smallStrong" color={address ? c.text : c.onPrimary}>
        {address ? short(address) : "Connect"}
      </Text>
    </Pressable>
  );
}

export function TopBar() {
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: space.xl }}>
      <Logo size={26} />
      <Row>
        <NetworkBadge />
        <WalletPill />
      </Row>
    </Row>
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
      {right ?? <NetworkBadge />}
    </Row>
  );
}
