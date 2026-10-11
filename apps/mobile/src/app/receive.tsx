// Receive: your @tag and address, to share (a sheet).

import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { radius, space, useColors } from "@/theme";
import { useConfig, useWalletView } from "@/lib/queries";
import { success } from "@/lib/haptics";
import { useWallet } from "@/wallet/WalletProvider";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { Button, Label, Text } from "@/components/ui";

export default function Receive() {
  const c = useColors();
  const toast = useToast();
  const { address } = useWallet();
  const tag = useWalletView(address).data?.tag;
  const testnet = useConfig().data?.cluster !== "mainnet";
  if (!address) return null;
  const copy = async (s: string, what: string) => {
    await Clipboard.setStringAsync(s);
    success();
    toast(`${what} copied`, "ok");
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.lg, alignItems: "center" }}>
      <Text v="title" style={{ alignSelf: "flex-start" }}>
        Receive
      </Text>
      <Avatar wallet={address} size={72} />
      {tag ? (
        <Text v="heading" style={{ fontSize: 24, lineHeight: 28 }}>
          @{tag}
        </Text>
      ) : (
        <Button small kind="secondary" title="Claim a @tag people can send to" onPress={() => router.replace("/tag")} />
      )}
      <View style={{ alignSelf: "stretch", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.xl, padding: space.lg, gap: 6 }}>
        <Label>Your Solana address</Label>
        <Text v="mono" selectable style={{ fontSize: 15, lineHeight: 22 }}>
          {address}
        </Text>
      </View>
      <View style={{ alignSelf: "stretch", flexDirection: "row", gap: space.sm }}>
        <Button title="Copy address" icon="copy" style={{ flex: 1 }} onPress={() => copy(address, "Address")} />
        {tag ? <Button title={`Copy @${tag}`} kind="secondary" style={{ flex: 1 }} onPress={() => copy(`@${tag}`, "Tag")} /> : null}
      </View>
      <Text v="small" color={c.textFaint} style={{ textAlign: "center" }}>
        {testnet ? "Testnet: send only devnet test tokens here." : "Send only Solana tokens (USDC, xStocks, SOL) to this address."}
      </Text>
    </View>
  );
}
