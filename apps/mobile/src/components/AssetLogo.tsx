import { useState } from "react";
import { Image } from "expo-image";
import { View } from "react-native";
import { useColors } from "@/theme";
import { Text } from "./ui";

/** A token's logo; its ticker in a circle when there's no logo or it fails to load. */
export function AssetLogo({ uri, ticker, size = 36 }: { uri?: string | null; ticker: string; size?: number }) {
  const c = useColors();
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.fill }} contentFit="cover" transition={150} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.fill, alignItems: "center", justifyContent: "center" }}>
      <Text v="smallStrong" style={{ fontSize: size * 0.3 }}>
        {ticker.slice(0, 4)}
      </Text>
    </View>
  );
}

/** Overlapping logos of a basket. */
export function LogoStack({ legs, size = 24, max = 4, ring }: { legs: { logo: string | null; ticker: string }[]; size?: number; max?: number; ring?: string }) {
  const c = useColors();
  const border = ring ?? c.surface;
  return (
    <View style={{ flexDirection: "row" }}>
      {legs.slice(0, max).map((l, i) => (
        <View key={i} style={{ marginLeft: i ? -size / 3 : 0, borderRadius: size, borderWidth: 2, borderColor: border }}>
          <AssetLogo uri={l.logo} ticker={l.ticker} size={size} />
        </View>
      ))}
      {legs.length > max ? (
        <View style={{ marginLeft: -size / 3, width: size + 4, height: size + 4, borderRadius: size, backgroundColor: c.fill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: border }}>
          <Text v="label">+{legs.length - max}</Text>
        </View>
      ) : null}
    </View>
  );
}
