// Send USDC or a stock token to a @tag or any Solana address (a sheet).

import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { radius, space, type, useColors } from "@/theme";
import { useAssets, useConfig, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { short, usd } from "@/lib/format";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { useToast } from "@/components/Toast";
import { Button, Label, Row, Text } from "@/components/ui";

type Found = { state: "idle" } | { state: "looking" } | { state: "found"; wallet: string } | { state: "missing" } | { state: "address" };

function useRecipient(to: string): Found {
  const t = to.trim();
  const [lookup, setLookup] = useState<{ tag: string; wallet: string | null } | null>(null);
  useEffect(() => {
    if (!t.startsWith("@") || t.length < 4) return;
    const h = setTimeout(() => {
      api
        .resolveTag(t)
        .then((r) => setLookup({ tag: t, wallet: r.wallet }))
        .catch(() => setLookup({ tag: t, wallet: null }));
    }, 350);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return { state: "idle" };
  if (!t.startsWith("@")) return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t) ? { state: "address" } : { state: "idle" };
  if (t.length < 4) return { state: "idle" };
  if (lookup?.tag !== t) return { state: "looking" };
  return lookup.wallet ? { state: "found", wallet: lookup.wallet } : { state: "missing" };
}

export default function Send() {
  const c = useColors();
  const toast = useToast();
  const { address, signAndSend } = useWallet();
  const config = useConfig().data;
  const assets = useAssets().data ?? [];
  const v = useWalletView(address).data;
  const [to, setTo] = useState("");
  const [mint, setMint] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const found = useRecipient(to);

  const tokens = [
    ...(v && config ? [{ mint: config.stakeMint, ticker: "USDC", logo: null as string | null, balance: v.usdc.uiAmount }] : []),
    ...(v?.assets ?? []).filter((b) => b.uiAmount > 0).map((b) => {
      const a = assets.find((x) => x.mint === b.mint);
      return { mint: b.mint, ticker: a?.ticker ?? b.symbol, logo: a?.logo ?? null, balance: b.uiAmount };
    }),
  ];
  const token = tokens.find((t) => t.mint === (mint ?? config?.stakeMint)) ?? tokens[0];
  const n = Number(amount);
  const ok = !!token && n > 0 && n <= token.balance && (found.state === "found" || found.state === "address");
  const toLabel = to.trim().startsWith("@") ? to.trim() : short(to.trim());

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Text v="title">Send</Text>

      <View style={{ gap: space.sm }}>
        <Label>To</Label>
        <Row style={{ height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: found.state === "missing" ? c.down : c.border, backgroundColor: c.surface, paddingHorizontal: space.lg }}>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="@tag or address"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[type.body, { flex: 1, color: c.text, outlineWidth: 0 }]}
          />
          {found.state === "found" ? (
            <Text v="small" color={c.up}>
              ● found
            </Text>
          ) : found.state === "missing" ? (
            <Text v="small" color={c.down}>
              no one has this
            </Text>
          ) : found.state === "looking" ? (
            <Text v="small" color={c.textMuted}>
              looking…
            </Text>
          ) : null}
        </Row>
        <Text v="small" color={c.textFaint}>
          A @tag or any Solana address
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Label>Token</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {tokens.map((t) => {
            const on = t.mint === token?.mint;
            return (
              <Pressable
                key={t.mint}
                onPress={() => setMint(t.mint)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: on ? c.secondary : c.fill, borderWidth: 1, borderColor: on ? c.brand : "transparent" }}
              >
                <AssetLogo uri={t.logo} ticker={t.ticker} size={20} />
                <Text v="smallStrong" color={on ? c.onSecondary : c.text}>
                  {t.ticker}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xl, padding: space.xl, alignItems: "center", gap: 6 }}>
        <TextInput
          value={amount}
          onChangeText={(s) => setAmount(s.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          placeholderTextColor={c.textFaint}
          keyboardType="decimal-pad"
          style={[type.display, { color: c.text, textAlign: "center", minWidth: 120, outlineWidth: 0 }]}
        />
        {token ? (
          <Text v="small" color={c.textMuted}>
            {token.ticker} · available {token.ticker === "USDC" ? usd(token.balance) : token.balance.toFixed(4)}
          </Text>
        ) : (
          <Text v="small" color={c.textMuted}>
            Nothing to send yet
          </Text>
        )}
        {token ? <Button small kind="ghost" title="Max" onPress={() => setAmount(String(token.balance))} /> : null}
      </View>

      <Button
        title={ok ? `Send ${amount} ${token!.ticker} to ${toLabel}` : "Send"}
        disabled={!ok}
        loading={busy}
        onPress={async () => {
          if (!address || !token) return;
          setBusy(true);
          try {
            const plan = await api.planTransfer({ wallet: address, to: to.trim(), mint: token.mint, amount: n });
            await signAndSend(plan);
            success();
            toast(`Sent ${amount} ${token.ticker} to ${toLabel}`, "ok");
            router.back();
          } catch (e) {
            toast((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </ScrollView>
  );
}
