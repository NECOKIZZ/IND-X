// Wallet chooser (a sheet). Embedded wallets (email / passkey sign-in) slot
// in here as another option once chosen.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { brand, radius, space, useColors } from "@/theme";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { Icon } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { Empty, Text } from "@/components/ui";
import type { WalletKind } from "@/wallet/types";

export default function Connect() {
  const c = useColors();
  const { options, connect } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState<WalletKind | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.md }}>
      <Mark size={40} />
      <Text v="title" style={{ marginTop: space.sm }}>
        Connect to {brand.name}
      </Text>
      <Text color={c.textMuted}>{brand.pitch}</Text>
      <View style={{ marginTop: space.sm, gap: space.sm }}>
        {options.length === 0 ? <Empty title="No wallet available here" body="Open the app on your phone." /> : null}
        {options.map((o) => (
          <Pressable
            key={o.kind}
            disabled={!!busy}
            onPress={async () => {
              setBusy(o.kind);
              try {
                await connect(o.kind);
                success();
                toast("Wallet connected", "ok");
                if (router.canGoBack()) router.back();
                else router.replace("/");
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(null);
              }
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              backgroundColor: c.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: c.border,
              padding: space.lg,
              opacity: busy && busy !== o.kind ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" }}>
              <Icon name="wallet" size={20} color={c.onSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong">{busy === o.kind ? "Connecting…" : o.label}</Text>
              <Text v="small" color={c.textMuted}>
                {o.detail}
              </Text>
            </View>
            <Icon name="arrow" size={16} color={c.textMuted} />
          </Pressable>
        ))}
      </View>
      <Text v="small" color={c.textFaint} style={{ marginTop: space.md }}>
        Tokenized stocks are not available to US persons and in some other regions. Capital is at risk: an “ETF” here is a basket of tokens you lock, not a regulated fund.
      </Text>
    </View>
  );
}
