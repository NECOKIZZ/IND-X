// Portfolio: balance hero, wallet actions, this round's entry, holdings and
// history.

import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import type { WalletEntryView } from "@indx/core";
import { brand, radius, signColor, space, useAppearance, useColors, type Appearance } from "@/theme";
import { useAssets, useConfig, useWalletView } from "@/lib/queries";
import { api } from "@/lib/api";
import { pct, short, usd } from "@/lib/format";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { AssetLogo } from "@/components/AssetLogo";
import { Glow } from "@/components/Glow";
import { PageTitle, TopBar } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useTxAction } from "@/components/TxAction";
import { Button, Card, Divider, Empty, ErrorView, Label, Num, Pill, Row, Screen, SectionTitle, Segmented, Skeleton, Stat, Text } from "@/components/ui";

const STATE: Record<WalletEntryView["state"], string> = {
  entered: "Entered",
  live: "Live",
  won: `Beat ${brand.line}`,
  draw: `On ${brand.line}`,
  lost: `Below ${brand.line}`,
  refunded: "Refunded",
  voided: "Void · refunded",
};

function EntryCard({ e }: { e: WalletEntryView }) {
  const c = useColors();
  const { run, busy } = useTxAction();
  const tone = e.state === "won" ? c.up : e.state === "lost" ? c.down : e.state === "draw" ? c.line : c.textMuted;
  const settled = ["won", "draw", "lost", "refunded", "voided"].includes(e.state);
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

  if (!address) {
    return (
      <Screen>
        <TopBar />
        <PageTitle title="Portfolio" />
        <Empty title="Connect a wallet" body={brand.pitch} action={<Button title="Connect" onPress={() => router.push("/connect")} />} />
        <AppearancePicker />
      </Screen>
    );
  }
  if (w.isLoading) {
    return (
      <Screen>
        <TopBar />
        <Skeleton height={240} style={{ borderRadius: radius.xl }} />
      </Screen>
    );
  }
  if (w.error) return <ErrorView error={w.error} onRetry={() => w.refetch()} />;
  const v = w.data!;
  const priced = new Map((assets.data ?? []).map((a) => [a.mint, a]));
  const holdings = v.usdc.uiAmount + v.assets.reduce((s, b) => s + (b.usd ?? 0), 0);
  const live = v.entries.filter((e) => e.state === "entered" || e.state === "live");
  const past = v.entries.filter((e) => !(e.state === "entered" || e.state === "live"));
  const losses = v.stats.rounds - v.stats.wins - v.stats.draws;

  return (
    <Screen onRefresh={() => w.refetch()}>
      <TopBar />
      <View style={{ borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
        <Glow variant={1} />
        <View style={{ padding: space.xl, gap: space.xl }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Label color={c.text}>{kind === "dev" ? "Test wallet" : "Wallet"}</Label>
            <Text v="mono" color={c.textMuted} selectable>
              {short(address, 5)}
            </Text>
          </Row>
          <View>
            <Label>Total balance</Label>
            <Num v="display">{usd(holdings)}</Num>
            {v.stats.rounds ? (
              <Text v="small" color={signColor(c, v.stats.netUsd)}>
                {v.stats.netUsd >= 0 ? "+" : "−"}
                {usd(Math.abs(v.stats.netUsd))} on tickets over {v.stats.rounds} {v.stats.rounds === 1 ? "round" : "rounds"}
              </Text>
            ) : null}
          </View>
          <Row style={{ justifyContent: "space-between" }}>
            <Stat label="USDC" value={usd(v.usdc.uiAmount, 0)} />
            <Stat label="SOL" value={v.sol.toFixed(2)} />
            <Stat label="Record" value={`${v.stats.wins}–${v.stats.draws}–${losses}`} align="right" />
          </Row>
        </View>
      </View>

      <Row style={{ marginTop: space.md, flexWrap: "wrap" }}>
        {config.data?.faucet ? (
          <Button
            small
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
        <Button small kind="ghost" title="Disconnect" onPress={() => disconnect()} />
      </Row>

      <SectionTitle title="This round" />
      {live.length ? live.map((e) => <EntryCard key={e.roundId} e={e} />) : <Empty title="Not in this round" body="Build an ETF or back someone's." action={<Button small title="Build an ETF" onPress={() => router.push("/create")} />} />}

      {v.assets.length ? (
        <>
          <SectionTitle title="Stocks" />
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

      <AppearancePicker />

      <Row gap={6} style={{ marginTop: space.xxl, justifyContent: "center" }}>
        <Icon name="info" size={14} color={c.textFaint} />
        <Text v="small" color={c.textFaint}>
          {config.data?.cluster === "mainnet" ? "Mainnet · real money" : "Testnet · test money only"}
        </Text>
      </Row>
    </Screen>
  );
}

function AppearancePicker() {
  const { appearance, setAppearance } = useAppearance();
  return (
    <>
      <SectionTitle title="Appearance" />
      <Segmented<Appearance>
        value={appearance}
        onChange={setAppearance}
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
          { value: "system", label: "System" },
        ]}
      />
    </>
  );
}
