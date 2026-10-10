import "@/lib/polyfills";
import { useEffect, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { dark, light } from "@/theme";
import { ToastProvider } from "@/components/Toast";
import { WalletProvider, useWallet } from "@/wallet/WalletProvider";
import { useNotifications } from "@/lib/notifications";
import { useAppFonts } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

function Notifications({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  useNotifications(address);
  return <>{children}</>;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = scheme === "dark" ? dark : light;
  const nav = scheme === "dark" ? DarkTheme : DefaultTheme;
  const fontsReady = useAppFonts();
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: c.bg, card: c.bg, text: c.text, primary: c.text, border: c.border } }}>
            <ToastProvider>
              <Notifications>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: "minimal", contentStyle: { backgroundColor: c.bg } }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="etf/[round]/[key]" options={{ headerShown: false }} />
                  <Stack.Screen name="round/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="rules" options={{ headerShown: false, presentation: "modal" }} />
                  <Stack.Screen
                    name="connect"
                    options={{ title: "Connect a wallet", presentation: "formSheet", sheetAllowedDetents: [0.55, 0.9], sheetGrabberVisible: true, headerShown: false }}
                  />
                  <Stack.Screen
                    name="amount"
                    options={{ title: "Buy", presentation: "formSheet", sheetAllowedDetents: [0.6], sheetGrabberVisible: true, headerShown: false }}
                  />
                </Stack>
              </Notifications>
            </ToastProvider>
          </ThemeProvider>
        </WalletProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
