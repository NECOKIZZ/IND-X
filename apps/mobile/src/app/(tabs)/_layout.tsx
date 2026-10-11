// Tabs with the floating glass bar (same look on iOS, Android and web).
import { Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/TabBar";
import { useColors } from "@/theme";

export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="portfolio" />
      <Tabs.Screen name="results" />
    </Tabs>
  );
}
