// More sign-in options (a sheet): a wallet app on this phone, a passkey, or
// email. Google and Seed Vault are on the welcome screen.

import { Platform, Pressable, View } from "react-native";
import { isSeeker } from "@/lib/device";
import { space, useColors } from "@/theme";
import { useSignIn, type SignInMethod } from "@/wallet/signin";
import { Icon, type IconName } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Text } from "@/components/ui";

const OPTIONS: { method: SignInMethod; icon: IconName; title: string; detail: string }[] = [
  { method: "passkey", icon: "faceid", title: "Face ID or fingerprint", detail: "Sign in with a passkey on this phone" },
  { method: "email", icon: "mail", title: "Email", detail: "We send you a one-time code" },
  ...(Platform.OS === "android"
    ? [{ method: "wallet" as const, icon: "wallet" as const, title: isSeeker() ? "Seed Vault" : "An existing wallet", detail: isSeeker() ? "Your Seeker's built-in wallet" : "Phantom, Solflare, Backpack, Seed Vault…" }]
    : []),
];

export default function SignInOptions() {
  const c = useColors();
  const toast = useToast();
  const { signIn, busy } = useSignIn();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: space.xl, paddingTop: space.xl }}>
      <Text v="title" style={{ fontSize: 26, lineHeight: 30, marginBottom: space.sm }}>
        More options
      </Text>
      {OPTIONS.map((o) => (
        <Pressable
          key={o.method}
          disabled={!!busy}
          onPress={() => signIn(o.method).catch((e) => toast((e as Error).message, "error"))}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md + 2, paddingVertical: space.md + 2, opacity: pressed ? 0.8 : 1 })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.fill, alignItems: "center", justifyContent: "center" }}>
            <Icon name={o.icon} size={20} color={c.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text>{busy === o.method ? "Signing in…" : o.title}</Text>
            <Text v="small" color={c.textMuted}>
              {o.detail}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
