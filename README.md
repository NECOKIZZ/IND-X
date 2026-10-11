# IND-X (working name)

A weekly stock league on **Solana**, as a mobile app. The Solana and mobile version of [Median Markets](https://github.com/NECOKIZZ/ETF) (BNB Chain) and [Kickoff Stocks](https://github.com/NECOKIZZ/kickoffstocks) (Robinhood Chain).

- **Creators** build an "ETF": they lock a basket of 3–10 tokenized stocks ([xStocks](https://xstocks.com): AAPLx, NVDAx, SPYx…, with an optional crypto slice of BTC, ETH, SOL and BNB up to 20%) worth at least $10, plus a **$5 USDC ticket**. The locked basket *is* the ETF. Its score is the real return of exactly what was locked, dividends included (xStocks pay them through their on-chain multiplier).
- **Backers** put a $5 ticket on someone's ETF, or **buy the ETF** in one tap (Jupiter swaps, with the creator earning their buy fee).
- **The median** is a ghost team at the round's median return. Only ETFs strictly above the median win; they share every other ticket, split by tickets × accuracy (pari-mutuel: winners are paid only by losers, the platform never plays). **No draws**: landing exactly on the median loses too.
- **Weekly rounds run by themselves**: entries close Monday 9:30am New York (the open), the round ends Friday 4pm (the close). The keeper settles, **pays everyone automatically** (winnings and baskets arrive in your wallet with no claim step), and opens next week's round.

> "ETF" here means an on-chain basket of tokenized stocks, not a regulated fund. Capital is at risk. xStocks are not available to US persons and in some other regions.

## What's here

| Piece | Where | State |
|---|---|---|
| League program (Anchor 1.2) | `programs/league` | ✅ 10 program tests on LiteSVM |
| Settlement engine (median, no draws), rules, team keys | `packages/core` | ✅ shared by server and app |
| Keeper (rounds, prices, settlement, auto-payout) | `server/src/keeper` | ✅ end to end on LiteSVM and a local validator |
| Prices: Jupiter / Pyth × xStocks multiplier | `server/src/prices.ts` | ✅ live-checked |
| API for the app (+ unsigned transactions, relay, push) | `server/src/api` | ✅ |
| Buy the ETF: Jupiter (mainnet), test desk (devnet) | `server/src/jupiter.ts`, `server/src/api/tx.ts` | ✅ test desk tested; Jupiter quotes live-checked |
| Mobile app (Expo, iOS + Android) | `apps/mobile` | ✅ functional, **placeholder brand** |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together and [`docs/RULES.md`](docs/RULES.md) for the game.

## Run it

Needs Node 22+, pnpm 10, and for the program Rust + the Solana (Agave) CLI + Anchor 1.2.1.

```bash
pnpm install
anchor build && node scripts/copy-idl.mjs   # the program (target/deploy/league.so)
pnpm test                                   # engine, settlement, program, backend end to end
pnpm typecheck
```

**Everything offline, no validator** (the chain runs in-process on LiteSVM, 10-minute demo rounds):

```bash
pnpm dev                     # API + keeper on :8787 (LEAGUE_PRICE_SOURCE=demo for offline prices)
pnpm bots --n 8              # demo players: faucet, buy baskets, create and back ETFs
cd apps/mobile && npx expo start   # the app; set EXPO_PUBLIC_API_URL to your machine's IP on a phone
```

**On a local validator**: `pnpm validator` (starts it with the program and sets up test tokens), then
`LEAGUE_CLUSTER=localnet KEEPER_KEYPAIR=~/.config/solana/id.json FAUCET_KEYPAIR=~/.config/solana/id.json LEAGUE_RUN_KEEPER=1 pnpm server`.

**Devnet / mainnet**: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## The app

Expo Router, native tabs (League · Build · Portfolio · Results), live standings around the median line, a 3-step builder, one-tap back/buy, results and leaderboard, push notifications (round open, live, your result), pull-to-refresh, haptics, light and dark mode.

Wallets: **Mobile Wallet Adapter** on Android (Phantom, Solflare, Backpack, Seed Vault), **Phantom** deeplinks on iOS and Android, and a **test wallet** kept on the device for devnet. Brand (name, colors, fonts, logo) is a placeholder in `apps/mobile/src/theme/`.

## License
MIT
