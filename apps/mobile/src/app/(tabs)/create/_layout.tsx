import { Stack } from "expo-router";
import { useColors } from "@/theme";

export default function Layout() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false, headerLargeTitleShadowVisible: false, headerStyle: { backgroundColor: c.bg }, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="index" options={{ title: "Build an ETF" }} />
    </Stack>
  );
}
