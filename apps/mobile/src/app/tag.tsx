// Claim a @tag (a sheet). The wallet signs a short proof that it owns the
// tag; nothing is sent on-chain and it costs nothing.

import { useState } from "react";
import { TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { radius, space, type, useColors } from "@/theme";
import { api } from "@/lib/api";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { useToast } from "@/components/Toast";
import { Button, Row, Text } from "@/components/ui";

const VALID = /^[a-z0-9_]{3,15}$/;

export default function ClaimTag() {
  const c = useColors();
  const toast = useToast();
  const qc = useQueryClient();
  const { address, signOnly } = useWallet();
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const t = tag.replace(/^@/, "").toLowerCase();
  const ok = VALID.test(t);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.lg }}>
      <Text v="title">Claim your @tag</Text>
      <Text color={c.textMuted}>Friends can send you money with your tag instead of a long address.</Text>
      <Row style={{ height: 56, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: space.lg }}>
        <Text v="heading" color={c.textMuted}>
          @
        </Text>
        <TextInput
          value={t}
          onChangeText={(s) => setTag(s.replace(/[^a-zA-Z0-9_@]/g, "").slice(0, 16))}
          placeholder="yourname"
          placeholderTextColor={c.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={[type.heading, { flex: 1, color: c.text, outlineWidth: 0 }]}
        />
      </Row>
      <Text v="small" color={c.textFaint}>
        3 to 15 letters, numbers or _
      </Text>
      <Button
        title={ok ? `Claim @${t}` : "Claim"}
        disabled={!ok || !address}
        loading={busy}
        onPress={async () => {
          if (!address) return;
          setBusy(true);
          try {
            const ch = await api.tagChallenge(address, t);
            const [signed] = await signOnly([ch.transaction]);
            await api.tagClaim(address, t, signed);
            await qc.invalidateQueries({ queryKey: ["wallet"] });
            success();
            toast(`You're @${t}`, "ok");
            router.back();
          } catch (e) {
            toast((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}
