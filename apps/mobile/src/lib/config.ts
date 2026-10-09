import { Platform } from "react-native";

/**
 * The league API. Set EXPO_PUBLIC_API_URL (e.g. in apps/mobile/.env).
 * Defaults to the dev server on this machine (Android emulators reach the
 * host at 10.0.2.2).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787")).replace(/\/$/, "");

/** Deep-link scheme (app.json "scheme"), used for wallet redirects. */
export const SCHEME = "indx";
