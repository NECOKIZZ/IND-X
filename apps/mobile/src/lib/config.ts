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

/**
 * Privy (Google, email and passkey sign-in with an embedded Solana wallet).
 * The app id and client id are public; the app secret never goes in the app.
 */
export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "cmv4tg865001c0flbllafphro";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || "client-WY6efz3oLeZxE1EKb7Z8jEU2DyF3MB5kqQEMSC6yJJVTj";
/** Where the passkey association lives (/.well-known/assetlinks.json). */
export const PASSKEY_DOMAIN = "https://ind-x-app.onrender.com";
