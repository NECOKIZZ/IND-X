// Solana libraries expect these globals.
import "react-native-get-random-values";
import "fast-text-encoding";
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
