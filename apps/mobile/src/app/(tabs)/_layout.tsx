import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColors } from "@/theme";

export default function TabLayout() {
  const c = useColors();
  return (
    <NativeTabs backgroundColor={c.bg} indicatorColor={c.surfaceAlt} labelStyle={{ selected: { color: c.text } }} tintColor={c.accent}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>League</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "trophy", selected: "trophy.fill" }} md="emoji_events" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Label>Build</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} md="add_circle" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <NativeTabs.Trigger.Label>Portfolio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} md="pie_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="results">
        <NativeTabs.Trigger.Label>Results</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "list.number", selected: "list.number" }} md="leaderboard" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
