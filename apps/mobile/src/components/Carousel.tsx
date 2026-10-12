// The League's top cards: the guide first, then the round's hottest ETFs as
// collectible cards. Swipeable, and plays by itself every few seconds.

import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import type { RoundView } from "@indx/core";
import { brand, radius, space, useColors } from "@/theme";
import { pct } from "@/lib/format";
import { EtfCard } from "./EtfCard";
import { Glow } from "./Glow";
import { Button, Label, Row, Text } from "./ui";

const HEIGHT = 186;
const PEEK = 28;
const EVERY_MS = 6000;

export function Carousel({ round }: { round: RoundView | undefined }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const pad = space.lg + 4;
  const cardW = Math.min(width, 520) - pad * 2 - PEEK;
  const step = cardW + space.md;
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const touched = useRef(0);

  const hot = [...(round?.etfs ?? [])].sort((a, b) => b.tickets - a.tickets || (b.retPct ?? -1e9) - (a.retPct ?? -1e9)).slice(0, 2);
  const cards = hot.length ? 2 : 1;

  useEffect(() => {
    if (cards < 2) return;
    const t = setInterval(() => {
      if (Date.now() - touched.current < EVERY_MS) return;
      setIndex((i) => {
        const n = (i + 1) % cards;
        ref.current?.scrollTo({ x: n * step, animated: true });
        return n;
      });
    }, EVERY_MS);
    return () => clearInterval(t);
  }, [cards, step]);

  // The hot card's two mini cards size to what's left beside the title.
  const textW = Math.max(112, Math.round(cardW * 0.42));
  // Narrow phones show one bigger card instead of two small ones.
  const single = cardW - textW < 150;
  const miniW = single ? Math.max(84, Math.min(112, cardW - textW - 16)) : Math.max(70, Math.min(112, Math.round((cardW - textW) * 0.58)));
  const miniH = Math.round(miniW * 1.3);
  const shell = { width: cardW, minHeight: HEIGHT, borderRadius: radius.xl, overflow: "hidden" as const, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderCurve: "continuous" as const };

  return (
    <View style={{ marginHorizontal: -pad }}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: pad, gap: space.md, alignItems: "stretch" }}
        onScrollBeginDrag={() => (touched.current = Date.now())}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / step))}
      >
        {/* 1. The guide, shown first to every new player. */}
        <View style={[shell, { padding: space.lg + 2, justifyContent: "space-between", gap: space.lg }]}>
          <Glow variant={0} />
          <View style={{ gap: 6 }}>
            <Text v="heading" style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.4 }}>
              {brand.tagline}
            </Text>
            <Text v="small" color={c.textMuted} numberOfLines={3}>
              {brand.pitch}
            </Text>
          </View>
          <Row style={{ flexWrap: "wrap" }}>
            <Button small title="Get started" onPress={() => router.push("/create")} />
            <Button small title="Learn more" kind="ghost" icon="arrow" onPress={() => router.push("/rules")} />
          </Row>
        </View>

        {/* 2. The round's hottest ETFs, as collectible cards. */}
        {hot.length ? (
          <View style={[shell, { flexDirection: "row" }]}>
            <Glow variant={2} />
            <View style={{ width: textW, padding: space.lg, gap: 6 }}>
              <Label>Hot this week</Label>
              <Text v="heading" style={{ fontSize: 18, lineHeight: 22 }}>
                The ETFs everyone is backing
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              {(single ? hot.slice(0, 1) : hot).map((e, i) => (
                <Pressable
                  key={e.key}
                  onPress={() => round && router.push(`/etf/${round.id}/${e.key}`)}
                  style={{ position: "absolute", left: i ? Math.round(miniW * 0.55) : 0, top: i ? 10 : 22, transform: [{ rotate: i ? "6deg" : "-9deg" }] }}
                >
                  <EtfCard name={e.name} legs={e.legs} retPct={pct(e.retPct)} theme={i} width={miniW} height={miniH} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      {cards > 1 ? (
        <Row gap={5} style={{ justifyContent: "center", marginTop: space.sm }}>
          {Array.from({ length: cards }, (_, i) => (
            <View key={i} style={{ width: i === index ? 16 : 4, height: 4, borderRadius: 2, backgroundColor: i === index ? c.text : c.textFaint }} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}
