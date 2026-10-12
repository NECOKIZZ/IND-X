export type WalletKind = "mwa" | "phantom" | "dev" | "privy";

/** A wallet that signs the server's transaction plans (base64 v0 transactions). */
export interface WalletAdapter {
  kind: WalletKind;
  label: string;
  /** Connect (asks the user); returns the base58 address. */
  connect(): Promise<string>;
  /** A previous session, without asking the user, if there is one. */
  restore(): Promise<string | null>;
  disconnect(): Promise<void>;
  /** Signs every transaction in one approval; returns them signed (base64). */
  signTransactions(txs: string[]): Promise<string[]>;
}

export type Chain = "solana:mainnet" | "solana:devnet";
