import { Platform } from "react-native";

/**
 * The league API. Set EXPO_PUBLIC_API_URL (e.g. in apps/mobile/.env).
 * Release builds default to the hosted API; dev builds to the dev server on
 * this machine (Android emulators reach the host at 10.0.2.2).
 */
const DEFAULT_API = __DEV__ ? (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787") : "https://ind-x-api.onrender.com";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API).replace(/\/$/, "");

/** Deep-link scheme (app.json "scheme"), used for wallet redirects. */
export const SCHEME = "indx";
