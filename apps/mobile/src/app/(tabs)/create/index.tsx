// Build an ETF in three steps: pick 3–10 tokens, set weights, size and name
// it. If the wallet doesn't hold enough of the basket, it can buy it here
// first (Jupiter on mainnet, the test desk on test clusters).

import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import type { AssetView } from "@indx/core";
import { radius, signColor, space, useColors } from "@/theme";
import { useAssets, useConfig, useRound, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { bpsToPct, pct, usd } from "@/lib/format";
import { tap } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { useTxAction } from "@/components/TxAction";
import { Button, Card, Chip, Empty, Num, Row, Screen, SectionTitle, Segmented, Skeleton, Text } from "@/components/ui";

type Step = "pick" | "weights" | "details";
type Filter = "all" | "stock" | "etf" | "crypto";
const STEP = 500; // weights move in 5% steps

function equalWeights(n: number): number[] {
  const base = Math.floor(10_000 / n / 100) * 100;
  const w = Array(n).fill(base);
  w[0] += 10_000 - base * n;
  return w;
}

export default function Create() {
  const c = useColors();
  const assets = useAssets();
  const round = useRound();
  const config = useConfig();
  const { address } = useWallet();
  const walletView = useWalletView(address);
  const { run, busy } = useTxAction();

  const [step, setStep] = useState<Step>("pick");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [weights, setWeights] = useState<number[]>([]);
  const [size, setSize] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [fee, setFee] = useState(100);

  const rules = config.data?.rules;
  const bySymbol = useMemo(() => new Map((assets.data ?? []).map((a) => [a.mint, a])), [assets.data]);
  const legs = picked.map((m) => bySymbol.get(m)).filter((a): a is AssetView => !!a);

  // Validation of weights.
  const total = weights.reduce((s, w) => s + w, 0);
  const cryptoBps = legs.reduce((s, a, i) => s + (a.kind === "crypto" ? weights[i] ?? 0 : 0), 0);
  const stockCount = legs.filter((a) => a.kind !== "crypto").length;
  const weightError =
    total !== 10_000
      ? `Weights add up to ${bpsToPct(total)}`
      : weights.some((w) => w > (rules?.maxWeightPct ?? 50) * 100)
        ? `No token above ${rules?.maxWeightPct ?? 50}%`
        : cryptoBps > (rules?.maxCryptoPct ?? 20) * 100
          ? `Crypto at most ${rules?.maxCryptoPct ?? 20}% in total`
          : weights.some((w) => w <= 0)
            ? "Every token needs a weight"
            : null;

  // How big a basket the wallet's holdings allow at these weights.
  const maxUsd = useMemo(() => {
    if (!walletView.data || !legs.length || weightError) return 0;
    const caps = legs.map((a, i) => {
      const bal = walletView.data!.assets.find((b) => b.mint === a.mint);
      const value = bal && a.rawPrice ? (Number(bal.raw) / 10 ** a.decimals) * a.rawPrice : 0;
      return value / (weights[i] / 10_000);
    });
    return Math.max(0, Math.min(...caps));
  }, [walletView.data, legs, weights, weightError]);
  const minUsd = rules?.minBasketUsd ?? 10;

  const togglePick = (mint: string) => {
    tap();
    setPicked((p) => (p.includes(mint) ? p.filter((x) => x !== mint) : p.length >= (rules?.maxTokens ?? 10) ? p : [...p, mint]));
  };

  const goWeights = () => {
    setWeights(equalWeights(picked.length));
    setStep("weights");
  };

  const nudge = (i: number, d: number) => {
    tap();
    setWeights((w) => w.map((x, j) => (j === i ? Math.max(0, Math.min(10_000, x + d)) : x)));
  };

  if (round.data && round.data.phase !== "open") {
    return (
      <Screen>
        <Empty title="Entries are closed" body={`Round ${round.data.id} is under way. The next round opens when it's settled.`} action={<Button title="Follow the round" small onPress={() => router.push("/")} />} />
      </Screen>
    );
  }

  // --- step 1: pick ----------------------------------------------------------
  if (step === "pick") {
    const list = (assets.data ?? []).filter((a) => (filter === "all" || a.kind === filter || (filter === "etf" && a.kind === "commodity")) && `${a.symbol} ${a.name}`.toLowerCase().includes(query.toLowerCase()));
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Screen onRefresh={() => assets.refetch()} contentStyle={{ paddingBottom: 240 }}>
          <Text color={c.textMuted}>Pick {rules?.minTokens ?? 3}–{rules?.maxTokens ?? 10} tokens. At least {rules?.minTokens ?? 3} must be stocks or funds; crypto can be up to {rules?.maxCryptoPct ?? 20}%.</Text>
          <TextInput
            placeholder="Search stocks"
            placeholderTextColor={c.textMuted}
            value={query}
            onChangeText={setQuery}
            style={{ marginTop: space.md, backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, color: c.text, fontSize: 16 }}
          />
          <View style={{ marginTop: space.md }}>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "stock", label: "Stocks" }, { value: "etf", label: "Funds" }, { value: "crypto", label: "Crypto" }]} />
          </View>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {assets.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={60} />) : null}
            {list.map((a) => {
              const on = picked.includes(a.mint);
              return (
                <Pressable key={a.mint} onPress={() => togglePick(a.mint)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: on ? c.surfaceAlt : c.surface, borderWidth: 1.5, borderColor: on ? c.accent : "transparent" }}>
                    <AssetLogo uri={a.logo} ticker={a.ticker} />
                    <View style={{ flex: 1 }}>
                      <Text v="bodyStrong">{a.ticker}</Text>
                      <Text v="small" color={c.textMuted} numberOfLines={1}>
                        {a.name}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Num>{usd(a.price)}</Num>
                      <Text v="small" color={signColor(c, a.change24hPct)}>
                        {pct(a.change24hPct)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Screen>
        <BottomBar>
          <Button title={picked.length < (rules?.minTokens ?? 3) ? `Pick ${(rules?.minTokens ?? 3) - picked.length} more` : `Next: weights (${picked.length})`} disabled={picked.length < (rules?.minTokens ?? 3) || stockCount < (rules?.minTokens ?? 3)} onPress={goWeights} />
        </BottomBar>
      </View>
    );
  }

  // --- step 2: weights -------------------------------------------------------
  if (step === "weights") {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Screen contentStyle={{ paddingBottom: 240 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Button title="‹ Tokens" kind="ghost" small onPress={() => setStep("pick")} />
            <Button title="Equal weights" kind="secondary" small onPress={() => setWeights(equalWeights(picked.length))} />
          </Row>
          <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", marginVertical: space.lg, backgroundColor: c.surfaceAlt }}>
            {legs.map((a, i) => (
              <View key={a.mint} style={{ flex: weights[i] || 0.0001, backgroundColor: i % 2 ? c.textMuted : c.accent, opacity: 0.35 + 0.65 * (1 - i / legs.length) }} />
            ))}
          </View>
          <View style={{ gap: space.sm }}>
            {legs.map((a, i) => (
              <Card key={a.mint} style={{ padding: space.md }}>
                <Row gap={space.md}>
                  <AssetLogo uri={a.logo} ticker={a.ticker} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text v="bodyStrong">{a.ticker}</Text>
                    <Text v="small" color={c.textMuted}>
                      {a.kind === "crypto" ? "crypto" : a.name}
                    </Text>
                  </View>
                  <Button title="−" kind="secondary" small onPress={() => nudge(i, -STEP)} />
                  <Num v="heading" style={{ width: 64, textAlign: "center" }}>
                    {bpsToPct(weights[i] ?? 0)}
                  </Num>
                  <Button title="+" kind="secondary" small onPress={() => nudge(i, STEP)} />
                </Row>
              </Card>
            ))}
          </View>
          <Text v="smallStrong" color={weightError ? c.down : c.up} style={{ marginTop: space.md, textAlign: "center" }}>
            {weightError ?? "Weights look good"}
          </Text>
        </Screen>
        <BottomBar>
          <Button title="Next: size and name" disabled={!!weightError} onPress={() => setStep("details")} />
        </BottomBar>
      </View>
    );
  }

  // --- step 3: size, name, fee ---------------------------------------------
  const sizes = [10, 25, 50, 100].filter((s) => s <= maxUsd);
  const chosen = size ?? (maxUsd >= minUsd ? Math.min(maxUsd, 25) : null);
  const needBuy = !address || maxUsd < minUsd;
  const legsReq = legs.map((a, i) => ({ mint: a.mint, weightBps: weights[i] }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen onRefresh={() => walletView.refetch()} contentStyle={{ paddingBottom: 240 }}>
        <Button title="‹ Weights" kind="ghost" small onPress={() => setStep("weights")} style={{ alignSelf: "flex-start" }} />
        <SectionTitle title="Your basket" />
        <Card style={{ gap: space.sm }}>
          {legs.map((a, i) => (
            <Row key={a.mint} style={{ justifyContent: "space-between" }}>
              <Row>
                <AssetLogo uri={a.logo} ticker={a.ticker} size={22} />
                <Text>{a.ticker}</Text>
              </Row>
              <Num>{bpsToPct(weights[i])}</Num>
            </Row>
          ))}
        </Card>

        <SectionTitle title="Size" />
        {!address ? (
          <Card style={{ gap: space.md }}>
            <Text color={c.textMuted}>Connect a wallet to see what you can lock.</Text>
            <Button title="Connect a wallet" onPress={() => router.push("/connect")} />
          </Card>
        ) : needBuy ? (
          <Card style={{ gap: space.md }}>
            <Text>
              You hold {usd(maxUsd)} of this basket at these weights. You need at least {usd(minUsd)} to enter.
            </Text>
            <Row style={{ flexWrap: "wrap" }}>
              {[15, 30, 60].map((s) => (
                <Button key={s} small kind="secondary" title={`Buy ${usd(s, 0)}`} loading={busy} onPress={() => run((w) => api.planBuy({ wallet: w, legs: legsReq, usd: s }), `Bought ${usd(s, 0)} of your basket`)} />
              ))}
            </Row>
            <Text v="small" color={c.textMuted}>
              {config.data?.cluster === "mainnet" ? "Swaps USDC for each token through Jupiter." : "Test money: bought at live prices from the test desk."}
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <Row style={{ flexWrap: "wrap" }}>
              {sizes.map((s) => (
                <Chip key={s} label={usd(s, 0)} selected={chosen === s} onPress={() => setSize(s)} />
              ))}
              <Chip label={`Max ${usd(maxUsd, 0)}`} selected={chosen === maxUsd} onPress={() => setSize(maxUsd)} />
            </Row>
            <Text v="small" color={c.textMuted}>
              The locked stocks are the ETF: they come back to you after the round, whatever happens. Your ${round.data?.stakeUsd ?? 5} ticket is what’s at stake.
            </Text>
          </Card>
        )}

        <SectionTitle title="Name" />
        <TextInput
          placeholder="e.g. Chip Stack"
          placeholderTextColor={c.textMuted}
          value={name}
          onChangeText={(t) => setName(t.slice(0, 32))}
          maxLength={32}
          style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, color: c.text, fontSize: 16 }}
        />
        <SectionTitle title="Your fee when people buy it" />
        <Row style={{ flexWrap: "wrap" }}>
          {[0, 50, 100, 150, 200].map((f) => (
            <Chip key={f} label={bpsToPct(f)} selected={fee === f} onPress={() => setFee(f)} />
          ))}
        </Row>
        <Text v="small" color={c.textMuted} style={{ marginTop: space.sm }}>
          You also earn {config.data?.rules.creatorFeePct ?? 10}% of your backers’ winnings.
        </Text>
      </Screen>
      <BottomBar>
        <Button
          title={`Lock basket & enter · ${usd(round.data?.stakeUsd ?? 5, 0)} ticket`}
          disabled={!address || needBuy || !name.trim() || chosen === null}
          loading={busy}
          onPress={() =>
            run(
              (w) => api.planCreate({ wallet: w, legs: legsReq, usd: chosen ?? undefined, name: name.trim(), buyFeeBps: fee }),
              "You're in! Good luck against MEDIAN.",
              (plan) => {
                setStep("pick");
                setPicked([]);
                setName("");
                router.push(`/etf/${plan.meta?.roundId}/${plan.meta?.teamKey}`);
              },
            )
          }
        />
      </BottomBar>
    </View>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: space.xxl + 56, backgroundColor: c.bg, borderTopWidth: 0.5, borderColor: c.border }}>{children}</View>;
}
