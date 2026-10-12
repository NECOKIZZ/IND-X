import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { brand, space, useColors } from "@/theme";
import { useConfig } from "@/lib/queries";
import { BackBar } from "@/components/Header";
import { Card, Label, Num, Row, Screen, SectionTitle, Text } from "@/components/ui";

type Section = "how" | "rules" | "faq";

const HOW: [string, string][] = [
  ["Build", "Pick 3–10 tokenized stocks and funds (SKR and other crypto up to 20%), set the weights, and type how much USDC to put in. One approval buys exactly that basket and enters it with a $5 ticket."],
  ["Or back one", "Like someone else's ETF? Back it with a $5 ticket. Same basket, same result; its creator earns 10% of what you win."],
  ["Entries close Monday", "Prices are recorded at the US market open on Monday. From then on it's your picks against everyone else's."],
  ["Beat the median", "Each ETF's return is compared with the round's median return. Above the line wins, below the line pays. Whatever the market does, about half the field wins."],
  ["Paid on Friday", "The round settles on-chain at Friday's close. Winnings and your whole basket arrive in your wallet automatically, and the next round opens for entries."],
];

const FAQ: [string, string][] = [
  ["Can I lose my stocks?", "No. Your basket is escrowed and comes back after the round with whatever it gained or lost, exactly as if you'd held it. Only the $5 ticket is at stake."],
  ["Why can't I stake right now?", "Rounds run one at a time. Once entries close on Monday, the next round opens only after the live one settles on Friday."],
  ["How much can I win?", "Winners split the losing tickets, weighted by how close they finished to the best ETF. In a 20-ETF round the top ETF turns $5 into about $23; the last winner gets a little over $5."],
  ["What is SKR doing here?", "SKR, Solana Mobile's Seeker token, is one of the tokens you can put in your ETF, as part of the crypto slice (up to 20%). It's priced live from Jupiter."],
  ["Is this real money?", "Not yet. IndX runs on Solana devnet with test USDC and test stocks priced at live market prices. Tap Test funds to get some."],
  ["Who holds my funds?", "You do. Your wallet signs every transaction; stakes and baskets sit in the IndX program's vaults, never with us. Sign in with Seed Vault, a wallet app, or Google/email (an embedded wallet by Privy)."],
  ["Can a round be checked?", "Yes. Every round's prices and entries are published, the settlement inputs hash is stored on-chain, and each round page links its transactions on Solscan."],
];

export default function Rules() {
  const c = useColors();
  const r = useConfig().data?.rules;
  const section = (useLocalSearchParams<{ s?: Section }>().s ?? "rules") as Section;
  if (section === "how" || section === "faq") {
    const list = section === "how" ? HOW : FAQ;
    return (
      <Screen bottom={60}>
        <BackBar />
        <Text v="hero" style={{ marginBottom: space.xl }}>
          {section === "how" ? `How ${brand.name} works` : "FAQ"}
        </Text>
        <View style={{ gap: space.sm }}>
          {list.map(([t, b], i) => (
            <Card key={t} style={{ gap: space.sm }}>
              <Row>
                {section === "how" ? (
                  <Num v="small" color={c.textFaint}>
                    {String(i + 1).padStart(2, "0")}
                  </Num>
                ) : null}
                <Label color={c.text}>{t}</Label>
              </Row>
              <Text color={c.textMuted}>{b}</Text>
            </Card>
          ))}
        </View>
      </Screen>
    );
  }
  const items: [string, string][] = [
    ["Build", `Pick ${r?.minTokens ?? 3}–${r?.maxTokens ?? 10} tokenized stocks (crypto up to ${r?.maxCryptoPct ?? 20}%, none above ${r?.maxWeightPct ?? 50}%), lock at least $${r?.minBasketUsd ?? 10} of them and a $5 ticket. The locked basket is your ETF: it scores the real return of exactly what you locked, dividends included.`],
    ["Back", "Put a ticket on someone else's ETF. Same basket, same result. Creators earn 10% of what their backers win."],
    ["The week", "Entries close Monday at the US market open; the round ends Friday at the close. Your stocks come back to you after, whatever happens."],
    [brand.Line, `The median is the round's middle return. Only ETFs strictly above it win, taking the tickets of everyone else, split by tickets × accuracy: the closer to the top, the bigger the share. There are no draws: landing exactly on ${brand.line} loses too. If nobody beats it, the round is void and every ticket comes back.`],
    ["Pari-mutuel", `Winners are paid only from losing tickets, minus a ${r?.takePct ?? 10}% take (half to the platform, half to a season pot that tops up thin rounds). ${brand.name} never plays against you.`],
    ["Trust", "Payouts are computed with open-source code, every input is published and its hash goes on-chain. The program checks the money adds up, caps every payout, always returns baskets, and anyone can void a round that isn't settled within 3 days."],
  ];
  return (
    <Screen bottom={60}>
      <BackBar />
      <Text v="hero" style={{ marginBottom: space.xl }}>
        Rules & payouts
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
