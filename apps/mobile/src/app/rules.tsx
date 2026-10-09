import { space, useColors } from "@/theme";
import { useConfig } from "@/lib/queries";
import { Card, Screen, SectionTitle, Text } from "@/components/ui";

export default function Rules() {
  const c = useColors();
  const r = useConfig().data?.rules;
  const items: [string, string][] = [
    ["Build", `Pick ${r?.minTokens ?? 3}–${r?.maxTokens ?? 10} tokenized stocks (crypto up to ${r?.maxCryptoPct ?? 20}%, none above ${r?.maxWeightPct ?? 50}%), lock at least $${r?.minBasketUsd ?? 10} of them and a ticket. The locked basket is your ETF: its score is the real return of exactly what you locked, dividends included.`],
    ["Back", "Don't want to build? Put a ticket on someone else's ETF. Same basket, same result. The creator earns 10% of their backers' winnings."],
    ["The week", "Entries close Monday at the US market open. The round ends Friday at the close. Your stocks are locked in between and come back to you after, whatever happens."],
    ["MEDIAN", "MEDIAN is a ghost team at the middle return of the round. ETFs above MEDIAN win the tickets of those below, split by tickets × accuracy (the closer to the top, the bigger the share). Exactly on MEDIAN is a draw: your ticket comes back."],
    ["The take", `${r?.takePct ?? 10}% of the losing tickets: half to the platform, half to a season pot that tops up thin pots. The platform never plays against you.`],
    ["Trust", "A keeper computes the payouts with open-source code and publishes every input; their hash goes on-chain. The program checks the money adds up, caps every payout, always returns baskets, and lets anyone void a round the keeper doesn't settle within 3 days."],
  ];
  return (
    <Screen>
      {items.map(([t, b]) => (
        <Card key={t} style={{ marginBottom: space.md, gap: space.sm }}>
          <Text v="heading">{t}</Text>
          <Text color={c.textMuted}>{b}</Text>
        </Card>
      ))}
      <SectionTitle title="Small print" />
      <Text v="small" color={c.textMuted}>
        An “ETF” here is an on-chain basket of tokenized stocks, not a regulated fund. Tokenized stocks are not available in restricted regions, including the US. Capital is at risk.
      </Text>
    </Screen>
  );
}
