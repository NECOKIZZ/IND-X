import { Stack } from "expo-router";
import { useColors } from "@/theme";

export default function Layout() {
  const c = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
