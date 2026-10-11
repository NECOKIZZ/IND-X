// Buy an ETF's basket (a sheet): pick an amount, sign the swaps.

import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { space, useColors } from "@/theme";
import { api } from "@/lib/api";
import { usd } from "@/lib/format";
import { useConfig } from "@/lib/queries";
import { useTxAction } from "@/components/TxAction";
import { Button, Chip, Label, Num, Row, Text } from "@/components/ui";

export default function Amount() {
  const c = useColors();
  const { round, key, name } = useLocalSearchParams<{ round: string; key: string; name: string }>();
  const config = useConfig();
  const [amount, setAmount] = useState(25);
  const { run, busy } = useTxAction();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.lg }}>
      <View>
        <Label>Buy {name}</Label>
        <Num v="display">{usd(amount, 0)}</Num>
      </View>
      <Text color={c.textMuted}>
        The same stocks at the same weights, in your wallet. {config.data?.cluster === "mainnet" ? "Swapped through Jupiter." : "Testnet: bought with test USDC at live prices."}
      </Text>
      <Row style={{ flexWrap: "wrap" }}>
        {[10, 25, 50, 100, 250].map((a) => (
          <Chip key={a} label={usd(a, 0)} selected={amount === a} onPress={() => setAmount(a)} />
        ))}
      </Row>
      <Button title={`Buy ${usd(amount, 0)}`} loading={busy} onPress={() => run((w) => api.planBuy({ wallet: w, roundId: round, etfKey: key, usd: amount }), `Bought ${usd(amount, 0)} of ${name}`, () => router.back())} />
    </View>
  );
}
