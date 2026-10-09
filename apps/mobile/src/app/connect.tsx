// Wallet chooser (a sheet).

import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { brand, radius, space, useColors } from "@/theme";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
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
      <Text v="title">Connect a wallet</Text>
      <Text color={c.textMuted}>{brand.pitch}</Text>
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
          style={({ pressed }) => ({ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, opacity: busy && busy !== o.kind ? 0.5 : pressed ? 0.85 : 1 })}
        >
          <Text v="bodyStrong">{busy === o.kind ? "Connecting…" : o.label}</Text>
          <Text v="small" color={c.textMuted}>
            {o.detail}
          </Text>
        </Pressable>
      ))}
      <Text v="small" color={c.textMuted} style={{ marginTop: space.md }}>
        Tokenized stocks are not available to US persons and some other regions. Capital is at risk: an “ETF” here is a basket of tokens you lock, not a regulated fund.
      </Text>
    </View>
  );
}
