import { View } from "react-native";
import { brand, space, useColors } from "@/theme";
import { useConfig } from "@/lib/queries";
import { BackBar } from "@/components/Header";
import { Card, Label, Num, Row, Screen, SectionTitle, Text } from "@/components/ui";

export default function Rules() {
  const c = useColors();
  const r = useConfig().data?.rules;
  const items: [string, string][] = [
    ["Build", `Pick ${r?.minTokens ?? 3}–${r?.maxTokens ?? 10} tokenized stocks (crypto up to ${r?.maxCryptoPct ?? 20}%, none above ${r?.maxWeightPct ?? 50}%), lock at least $${r?.minBasketUsd ?? 10} of them and a $5 ticket. The locked basket is your ETF: it scores the real return of exactly what you locked, dividends included.`],
    ["Back", "Put a ticket on someone else's ETF. Same basket, same result. Creators earn 10% of what their backers win."],
    ["The week", "Entries close Monday at the US market open; the round ends Friday at the close. Your stocks come back to you after, whatever happens."],
    [brand.Line, `${brand.Line} is the round's middle return. ETFs above it win the tickets of those below, split by tickets × accuracy: the closer to the top, the bigger the share. Exactly on ${brand.line} is a draw and your ticket comes back.`],
    ["Pari-mutuel", `Winners are paid only from losing tickets, minus a ${r?.takePct ?? 10}% take (half to the platform, half to a season pot that tops up thin rounds). ${brand.name} never plays against you.`],
    ["Trust", "Payouts are computed with open-source code, every input is published and its hash goes on-chain. The program checks the money adds up, caps every payout, always returns baskets, and anyone can void a round that isn't settled within 3 days."],
  ];
  return (
    <Screen bottom={60}>
      <BackBar />
      <Text v="hero" style={{ marginBottom: space.xl }}>
        How it works
      </Text>
      <View style={{ gap: space.sm }}>
        {items.map(([t, b], i) => (
          <Card key={t} style={{ gap: space.sm }}>
            <Row>
              <Num v="small" color={c.textFaint}>
                {String(i + 1).padStart(2, "0")}
              </Num>
              <Label color={c.text}>{t}</Label>
            </Row>
            <Text color={c.textMuted}>{b}</Text>
          </Card>
        ))}
      </View>
      <SectionTitle title="Small print" />
      <Text v="small" color={c.textFaint}>
        An “ETF” here is an on-chain basket of tokenized stocks, not a regulated fund. Tokenized stocks are not available in restricted regions, including the US. Capital is at risk.
      </Text>
    </Screen>
  );
}
