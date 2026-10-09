// Web (development preview): JS tabs instead of native ones.
import { Tabs } from "expo-router";
import { useColors } from "@/theme";

export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border } }}>
      <Tabs.Screen name="(home)" options={{ title: "League" }} />
      <Tabs.Screen name="create" options={{ title: "Build" }} />
      <Tabs.Screen name="portfolio" options={{ title: "Portfolio" }} />
      <Tabs.Screen name="results" options={{ title: "Results" }} />
    </Tabs>
  );
}
