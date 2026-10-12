// The Solana Seeker phone. Platform constants can be spoofed, so this only
// changes the UI (Seed Vault first); never gate rewards on it (that needs a
// Seeker Genesis Token check on the server).

import { Platform } from "react-native";

export const isSeeker = (): boolean => Platform.OS === "android" && (Platform.constants as { Model?: string }).Model === "Seeker";
