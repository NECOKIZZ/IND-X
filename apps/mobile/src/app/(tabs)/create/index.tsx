// Build an ETF in three steps: pick 3–10 tokens, set weights, then say how
// much USDC to put in and name it. The stocks are bought for you in the same
// approval (Jupiter on mainnet, the test desk on testnet) and only that
// amount is locked; nothing else in the wallet is touched.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AssetView } from "@indx/core";
import { brand, palette, radius, signColor, space, TAB_BAR_SPACE, type, useColors } from "@/theme";
import { useAssets, useConfig, useRound, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { setTabBarHidden } from "@/lib/chrome";
import { bpsToPct, pct, usd } from "@/lib/format";
import { closedReason } from "@/lib/closed";
import { tap } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { PageTitle } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { useTxAction } from "@/components/TxAction";
import { useFaucet } from "@/components/useFaucet";
import { Button, Card, Chip, Divider, Empty, IconButton, Label, Num, Row, Screen, SectionTitle, Segmented, Skeleton, Text } from "@/components/ui";

type Step = "pick" | "weights" | "details";
type Filter = "all" | "stock" | "etf" | "crypto";
const STEP_BPS = 100; // weights move in 1% steps (or type them on the keypad)
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

  const [step, setStep] = useState<Step>("pick");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [weights, setWeights] = useState<number[]>([]);
  /** The leg whose weight the keypad is typing, and what's been typed. */
  const [editing, setEditing] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 400;
  const tiny = winW < 300;
  const [amount, setAmount] = useState(25);
  /** The keypad is typing the amount (instead of a weight). */
  const [typingAmount, setTypingAmount] = useState(false);
  const [useHeld, setUseHeld] = useState(false);
  const [name, setName] = useState("");
  const [fee, setFee] = useState(100);
  const faucet = useFaucet();

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

  // What the transaction will do for this amount: always from the server's
  // quote, the same function that builds the transaction.
  const legsReq = legs.map((a, i) => ({ mint: a.mint, weightBps: weights[i] }));
  const quoteKey = JSON.stringify(legsReq);
  const minUsd = rules?.minBasketUsd ?? 10;
  const quote = useQuery({
    queryKey: ["quote", address, quoteKey, amount, useHeld],
    queryFn: () => api.quote({ wallet: address!, legs: legsReq, usd: amount, buy: true, useHeld }),
    enabled: step === "details" && !!address && !weightError && legs.length >= minTokens && amount >= minUsd,
    refetchInterval: 20_000,
    placeholderData: (prev) => prev,
  });

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
        <PageTitle title="Build" />
        <Empty {...closedReason(round.data)} action={<Button title="Follow the live round" small onPress={() => router.push("/")} />} />
      </Screen>
    );
  }

  const header = (
    <>
      <PageTitle title={step === "pick" ? "Pick your stocks" : step === "weights" ? "Set the weights" : "Amount and name"} />
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
                      <Row gap={6}>
                        <Text v="bodyStrong">{a.ticker}</Text>
                        {a.ticker === "SKR" ? (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: c.upSoft }}>
                            <Text v="small" color={c.up} style={{ fontSize: 11 }}>
                              Seeker
                            </Text>
                          </View>
                        ) : null}
                      </Row>
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
                <Row gap={narrow ? space.sm : space.md} style={{ paddingVertical: space.md }}>
                  {narrow ? null : <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />}
                  {tiny ? null : <AssetLogo uri={a.logo} ticker={a.ticker} size={narrow ? 26 : 32} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text v="bodyStrong" numberOfLines={1}>
                      {a.ticker}
                    </Text>
                    <Text v="small" color={c.textMuted} numberOfLines={1}>
                      {a.kind === "crypto" ? "Crypto" : a.name}
                    </Text>
                  </View>
                  <IconButton icon="minus" size={narrow ? 30 : 34} onPress={() => nudge(i, -STEP_BPS)} disabled={(weights[i] ?? 0) <= 0} />
                  <Pressable
                    accessibilityLabel={`Type the weight of ${a.ticker}`}
                    onPress={() => (setEditing(i), setTyped(""))}
                    style={{ width: tiny ? 48 : narrow ? 54 : 64, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: editing === i ? c.brand : c.border, backgroundColor: editing === i ? c.upSoft : c.fill }}
                  >
                    <Num v="bodyStrong">{bpsToPct(weights[i] ?? 0)}</Num>
                  </Pressable>
                  <IconButton icon="plus" size={narrow ? 30 : 34} onPress={() => nudge(i, STEP_BPS)} />
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
        {editing !== null ? (
          <Keypad
            onDigit={(d) => {
              const next = (typed + d).replace(/^0+(?=\d)/, "").slice(-3);
              setTyped(next);
              const v = Math.min(100, Number(next) || 0);
              setWeights((w) => w.map((x, j) => (j === editing ? v * 100 : x)));
            }}
            onClose={() => setEditing(null)}
            onReview={() => {
              setEditing(null);
              if (!weightError) setStep("details");
            }}
            reviewDisabled={!!weightError}
          />
        ) : (
          <ActionBar>
            <Row>
              <Button title="Back" kind="secondary" onPress={() => setStep("pick")} />
              <Button title="Continue" icon="arrow" style={{ flex: 1 }} disabled={!!weightError} onPress={() => setStep("details")} />
            </Row>
          </ActionBar>
        )}
      </View>
    );
  }

  // --- 3. amount, name, fee ------------------------------------------------
  const testnet = config.data?.cluster !== "mainnet";
  const ticket = round.data?.stakeUsd ?? 5;
  const q = quote.data;
  const buyUsd = q ? q.buyUsd : amount;
  const totalUsdc = buyUsd + ticket;
  const usdcHave = q?.usdcUsd ?? walletView.data?.usdc.uiAmount ?? 0;
  const short = usdcHave + 1e-6 < totalUsdc;
  const heldAny = (walletView.data?.assets ?? []).some((b) => b.uiAmount > 0 && picked.includes(b.mint));
  const tooSmall = amount < minUsd;
  const canCreate = !!address && !tooSmall && !short && !!name.trim() && !quote.isError;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen onRefresh={() => walletView.refetch()} bottom={TAB_BAR_SPACE + 90}>
        {header}

        {/* How much goes in */}
        <Card style={{ gap: space.md, alignItems: "center" }}>
          <Label>You put in</Label>
          <Pressable accessibilityLabel="Type an amount" onPress={() => (setTypingAmount(true), setTyped(""))} style={{ alignItems: "center" }}>
            <Num v="display" color={tooSmall ? c.down : c.text} style={{ fontSize: narrow ? 44 : 52, lineHeight: narrow ? 50 : 58 }}>
              {usd(amount, 0)}
            </Num>
            <Text v="small" color={c.textFaint}>
              Tap to type an amount
            </Text>
          </Pressable>
          <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {[10, 25, 50, 100].map((a) => (
              <Chip key={a} label={usd(a, 0)} selected={amount === a} onPress={() => (tap(), setAmount(a))} />
            ))}
          </Row>
          <Text v="small" color={short ? c.down : c.textMuted} style={{ textAlign: "center" }}>
            {tooSmall
              ? `Put in at least ${usd(minUsd, 0)}`
              : short
                ? `You need ${usd(totalUsdc)} USDC and have ${usd(usdcHave)}`
                : `Paid from your USDC · ${usd(usdcHave)} available`}
          </Text>
          {short && faucet.available ? <Button small kind="secondary" title="Get test funds" loading={faucet.busy} onPress={faucet.drip} /> : null}
          {short && !faucet.available ? <Button small kind="secondary" title="Add USDC" onPress={() => router.push("/receive")} /> : null}
        </Card>

        {/* What it buys, exactly */}
        <SectionTitle title="What you get" />
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
            {legs.map((a, i) => (
              <View key={a.mint} style={{ flex: weights[i], backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
            ))}
          </View>
          {legs.map((a, i) => {
            const l = q?.legs.find((x) => x.mint === a.mint);
            const estUsd = (amount * (weights[i] ?? 0)) / 10_000;
            return (
              <Row key={a.mint} gap={space.sm}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LEG_COLORS[i % LEG_COLORS.length] }} />
                {tiny ? null : <AssetLogo uri={a.logo} ticker={a.ticker} size={24} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text v="bodyStrong" numberOfLines={1}>
                    {a.ticker} <Text v="small" color={c.textMuted}>{bpsToPct(weights[i])}</Text>
                  </Text>
                </View>
                <Text v="small" color={c.textMuted} numberOfLines={1}>
                  {l ? `${l.uiAmount.toFixed(l.uiAmount < 1 ? 5 : 3)} · ` : ""}
                  <Text v="smallStrong">{usd(l?.usd ?? estUsd)}</Text>
                </Text>
              </Row>
            );
          })}
          <Divider />
          <Row style={{ justifyContent: "space-between" }}>
            <Text color={c.textMuted}>{useHeld && q && q.buyUsd + 0.005 < q.usd ? "Stocks to buy (rest from your wallet)" : "Stocks, bought for you"}</Text>
            <Num>{usd(buyUsd)}</Num>
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Text color={c.textMuted}>Ticket (at stake)</Text>
            <Num>{usd(ticket)}</Num>
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Text v="bodyStrong">Total from USDC</Text>
            <Num v="bodyStrong">{usd(totalUsdc)}</Num>
          </Row>
          {heldAny ? (
            <Pressable onPress={() => (tap(), setUseHeld((u) => !u))} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.xs }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: useHeld ? 0 : 1.5, borderColor: c.border, backgroundColor: useHeld ? c.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                {useHeld ? <Icon name="check" size={13} color={c.onPrimary} strokeWidth={2.4} /> : null}
              </View>
              <Text v="small" style={{ flex: 1 }}>
                Use stocks I already hold first (only up to this amount)
              </Text>
            </Pressable>
          ) : null}
          <Text v="small" color={c.textFaint}>
            {testnet ? "Testnet: swapped from test USDC at live prices." : "Swapped from USDC through Jupiter."} Only {usd(amount, 0)} of stocks is locked, and it comes back after the round whatever happens. Nothing else in your wallet is touched.
          </Text>
        </Card>

        <SectionTitle title="Name" />
        <TextInput
          placeholder="e.g. Chip Stack"
          placeholderTextColor={c.textFaint}
          value={name}
          onChangeText={(t) => setName(t.slice(0, 32))}
          maxLength={32}
          style={[type.title, { color: c.text, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border, outlineWidth: 0 }]}
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
      {typingAmount ? (
        <Keypad
          actionTitle="Done"
          onDigit={(d) => {
            const next = (typed + d).replace(/^0+(?=\d)/, "").slice(0, 5);
            setTyped(next);
            setAmount(Number(next) || 0);
          }}
          onClose={() => setTypingAmount(false)}
          onReview={() => setTypingAmount(false)}
          reviewDisabled={false}
        />
      ) : (
        <ActionBar>
          <Row>
            <Button title="Back" kind="secondary" onPress={() => setStep("weights")} />
            <Button
              title={!name.trim() ? "Name your ETF" : `Create · ${usd(totalUsdc)}`}
              style={{ flex: 1 }}
              disabled={!canCreate}
              loading={busy}
              onPress={() =>
                run(
                  (w) => api.planCreate({ wallet: w, legs: legsReq, usd: amount, buy: true, useHeld, name: name.trim(), buyFeeBps: fee }),
                  "You’re in. Good luck.",
                  (plan) => {
                    setStep("pick");
                    setPicked([]);
                    setName("");
                    router.push(`/etf/${plan.meta?.roundId}/${plan.meta?.teamKey}`);
                  },
                )
              }
            />
          </Row>
        </ActionBar>
      )}
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

/** Typing a weight: round glass keys 1–9, 0 alone below, and Review basket. */
function Keypad({ onDigit, onClose, onReview, reviewDisabled, actionTitle = "Review basket" }: { onDigit: (d: string) => void; onClose: () => void; onReview: () => void; reviewDisabled: boolean; actionTitle?: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setTabBarHidden(true);
    return () => setTabBarHidden(false);
  }, []);
  const key = (d: string) => (
    <Pressable
      key={d}
      accessibilityLabel={d}
      onPress={() => onDigit(d)}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.glassBorder,
        backgroundColor: pressed ? c.upSoft : c.scheme === "dark" ? "rgba(238,242,237,0.07)" : "rgba(41,50,52,0.06)",
      })}
    >
      <Text v="title" style={{ fontSize: 26, lineHeight: 30 }}>
        {d}
      </Text>
    </Pressable>
  );
  const row = (ds: string[]) => (
    <Row style={{ justifyContent: "space-around" }}>{ds.map(key)}</Row>
  );
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: c.glassBorder, zIndex: 10 }}>
      <BlurView intensity={40} tint={c.scheme === "dark" ? "dark" : "light"} style={{ backgroundColor: c.glass, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: space.md }}>
        <Pressable onPress={onClose} hitSlop={12} style={{ alignSelf: "center", paddingVertical: 6 }} accessibilityLabel="Close the keypad">
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.textFaint }} />
        </Pressable>
        {row(["1", "2", "3"])}
        {row(["4", "5", "6"])}
        {row(["7", "8", "9"])}
        <Row style={{ justifyContent: "center" }}>{key("0")}</Row>
        <Button title={actionTitle} disabled={reviewDisabled} onPress={onReview} />
      </BlurView>
    </View>
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
