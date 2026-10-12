// Sign in with email (a sheet): we send a one-time code, you type it in.
// Privy checks the code and keeps a Solana wallet for the account.

import { useState } from "react";
import { TextInput, View } from "react-native";
import { radius, space, type, useColors } from "@/theme";
import { useSignIn } from "@/wallet/signin";
import { useToast } from "@/components/Toast";
import { Button, Text } from "@/components/ui";

export default function EmailSignIn() {
  const c = useColors();
  const toast = useToast();
  const { privy, finishPrivy } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const step = async (fn: () => Promise<void>) => {
    if (!privy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const field = { height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: space.lg, color: c.text, outlineWidth: 0 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.lg }}>
      <Text v="title" style={{ fontSize: 26, lineHeight: 30 }}>
        {sent ? "Check your email" : "Sign in with email"}
      </Text>
      <Text color={c.textMuted}>{sent ? `We sent a 6-digit code to ${email.trim()}.` : "We'll send you a one-time code. No password needed."}</Text>
      {sent ? (
        <>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            autoFocus
            textContentType="oneTimeCode"
            style={[type.title, field, { textAlign: "center", letterSpacing: 6 }]}
          />
          <Button title="Sign in" disabled={code.length !== 6} loading={busy} onPress={() => step(async () => (await privy!.loginWithEmailCode(email.trim(), code), await finishPrivy()))} />
          <Button title="Send a new code" kind="ghost" onPress={() => step(async () => (await privy!.sendEmailCode(email.trim()), toast("New code sent", "ok")))} />
        </>
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            textContentType="emailAddress"
            style={[type.body, field]}
          />
          <Button title="Send code" disabled={!validEmail} loading={busy} onPress={() => step(async () => (await privy!.sendEmailCode(email.trim()), setSent(true)))} />
        </>
      )}
    </View>
  );
}
