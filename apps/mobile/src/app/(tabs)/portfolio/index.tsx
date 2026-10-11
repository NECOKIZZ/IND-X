// Portfolio: avatar and @tag, balance with total P&L, send / receive (and
// test funds on testnet), this round's entry, holdings, history, sign out.

import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import type { WalletEntryView } from "@indx/core";
import { brand, radius, signColor, space, useColors } from "@/theme";
import { useAssets, useConfig, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { pct, short, usd } from "@/lib/format";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { Glow } from "@/components/Glow";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useTxAction } from "@/components/TxAction";
import { Button, Card, Divider, Empty, ErrorView, Label, Num, Pill, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";

const STATE: Record<WalletEntryView["state"], string> = {
  entered: "Entered",
  live: "Live",
  won: `Beat ${brand.line}`,
  lost: `Not above ${brand.line}`,
  refunded: "Refunded",
  voided: "Void · refunded",
};

function EntryCard({ e }: { e: WalletEntryView }) {
  const c = useColors();
  const { run, busy } = useTxAction();
  const tone = e.state === "won" ? c.up : e.state === "lost" ? c.down : c.textMuted;
  const settled = ["won", "lost", "refunded", "voided"].includes(e.state);
  return (
    <Card onPress={() => router.push(`/etf/${e.roundId}/${e.etfKey}`)} style={{ gap: space.sm, marginBottom: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Label>
          Round {e.roundId} · {e.isCaptain ? "creator" : e.isCreator ? "co-creator" : "backer"}
        </Label>
        <Pill label={STATE[e.state]} dot={tone} />
      </Row>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text v="title" numberOfLines={1} style={{ flex: 1, fontSize: 26, lineHeight: 32 }}>
          {e.etfName}
        </Text>
        <Num v="title" color={signColor(c, e.retPct)} style={{ fontSize: 26, lineHeight: 32 }}>
          {pct(e.retPct)}
        </Num>
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <Text v="small" color={c.textMuted}>
          Ticket {usd(e.stakeUsd)}
        </Text>
        {e.payoutUsd !== null ? (
          <Text v="smallStrong" color={tone}>
            {settled ? (e.paid ? "Paid " : "Owed ") : "Would pay "}
            {usd(e.payoutUsd)}
          </Text>
        ) : null}
      </Row>
      {e.basket.length ? (
        <Text v="small" color={c.textFaint}>
          {e.basket.map((b) => `${b.uiAmount.toFixed(3)} ${b.symbol}`).join(" · ")} · {e.basket.every((b) => b.returned) ? "back in wallet" : "locked"}
        </Text>
      ) : null}
      {settled && !e.paid ? <Button small title="Collect now" loading={busy} onPress={() => run((w) => api.planClaim(w, e.roundId), "Collected")} /> : null}
    </Card>
  );
}

export default function Portfolio() {
  const c = useColors();
  const toast = useToast();
  const config = useConfig();
  const assets = useAssets();
  const { address, kind, disconnect } = useWallet();
  const w = useWalletView(address);

  if (!address) return <Screen>{null}</Screen>;
  if (w.isLoading) {
    return (
      <Screen>
        <Skeleton height={56} width={200} />
        <Skeleton height={240} style={{ borderRadius: radius.xl, marginTop: space.lg }} />
      </Screen>
    );
  }
  if (w.error) return <ErrorView error={w.error} onRetry={() => w.refetch()} />;
  const v = w.data!;
  const priced = new Map((assets.data ?? []).map((a) => [a.mint, a]));
  const holdings = v.usdc.uiAmount + v.assets.reduce((s, b) => s + (b.usd ?? 0), 0);
  const live = v.entries.filter((e) => e.state === "entered" || e.state === "live");
  const past = v.entries.filter((e) => !(e.state === "entered" || e.state === "live"));
  const losses = v.stats.rounds - v.stats.wins;
  const pnl = v.stats.netUsd;

  return (
    <Screen onRefresh={() => w.refetch()}>
      {/* Profile: avatar, @tag, address, sign out */}
      <Row gap={space.md} style={{ marginBottom: space.lg }}>
        <Avatar wallet={address} size={52} />
        <View style={{ flex: 1 }}>
          {v.tag ? (
            <Text v="heading" style={{ fontSize: 22, lineHeight: 26 }}>
              @{v.tag}
            </Text>
          ) : (
            <Pressable onPress={() => router.push("/tag")} hitSlop={6}>
              <Text v="bodyStrong" color={c.brand}>
                Claim your @tag
              </Text>
            </Pressable>
          )}
          <Pressable
            hitSlop={6}
            onPress={async () => {
              await Clipboard.setStringAsync(address);
              success();
              toast("Address copied", "ok");
            }}
          >
            <Row gap={5}>
              <Text v="small" color={c.textMuted}>
                {short(address, 4)}
              </Text>
              <Icon name="copy" size={12} color={c.textMuted} />
            </Row>
          </Pressable>
        </View>
        <Pressable onPress={() => disconnect()} style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: c.fill, justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
          <Text v="smallStrong" color={c.down}>
            Sign out
          </Text>
        </Pressable>
      </Row>

      <View style={{ borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
        <Glow variant={1} />
        <View style={{ padding: space.xl, gap: space.xl }}>
          <View>
            <Label>{kind === "dev" ? "Total balance · test wallet" : "Total balance"}</Label>
            <Num v="display">{usd(holdings)}</Num>
            <Row gap={8} style={{ marginTop: 4 }}>
              <Pill label={`${pnl > 0 ? "▲" : pnl < 0 ? "▼" : ""} ${pnl >= 0 ? "+" : "−"}${usd(Math.abs(pnl))}`.trim()} color={signColor(c, pnl)} bg={pnl > 0 ? c.upSoft : pnl < 0 ? c.downSoft : c.fill} />
              <Text v="small" color={c.textMuted}>
                total P&amp;L{v.stats.rounds ? ` · ${v.stats.rounds} ${v.stats.rounds === 1 ? "round" : "rounds"}` : ""}
              </Text>
            </Row>
          </View>
          <Row style={{ justifyContent: "space-between" }}>
            <Stat label="USDC" value={usd(v.usdc.uiAmount, 0)} />
            <Stat label="Gas (SOL)" value={v.sol.toFixed(3)} />
            <View style={{ alignItems: "flex-end" }}>
              <Label>Record</Label>
              <Text v="title" style={{ fontSize: 24, lineHeight: 30 }}>
                <Text v="title" color={c.up} style={{ fontSize: 24, lineHeight: 30 }}>{`${v.stats.wins}W`}</Text>{" "}
                <Text v="title" color={losses ? c.down : c.text} style={{ fontSize: 24, lineHeight: 30 }}>{`${losses}L`}</Text>
              </Text>
            </View>
          </Row>
        </View>
      </View>

      {/* Send, receive, and test funds on testnet only */}
      <Row style={{ marginTop: space.md }}>
        <Button small title="Send" style={{ flex: 1 }} onPress={() => router.push("/send")} />
        <Button small kind="secondary" title="Receive" style={{ flex: 1 }} onPress={() => router.push("/receive")} />
        {config.data?.faucet ? (
          <Button
            small
            kind="secondary"
            title="Test funds"
            style={{ flex: 1 }}
            onPress={async () => {
              try {
                const r = await api.faucet(address);
                success();
                toast(`+${r.usdc} test USDC${r.sol ? ` and ${r.sol} SOL for network fees` : ""}`, "ok");
                await w.refetch();
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          />
        ) : null}
      </Row>

      <SectionTitle title="This round" />
      {live.length ? live.map((e) => <EntryCard key={e.roundId} e={e} />) : <Empty title="Not in this round" body="Build an ETF or back someone's." action={<Button small title="Build an ETF" onPress={() => router.push("/create")} />} />}

      {v.assets.length ? (
        <>
          <SectionTitle title="Holdings" />
          <Card style={{ paddingVertical: space.xs }}>
            {v.assets.map((b, i) => {
              const a = priced.get(b.mint);
              return (
                <View key={b.mint}>
                  {i ? <Divider style={{ marginLeft: 48 }} /> : null}
                  <Row style={{ justifyContent: "space-between", paddingVertical: space.md }}>
                    <Row gap={space.md}>
                      <AssetLogo uri={a?.logo} ticker={a?.ticker ?? b.symbol} size={36} />
                      <View>
                        <Text v="bodyStrong">{a?.ticker ?? b.symbol}</Text>
                        <Text v="small" color={c.textMuted}>
                          {b.uiAmount.toFixed(4)} {b.symbol}
                        </Text>
                      </View>
                    </Row>
                    <View style={{ alignItems: "flex-end" }}>
                      <Num>{usd(b.usd)}</Num>
                      <Text v="small" color={signColor(c, a?.change24hPct)}>
                        {pct(a?.change24hPct)}
                      </Text>
                    </View>
                  </Row>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {past.length ? (
        <>
          <SectionTitle title="History" />
          {past.map((e) => (
            <EntryCard key={e.roundId} e={e} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
