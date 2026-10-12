import { Platform } from "react-native";

/**
 * The league servers. EXPO_PUBLIC_API_URL is the testnet one (release builds
 * default to the hosted API; dev builds to the dev server on this machine,
 * which Android emulators reach at 10.0.2.2). EXPO_PUBLIC_MAINNET_API_URL is
 * the mainnet one; until it's set, mainnet shows as coming soon.
 */
const DEFAULT_API = __DEV__ ? (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787") : "https://ind-x-api.onrender.com";
export const TESTNET_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API).replace(/\/$/, "");
export const MAINNET_API_URL = process.env.EXPO_PUBLIC_MAINNET_API_URL ? process.env.EXPO_PUBLIC_MAINNET_API_URL.replace(/\/$/, "") : null;

/** Deep-link scheme (app.json "scheme"), used for wallet redirects. */
export const SCHEME = "indx";
