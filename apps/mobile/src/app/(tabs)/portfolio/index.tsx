// Portfolio: wallet, balances, entries (live and past) and stats.

import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import type { WalletEntryView } from "@indx/core";
import { brand, signColor, space, useColors } from "@/theme";
import { useAssets, useConfig, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { pct, short, usd } from "@/lib/format";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { useToast } from "@/components/Toast";
import { useTxAction } from "@/components/TxAction";
import { Button, Card, Divider, Empty, ErrorView, Num, Pill, Row, Screen, SectionTitle, Skeleton, Stat, Text } from "@/components/ui";

const STATE: Record<WalletEntryView["state"], string> = {
  entered: "Entered",
  live: "Live",
  won: "Beat MEDIAN",
  draw: "On MEDIAN",
  lost: "Below MEDIAN",
  refunded: "Refunded",
  voided: "Void · refunded",
};

function EntryCard({ e }: { e: WalletEntryView }) {
  const c = useColors();
  const { run, busy } = useTxAction();
  const tone = e.state === "won" ? c.up : e.state === "lost" ? c.down : e.state === "draw" ? c.median : c.textMuted;
  const settled = ["won", "draw", "lost", "refunded", "voided"].includes(e.state);
  return (
    <Card onPress={() => router.push(`/etf/${e.roundId}/${e.etfKey}`)} style={{ gap: space.sm, marginBottom: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text v="label" color={c.textMuted}>
          Round {e.roundId} · {e.isCaptain ? "creator" : e.isCreator ? "co-creator" : "backer"}
        </Text>
        <Pill label={STATE[e.state]} color={tone} />
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <Text v="heading">{e.etfName}</Text>
        <Num v="heading" color={signColor(c, e.retPct)}>
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
        <Text v="small" color={c.textMuted}>
          Basket: {e.basket.map((b) => `${b.uiAmount.toFixed(4)} ${b.symbol}`).join(" · ")} {e.basket.every((b) => b.returned) ? "(back in your wallet)" : "(locked)"}
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

  if (!address) {
    return (
      <Screen>
        <Empty title="Connect a wallet" body={brand.pitch} action={<Button title="Connect" onPress={() => router.push("/connect")} />} />
      </Screen>
    );
  }
  if (w.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={100} style={{ marginTop: space.md }} />
      </Screen>
    );
  }
  if (w.error) return <ErrorView error={w.error} onRetry={() => w.refetch()} />;
  const v = w.data!;
  const priced = new Map((assets.data ?? []).map((a) => [a.mint, a]));
  const holdings = v.usdc.uiAmount + v.assets.reduce((s, b) => s + (b.usd ?? 0), 0);
  const live = v.entries.filter((e) => e.state === "entered" || e.state === "live");
  const past = v.entries.filter((e) => !(e.state === "entered" || e.state === "live"));

  return (
    <Screen onRefresh={() => w.refetch()}>
      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text v="label" color={c.textMuted}>
            {kind === "dev" ? "Test wallet" : "Wallet"}
          </Text>
          <Text
            v="smallStrong"
            color={c.accent}
            selectable
            style={{}}
          >
            {short(address, 6)}
          </Text>
        </Row>
        <Num v="hero">{usd(holdings)}</Num>
        <Row style={{ justifyContent: "space-between" }}>
          <Stat label="USDC" value={usd(v.usdc.uiAmount)} />
          <Stat label="SOL" value={v.sol.toFixed(3)} align="center" />
          <Stat label="Record" value={`${v.stats.wins}W ${v.stats.draws}D ${v.stats.rounds - v.stats.wins - v.stats.draws}L`} align="right" />
        </Row>
        <Row>
          <Button
            small
            kind="secondary"
            title="Copy address"
            onPress={async () => {
              await Clipboard.setStringAsync(address);
              success();
              toast("Address copied", "ok");
            }}
          />
          {config.data?.faucet ? (
            <Button
              small
              kind="secondary"
              title="Get test money"
              onPress={async () => {
                try {
                  const r = await api.faucet(address);
                  success();
                  toast(`+${r.usdc} test USDC${r.sol ? ` and ${r.sol} SOL` : ""}`, "ok");
                  await w.refetch();
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }}
            />
          ) : null}
          <Button small kind="ghost" title="Disconnect" onPress={() => disconnect()} />
        </Row>
      </Card>

      {v.stats.rounds ? (
        <Text color={signColor(c, v.stats.netUsd)} style={{ marginTop: space.md, textAlign: "center" }}>
          {v.stats.netUsd >= 0 ? "Up" : "Down"} {usd(Math.abs(v.stats.netUsd))} on tickets over {v.stats.rounds} {v.stats.rounds === 1 ? "round" : "rounds"}
        </Text>
      ) : null}

      <SectionTitle title="This round" />
      {live.length ? live.map((e) => <EntryCard key={e.roundId} e={e} />) : <Empty title="Not in this round" body="Build an ETF or back someone's." action={<Button small title="Build an ETF" onPress={() => router.push("/create")} />} />}

      {v.assets.length ? (
        <>
          <SectionTitle title="Stocks" />
          <Card style={{ gap: space.md }}>
            {v.assets.map((b, i) => {
              const a = priced.get(b.mint);
              return (
                <View key={b.mint} style={{ gap: space.md }}>
                  {i ? <Divider /> : null}
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row>
                      <AssetLogo uri={a?.logo} ticker={a?.ticker ?? b.symbol} size={28} />
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
