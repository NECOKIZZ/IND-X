// The four tabs, swipeable left and right, with the floating glass bar
// (same look on iOS, Android and web).
import { Redirect } from "expo-router";
import TopTabs, { type MaterialTopTabBarProps } from "expo-router/js-top-tabs";
import { FloatingTabBar } from "@/components/TabBar";
import { useColors } from "@/theme";
import { useWallet } from "@/wallet/WalletProvider";

export default function TabLayout() {
  const c = useColors();
  const { ready, address } = useWallet();
  // Signed-in only: everything in IndX is tied to your wallet.
  if (ready && !address) return <Redirect href="/welcome" />;
  return (
    <TopTabs
      tabBarPosition="bottom"
      tabBar={(props: MaterialTopTabBarProps) => <FloatingTabBar state={props.state} navigation={props.navigation} />}
      screenOptions={{ sceneStyle: { backgroundColor: c.bg }, lazy: true }}
      style={{ backgroundColor: c.bg }}
    >
      <TopTabs.Screen name="(home)" />
      <TopTabs.Screen name="create" />
      <TopTabs.Screen name="portfolio" />
      <TopTabs.Screen name="results" />
    </TopTabs>
  );
}
