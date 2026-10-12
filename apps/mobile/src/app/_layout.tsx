import "@/lib/polyfills";
import { useEffect, type ReactNode } from "react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppearanceProvider, useAppearance, useColors } from "@/theme";
import { ToastProvider } from "@/components/Toast";
import { WalletProvider, useWallet } from "@/wallet/WalletProvider";
import { useNotifications } from "@/lib/notifications";
import { useAppFonts } from "@/theme/fonts";
import { Splash, useSplash } from "@/components/Splash";
import { onReload, useNetworkReady } from "@/lib/network";
import { PrivyRoot } from "@/wallet/privy";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

function Notifications({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  useNotifications(address);
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  );
}

function App() {
  const { scheme } = useAppearance();
  const c = useColors();
  const nav = scheme === "dark" ? DarkTheme : DefaultTheme;
  const fontsReady = useAppFonts();
  const networkReady = useNetworkReady();
  const splash = useSplash();
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);
  const { again } = splash;
  useEffect(
    () =>
      onReload(() => {
        again();
        queryClient.resetQueries();
      }),
    [again],
  );
  if (!fontsReady || !networkReady) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PrivyRoot>
        <WalletProvider>
          <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: c.bg, card: c.bg, text: c.text, primary: c.text, border: c.border } }}>
            <ToastProvider>
              <Notifications>
                <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: "minimal", contentStyle: { backgroundColor: c.bg } }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="signin" options={{ presentation: "formSheet", sheetAllowedDetents: [0.5], sheetGrabberVisible: true, headerShown: false }} />
                  <Stack.Screen name="email" options={{ presentation: "formSheet", sheetAllowedDetents: [0.6], sheetGrabberVisible: true, headerShown: false }} />
                  <Stack.Screen name="send" options={{ presentation: "formSheet", sheetAllowedDetents: [0.92], sheetGrabberVisible: true, headerShown: false }} />
                  <Stack.Screen name="receive" options={{ presentation: "formSheet", sheetAllowedDetents: [0.6], sheetGrabberVisible: true, headerShown: false }} />
                  <Stack.Screen name="tag" options={{ presentation: "formSheet", sheetAllowedDetents: [0.6], sheetGrabberVisible: true, headerShown: false }} />
                  <Stack.Screen name="etf/[round]/[key]" options={{ headerShown: false }} />
                  <Stack.Screen name="round/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="rules" options={{ headerShown: false, presentation: "modal" }} />
                  <Stack.Screen
                    name="connect"
                    options={{ title: "Connect a wallet", presentation: "formSheet", sheetAllowedDetents: [0.55, 0.9], sheetGrabberVisible: true, headerShown: false }}
                  />
                  <Stack.Screen
                    name="amount"
                    options={{ title: "Buy", presentation: "formSheet", sheetAllowedDetents: [0.85], sheetGrabberVisible: true, headerShown: false }}
                  />
                </Stack>
                {splash.show ? <Splash onDone={splash.done} /> : null}
              </Notifications>
            </ToastProvider>
          </ThemeProvider>
        </WalletProvider>
        </PrivyRoot>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
