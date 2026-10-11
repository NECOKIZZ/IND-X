import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// SecureStore on device; localStorage on web (dev only).
export const store = {
  async get(k: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(k) ?? null;
    return SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string) {
    if (Platform.OS === "web") return globalThis.localStorage?.setItem(k, v);
    await SecureStore.setItemAsync(k, v);
  },
  async del(k: string) {
    if (Platform.OS === "web") return globalThis.localStorage?.removeItem(k);
    await SecureStore.deleteItemAsync(k);
  },
};
