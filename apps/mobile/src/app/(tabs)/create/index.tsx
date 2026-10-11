// Build an ETF in three steps: pick 3–10 tokens, set weights, size and name
// it. If the wallet doesn't hold enough of the basket, it can buy it here
// first (Jupiter on mainnet, the test desk on testnet).

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AssetView } from "@indx/core";
import { brand, palette, radius, signColor, space, TAB_BAR_SPACE, type, useColors } from "@/theme";
import { useAssets, useConfig, useRound, useWalletView } from "@/lib/queries";
import { api, type BasketQuote } from "@/lib/api";
import { bpsToPct, pct, usd } from "@/lib/format";
import { tap } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { PageTitle, TopBar } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { useTxAction } from "@/components/TxAction";
import { useToast } from "@/components/Toast";
import { Button, Card, Chip, Divider, Empty, IconButton, Label, Num, Row, Screen, SectionTitle, Segmented, Skeleton, Text } from "@/components/ui";

type Step = "pick" | "weights" | "details";
type Filter = "all" | "stock" | "etf" | "crypto";
const STEP_BPS = 500; // weights move in 5% steps
const STEPS: Step[] = ["pick", "weights", "details"];

function equalWeights(n: number): number[] {
  const base = Math.floor(10_000 / n / 100) * 100;
  const w = Array(n).fill(base);
  w[0] += 10_000 - base * n;
  return w;
}

/** Bar colors for basket legs: sage → gunmetal. */
const LEG_COLORS = [palette.sageDeep, palette.gunmetal, palette.sage, palette.gunmetalSoft, "#7FA38A", "#B7C9BD", "#56655F", "#DCE7DC", "#2F3B3D", "#A6BFA6"];

export default function Create() {
  const c = useColors();
  const assets = useAssets();
  const round = useRound();
  const config = useConfig();
  const { address } = useWallet();
  const walletView = useWalletView(address);
  const { run, busy } = useTxAction();
  const toast = useToast();

  const [step, setStep] = useState<Step>("pick");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [weights, setWeights] = useState<number[]>([]);
  const [size, setSize] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [fee, setFee] = useState(100);
  // The exact basket the transaction will lock, fetched when the user taps Review.
  const [review, setReview] = useState<BasketQuote | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const rules = config.data?.rules;
  const minTokens = rules?.minTokens ?? 3;
  const byMint = useMemo(() => new Map((assets.data ?? []).map((a) => [a.mint, a])), [assets.data]);
  const legs = picked.map((m) => byMint.get(m)).filter((a): a is AssetView => !!a);

  const total = weights.reduce((s, w) => s + w, 0);
  const cryptoBps = legs.reduce((s, a, i) => s + (a.kind === "crypto" ? (weights[i] ?? 0) : 0), 0);
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

  // What the wallet can lock, and what a given size locks: always from the
  // server's quote, the same function that builds the transaction.
  const legsReq = legs.map((a, i) => ({ mint: a.mint, weightBps: weights[i] }));
  const quoteKey = JSON.stringify(legsReq);
  const maxQuote = useQuery({
    queryKey: ["quote", address, quoteKey, "max"],
    queryFn: () => api.quote({ wallet: address!, legs: legsReq }),
    enabled: step === "details" && !!address && !weightError && legs.length >= minTokens,
    refetchInterval: 20_000,
  });
  const maxUsd = maxQuote.data?.maxUsd ?? 0;
  const minUsd = rules?.minBasketUsd ?? 10;

  const togglePick = (mint: string) => {
    tap();
    setPicked((p) => (p.includes(mint) ? p.filter((x) => x !== mint) : p.length >= (rules?.maxTokens ?? 10) ? p : [...p, mint]));
  };
  const nudge = (i: number, d: number) => {
    tap();
    setWeights((w) => w.map((x, j) => (j === i ? Math.max(0, Math.min(10_000, x + d)) : x)));
  };

  if (round.data && round.data.phase !== "open") {
    return (
      <Screen>
        <TopBar />
        <PageTitle title="Build" />
        <Empty title="Entries are closed" body={`Round ${round.data.id} is under way. The next round opens as soon as it's settled.`} action={<Button title="Follow the round" small onPress={() => router.push("/")} />} />
      </Screen>
    );
  }

  const header = (
    <>
      <TopBar />
      <PageTitle title={step === "pick" ? "Pick your stocks" : step === "weights" ? "Set the weights" : "Size and name"} />
      <Steps step={step} />
    </>
  );

  // --- 1. pick ------------------------------------------------------------
  if (step === "pick") {
    const list = (assets.data ?? []).filter(
      (a) => (filter === "all" || a.kind === filter || (filter === "etf" && a.kind === "commodity")) && `${a.symbol} ${a.name}`.toLowerCase().includes(query.toLowerCase()),
    );
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Screen onRefresh={() => assets.refetch()} bottom={TAB_BAR_SPACE + 90}>
          {header}
          <Text color={c.textMuted}>
            {minTokens} to {rules?.maxTokens ?? 10} tokens. At least {minTokens} stocks or funds; crypto up to {rules?.maxCryptoPct ?? 20}%.
          </Text>
          <Row style={{ marginTop: space.lg, backgroundColor: c.fill, borderRadius: radius.pill, paddingHorizontal: space.lg }}>
            <Icon name="search" size={18} color={c.textMuted} />
            <TextInput placeholder="Search" placeholderTextColor={c.textFaint} value={query} onChangeText={setQuery} style={[type.body, { flex: 1, color: c.text, paddingVertical: 12 }]} />
          </Row>
          <View style={{ marginTop: space.md }}>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "stock", label: "Stocks" }, { value: "etf", label: "Funds" }, { value: "crypto", label: "Crypto" }]} />
          </View>
          <Card style={{ marginTop: space.lg, paddingVertical: space.xs, paddingHorizontal: space.md }}>
            {assets.isLoading ? <Skeleton height={240} /> : null}
            {list.map((a, i) => {
              const on = picked.includes(a.mint);
              return (
                <View key={a.mint}>
                  {i ? <Divider style={{ marginLeft: 52 }} /> : null}
                  <Pressable onPress={() => togglePick(a.mint)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.7 : 1 })}>
                    <AssetLogo uri={a.logo} ticker={a.ticker} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text v="bodyStrong">{a.ticker}</Text>
                      <Text v="small" color={c.textMuted} numberOfLines={1}>
                        {a.name}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", marginRight: space.sm }}>
                      <Num v="bodyStrong">{usd(a.price)}</Num>
                      <Text v="small" color={signColor(c, a.change24hPct)}>
                        {pct(a.change24hPct)}
                      </Text>
                    </View>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 0 : 1.5, borderColor: c.border, backgroundColor: on ? c.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                      {on ? <Icon name="check" size={14} color={c.onPrimary} strokeWidth={2.4} /> : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </Screen>
        <ActionBar>
          <Button
            title={picked.length < minTokens ? `Pick ${minTokens - picked.length} more` : `Continue with ${picked.length}`}
            icon={picked.length >= minTokens ? "arrow" : undefined}
            disabled={picked.length < minTokens || stockCount < minTokens}
            onPress={() => {
              setWeights(equalWeights(picked.length));
              setStep("weights");
            }}
          />
        </ActionBar>
      </View>
    );
  }

  // --- 2. weights -----------------------------------------------------------
  if (step === "weights") {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Screen bottom={TAB_BAR_SPACE + 90}>
          {header}
          <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", gap: 2, marginBottom: space.lg }}>
            {legs.map((a, i) => (
              <View key={a.mint} style={{ flex: weights[i] || 0.0001, backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
            ))}
          </View>
          <Card style={{ paddingVertical: space.xs }}>
            {legs.map((a, i) => (
              <View key={a.mint}>
                {i ? <Divider /> : null}
                <Row gap={space.md} style={{ paddingVertical: space.md }}>
                  <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
                  <AssetLogo uri={a.logo} ticker={a.ticker} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text v="bodyStrong">{a.ticker}</Text>
                    <Text v="small" color={c.textMuted}>
                      {a.kind === "crypto" ? "Crypto" : a.name}
                    </Text>
                  </View>
                  <IconButton icon="minus" size={34} onPress={() => nudge(i, -STEP_BPS)} disabled={(weights[i] ?? 0) <= 0} />
                  <Num v="heading" style={{ width: 56, textAlign: "center" }}>
                    {bpsToPct(weights[i] ?? 0)}
                  </Num>
                  <IconButton icon="plus" size={34} onPress={() => nudge(i, STEP_BPS)} />
                </Row>
              </View>
            ))}
          </Card>
          <Row style={{ justifyContent: "space-between", marginTop: space.lg }}>
            <Row gap={6}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: weightError ? c.down : c.up }} />
              <Text v="smallStrong" color={weightError ? c.down : c.textMuted}>
                {weightError ?? "Weights look good"}
              </Text>
            </Row>
            <Button title="Equal" kind="outline" small onPress={() => setWeights(equalWeights(picked.length))} />
          </Row>
        </Screen>
        <ActionBar>
          <Row>
            <Button title="Back" kind="secondary" onPress={() => setStep("pick")} />
            <Button title="Continue" icon="arrow" style={{ flex: 1 }} disabled={!!weightError} onPress={() => setStep("details")} />
          </Row>
        </ActionBar>
      </View>
    );
  }

  // --- 3. size, name, fee ---------------------------------------------------
  const sizes = [10, 25, 50, 100].filter((s) => s <= maxUsd);
  const chosen = size ?? (maxUsd >= minUsd ? Math.min(maxUsd, 25) : null);
  const needBuy = !address || maxUsd < minUsd;
  const testnet = config.data?.cluster !== "mainnet";

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen onRefresh={() => walletView.refetch()} bottom={TAB_BAR_SPACE + 90}>
        {header}
        <Card style={{ gap: space.md }}>
          <Label>Your basket</Label>
          <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
            {legs.map((a, i) => (
              <View key={a.mint} style={{ flex: weights[i], backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
            ))}
          </View>
          <Row style={{ flexWrap: "wrap" }} gap={space.md}>
            {legs.map((a, i) => (
              <Row key={a.mint} gap={6}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
                <Text v="small">
                  {a.ticker} <Text v="small" color={c.textMuted}>{bpsToPct(weights[i])}</Text>
                </Text>
              </Row>
            ))}
          </Row>
        </Card>

        <SectionTitle title="Size" />
        {!address ? (
          <Card style={{ gap: space.md }}>
            <Text color={c.textMuted}>Connect a wallet to see how much of this basket you can lock.</Text>
            <Button title="Connect a wallet" onPress={() => router.push("/connect")} />
          </Card>
        ) : needBuy ? (
          <Card style={{ gap: space.md }}>
            <View>
              <Label>You hold</Label>
              <Num v="hero">{usd(maxUsd)}</Num>
              <Text v="small" color={c.textMuted}>
                of this basket at these weights. You need at least {usd(minUsd, 0)} to enter.
              </Text>
            </View>
            <Row style={{ flexWrap: "wrap" }}>
              {[15, 30, 60].map((s) => (
                <Button key={s} small kind="secondary" title={`Buy ${usd(s, 0)}`} loading={busy} onPress={() => run((w) => api.planBuy({ wallet: w, legs: legsReq, usd: s }), `Bought ${usd(s, 0)} of your basket`)} />
              ))}
            </Row>
            <Text v="small" color={c.textFaint}>
              {testnet ? "Testnet: bought with test USDC at live prices." : "Swapped from USDC through Jupiter."}
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <Row style={{ flexWrap: "wrap" }}>
              {sizes.map((s) => (
                <Chip key={s} label={usd(s, 0)} selected={chosen === s} onPress={() => (setSize(s), setReview(null))} />
              ))}
              <Chip label={`Max ${usd(maxUsd, 0)}`} selected={chosen === maxUsd} onPress={() => (setSize(maxUsd), setReview(null))} />
            </Row>
            <Text v="small" color={c.textMuted}>
              The locked stocks are your ETF and come back after the round, whatever happens. Only the {usd(round.data?.stakeUsd ?? 5, 0)} ticket is at stake.
            </Text>
          </Card>
        )}

        {review ? (
          <>
            <SectionTitle title="You’re about to lock" />
            <Card style={{ gap: space.md }}>
              {review.legs.map((l, i) => (
                <Row key={l.mint} style={{ justifyContent: "space-between" }}>
                  <Row gap={6}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
                    <Text v="bodyStrong">{byMint.get(l.mint)?.ticker ?? l.symbol}</Text>
                  </Row>
                  <Text v="small" color={c.textMuted}>
                    {l.uiAmount.toFixed(l.uiAmount < 1 ? 5 : 3)} · <Text v="smallStrong">{usd(l.usd)}</Text>
                  </Text>
                </Row>
              ))}
              <Divider />
              <Row style={{ justifyContent: "space-between" }}>
                <Text v="bodyStrong">Basket</Text>
                <Num v="bodyStrong">{usd(review.usd)}</Num>
              </Row>
              <Row style={{ justifyContent: "space-between" }}>
                <Text color={c.textMuted}>Ticket (at stake)</Text>
                <Num>{usd(round.data?.stakeUsd ?? 5)}</Num>
              </Row>
              {BigInt(review.wrapLamports) > 0n ? (
                <Text v="small" color={c.textMuted}>
                  Includes wrapping {(Number(review.wrapLamports) / 1e9).toFixed(4)} SOL from your wallet (gas is kept aside).
                </Text>
              ) : null}
              <Text v="small" color={c.textFaint}>
                These are the exact amounts your wallet will sign for. Anything else in your wallet stays there.
              </Text>
            </Card>
          </>
        ) : null}

        <SectionTitle title="Name" />
        <TextInput
          placeholder="e.g. Chip Stack"
          placeholderTextColor={c.textFaint}
          value={name}
          onChangeText={(t) => setName(t.slice(0, 32))}
          maxLength={32}
          style={[type.title, { color: c.text, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}
        />

        <SectionTitle title="Your fee when people buy it" />
        <Row style={{ flexWrap: "wrap" }}>
          {[0, 50, 100, 150, 200].map((f) => (
            <Chip key={f} label={bpsToPct(f)} selected={fee === f} onPress={() => setFee(f)} />
          ))}
        </Row>
        <Text v="small" color={c.textMuted} style={{ marginTop: space.md }}>
          You also earn {rules?.creatorFeePct ?? 10}% of what your backers win. Beat {brand.line} to win the tickets below it.
        </Text>
      </Screen>
      <ActionBar>
        <Row>
          <Button title="Back" kind="secondary" onPress={() => (review ? setReview(null) : setStep("weights"))} />
          {review ? (
            <Button
              title={`Confirm & sign · ${usd((review.usd ?? 0) + (round.data?.stakeUsd ?? 5))}`}
              style={{ flex: 1 }}
              loading={busy}
              onPress={() =>
                run(
                  (w) => api.planCreate({ wallet: w, legs: legsReq, usd: review.usd, name: name.trim(), buyFeeBps: fee }),
                  "You’re in. Good luck.",
                  (plan) => {
                    setReview(null);
                    setStep("pick");
                    setPicked([]);
                    setName("");
                    router.push(`/etf/${plan.meta?.roundId}/${plan.meta?.teamKey}`);
                  },
                )
              }
            />
          ) : (
            <Button
              title="Review"
              icon="arrow"
              style={{ flex: 1 }}
              disabled={!address || needBuy || !name.trim() || chosen === null}
              loading={reviewing}
              onPress={async () => {
                setReviewing(true);
                try {
                  setReview(await api.quote({ wallet: address!, legs: legsReq, usd: chosen ?? undefined }));
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setReviewing(false);
                }
              }}
            />
          )}
        </Row>
      </ActionBar>
    </View>
  );
}

function Steps({ step }: { step: Step }) {
  const c = useColors();
  const at = STEPS.indexOf(step);
  return (
    <Row gap={6} style={{ marginTop: -space.md, marginBottom: space.xl }}>
      {STEPS.map((s, i) => (
        <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= at ? c.text : c.fill }} />
      ))}
    </Row>
  );
}

/** A glass bar above the floating tab bar for the step's main action. */
function ActionBar({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: "absolute", left: space.lg, right: space.lg, bottom: Math.max(insets.bottom, 12) + 74 }}>
      <View style={{ borderRadius: radius.pill, overflow: "hidden", borderWidth: 1, borderColor: c.glassBorder, boxShadow: `0 10px 30px ${c.shadow}` }}>
        <BlurView intensity={30} tint={c.scheme === "dark" ? "dark" : "light"} style={{ padding: 6, backgroundColor: c.glass }}>
          {children}
        </BlurView>
      </View>
    </View>
  );
}
