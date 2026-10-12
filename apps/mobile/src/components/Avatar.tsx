// A player's avatar: one of the 10 IndX blobs, picked from the wallet address
// so it stays the same everywhere.

import { Image } from "expo-image";
import { View } from "react-native";

const SET = [
  require("../../assets/avatars/1.jpg"),
  require("../../assets/avatars/2.jpg"),
  require("../../assets/avatars/3.jpg"),
  require("../../assets/avatars/4.jpg"),
  require("../../assets/avatars/5.jpg"),
  require("../../assets/avatars/6.jpg"),
  require("../../assets/avatars/7.jpg"),
  require("../../assets/avatars/8.jpg"),
  require("../../assets/avatars/9.jpg"),
  require("../../assets/avatars/10.jpg"),
];

export function avatarIndex(wallet: string) {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  return h % SET.length;
}

export function Avatar({ wallet, size = 52 }: { wallet: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#1C2224" }}>
      <Image source={SET[avatarIndex(wallet)]} style={{ width: size, height: size }} contentFit="cover" />
    </View>
  );
}
