import { Image } from "expo-image";
import { View } from "react-native";
import { useColors } from "@/theme";
import { Text } from "./ui";

export function AssetLogo({ uri, ticker, size = 36 }: { uri?: string | null; ticker: string; size?: number }) {
  const c = useColors();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceAlt }} contentFit="cover" transition={150} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
      <Text v="smallStrong" style={{ fontSize: size * 0.32 }}>
        {ticker.slice(0, 4)}
      </Text>
    </View>
  );
}

/** Overlapping logos of a basket. */
export function LogoStack({ legs, size = 24, max = 4 }: { legs: { logo: string | null; ticker: string }[]; size?: number; max?: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row" }}>
      {legs.slice(0, max).map((l, i) => (
        <View key={i} style={{ marginLeft: i ? -size / 3 : 0, borderRadius: size, borderWidth: 2, borderColor: c.surface }}>
          <AssetLogo uri={l.logo} ticker={l.ticker} size={size} />
        </View>
      ))}
      {legs.length > max ? (
        <View style={{ marginLeft: -size / 3, width: size + 4, height: size + 4, borderRadius: size, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface }}>
          <Text v="label">+{legs.length - max}</Text>
        </View>
      ) : null}
    </View>
  );
}
