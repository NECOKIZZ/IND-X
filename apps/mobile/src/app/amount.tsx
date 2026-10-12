// Buy an ETF's basket (a sheet): pick or type an amount of USDC, see what it
// buys, sign once. The stocks land in your wallet; nothing is locked.

import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { radius, space, type, useColors } from "@/theme";
import { api } from "@/lib/api";
import { bpsToPct, usd } from "@/lib/format";
import { useConfig, useEtf, useWalletView } from "@/lib/queries";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { useTxAction } from "@/components/TxAction";
import { useFaucet } from "@/components/useFaucet";
import { Button, Card, Chip, Divider, Label, Row, Text } from "@/components/ui";

export default function Amount() {
  const c = useColors();
  const { round, key, name } = useLocalSearchParams<{ round: string; key: string; name: string }>();
  const config = useConfig();
  const etf = useEtf(round, key).data;
  const { address } = useWallet();
  const usdc = useWalletView(address).data?.usdc.uiAmount ?? 0;
  const faucet = useFaucet();
  const [text, setText] = useState("25");
  const amount = Math.max(0, Math.floor(Number(text) || 0));
  const { run, busy } = useTxAction();
  const own = !!etf && etf.captain === address;
  const feePct = own ? 0 : (etf?.buyFeeBps ?? 0) / 100;
  const fee = (amount * feePct) / 100;
  const short = amount > usdc + 1e-6;
  const ok = amount >= 1 && !short;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <View>
        <Label>Buy {name}</Label>
        <Text color={c.textMuted} style={{ marginTop: 4 }}>
          The same stocks at the same weights, straight into your wallet. {config.data?.cluster === "mainnet" ? "Swapped through Jupiter." : "Testnet: swapped from test USDC at live prices."}
        </Text>
      </View>

      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xl, padding: space.lg, alignItems: "center", gap: space.sm }}>
        <TextInput
          value={text ? `$${text}` : ""}
          onChangeText={(s) => setText(s.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="$0"
          placeholderTextColor={c.textFaint}
          keyboardType="number-pad"
          accessibilityLabel="Amount in dollars"
          style={[type.display, { color: short ? c.down : c.text, minWidth: 120, textAlign: "center", outlineWidth: 0 }]}
        />
        <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
          {[10, 25, 50, 100].map((a) => (
            <Chip key={a} label={usd(a, 0)} selected={amount === a} onPress={() => setText(String(a))} />
          ))}
        </Row>
        <Text v="small" color={short ? c.down : c.textMuted}>
          {short ? `Not enough USDC: you have ${usd(usdc)}` : `From your USDC · ${usd(usdc)} available`}
        </Text>
        {short && faucet.available ? <Button small kind="secondary" title="Get test funds" loading={faucet.busy} onPress={faucet.drip} /> : null}
      </View>

      {etf ? (
        <Card style={{ gap: space.md }}>
          {etf.legs.map((l) => {
            const spend = ((amount - fee) * l.weightBps) / 10_000;
            return (
              <Row key={l.mint} gap={space.sm}>
                <AssetLogo uri={l.logo} ticker={l.ticker} size={24} />
                <Text v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {l.ticker} <Text v="small" color={c.textMuted}>{bpsToPct(l.weightBps)}</Text>
                </Text>
                <Text v="small" color={c.textMuted}>
                  {l.price ? `≈ ${(spend / l.price).toFixed(spend / l.price < 1 ? 4 : 2)} · ` : ""}
                  <Text v="smallStrong">{usd(spend)}</Text>
                </Text>
              </Row>
            );
          })}
          {fee > 0 ? (
            <>
              <Divider />
              <Row style={{ justifyContent: "space-between" }}>
                <Text color={c.textMuted}>Creator fee ({feePct}%)</Text>
                <Text>{usd(fee)}</Text>
              </Row>
            </>
          ) : null}
        </Card>
      ) : null}

      <Button
        title={amount >= 1 ? `Buy ${usd(amount, 0)}` : "Enter an amount"}
        disabled={!ok}
        loading={busy}
        onPress={() => run((w) => api.planBuy({ wallet: w, roundId: round, etfKey: key, usd: amount }), `Bought ${usd(amount, 0)} of ${name}`, () => router.back())}
      />
    </ScrollView>
  );
}
