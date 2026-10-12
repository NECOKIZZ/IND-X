// The tokens a basket can hold on Solana mainnet: xStocks (Backed's
// tokenized stocks and ETFs, Token-2022, 8 decimals, with a ScaledUiAmount
// multiplier for dividends and splits) plus a crypto slice: BTC, ETH, SOL,
// BNB and SKR (Seeker), up to 20% of a basket in total.
//
// Pyth feed ids are the token's own feed (e.g. Crypto.AAPLX/USD) where Pyth
// has one; the keeper uses Jupiter's price API by default and Pyth Hermes
// when PYTH_API_KEY is set.

export type AssetKind = "stock" | "etf" | "commodity" | "crypto";

export interface AssetInfo {
  symbol: string;   // token symbol, e.g. AAPLx
  ticker: string;   // underlying, e.g. AAPL
  name: string;
  kind: AssetKind;
  mint: string;
  decimals: number;
  token2022: boolean;
  /** Pyth price feed id (hex, no 0x), when Pyth has one for this token. */
  pyth?: string;
  logo?: string;
}

const XS = "https://xstocks-metadata.backed.fi/logos/tokens";
const x = (ticker: string, name: string, mint: string, pyth?: string, kind: AssetKind = "stock"): AssetInfo => ({
  symbol: `${ticker}x`,
  ticker,
  name,
  kind,
  mint,
  decimals: 8,
  token2022: true,
  pyth,
  logo: `${XS}/${ticker}x.png`,
});

export const MAINNET_ASSETS: AssetInfo[] = [
  x("AAPL", "Apple", "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675"),
  x("MSFT", "Microsoft", "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", "bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5"),
  x("NVDA", "NVIDIA", "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f"),
  x("GOOGL", "Alphabet", "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", "b911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e"),
  x("AMZN", "Amazon", "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", "7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8"),
  x("META", "Meta", "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", "bf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900"),
  x("TSLA", "Tesla", "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362"),
  x("NFLX", "Netflix", "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL", "02a67e6184e6c9dd65e14745a2a80df8b2b3d2ca91b4b191404936003d9929ae"),
  x("AVGO", "Broadcom", "XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo"),
  x("MU", "Micron", "XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav", "0ce20662c616102659948a2e6ccf7ce05c930366af42b71240086eafb7cfa860"),
  x("PLTR", "Palantir", "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4"),
  x("COIN", "Coinbase", "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", "641435d5dffb5311140b480517c79986d8488d5cf08a11eec53b83ad02cab33f"),
  x("HOOD", "Robinhood", "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", "dd49a9ac6df5cbfa9d8fc6371f7ae927a74d5c6763c1c01b4220d70314c647f9"),
  x("CRCL", "Circle", "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", "c13184461c0c80d98ffcd89be627c2220b94a96c7c67f0c4b16bc12fd3b17758"),
  x("MSTR", "Strategy", "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", "53f95ba4e23ed15ea56083e2ee9a5eec48055d6f59033d4bb95f1ca2a2349c28"),
  x("MCD", "McDonald's", "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2", "27cac3c00ed32285b8686611bbc4a654279c1ea11ab4dc90822c2edd20734bca"),
  x("BRK.B", "Berkshire Hathaway", "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x"),
  x("GME", "GameStop", "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc"),
  x("SPY", "S&P 500 ETF", "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", "2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14", "etf"),
  x("QQQ", "Nasdaq 100 ETF", "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", "178a6f73a5aede9d0d682e86b0047c9f333ed0efe5c6537ca937565219c4054d", "etf"),
  x("GLD", "Gold ETF", "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", "e7d1138d0083368634087268c64b7bea0b4101a6365f83915cba9e76a8364b96", "commodity"),
  {
    symbol: "cbBTC",
    ticker: "BTC",
    name: "Bitcoin",
    kind: "crypto",
    mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    decimals: 8,
    token2022: false,
    pyth: "2817d7bfe5c64b8ea956e9a26f573ef64e72e4d7891f2d6af9bcc93f7aff9a97",
    logo: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  },
  {
    symbol: "ETH",
    ticker: "ETH",
    name: "Ether",
    kind: "crypto",
    mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    decimals: 8,
    token2022: false,
    pyth: "9d4294bbcd1174d6f2003ec365831e64cc31d9f6f15a2b85399db8d5000960f6",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
  },
  {
    // Wrapped SOL: on mainnet the app wraps the wallet's SOL when locking.
    symbol: "SOL",
    ticker: "SOL",
    name: "Solana",
    kind: "crypto",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    token2022: false,
    pyth: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  {
    symbol: "BNB",
    ticker: "BNB",
    name: "BNB",
    kind: "crypto",
    mint: "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa",
    decimals: 8,
    token2022: false,
    pyth: "2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa/logo.png",
  },
  {
    // Seeker (SKR): Solana Mobile's token. Priced by Jupiter.
    symbol: "SKR",
    ticker: "SKR",
    name: "Seeker",
    kind: "crypto",
    mint: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3",
    decimals: 6,
    token2022: false,
    logo: "https://r2.solanamobiledappstore.com/skr/seeker.png",
  },
];

/** The native SOL mint (wrapped SOL). */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

/** USDC on Solana mainnet: the ticket token. */
export const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

/** The S&P 500 benchmark shown next to ETF charts. */
export const BENCHMARK_TICKER = "SPY";
