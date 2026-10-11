# Architecture

```
 phone (Expo app)                server (Node)                         Solana
 ───────────────                 ─────────────                         ──────
 League / Build / Portfolio  ──► API (Hono)  ── reads ───────────────► league program
   │  GET views                    │  views: standings, projections      (Anchor)
   │  POST /v1/tx/* → TxPlan  ◄────┤  tx plans: unsigned v0 transactions  config · registry
   │  wallet signs (MWA/Phantom)   │                                     rounds · teams · entries
   └► POST /v1/tx/send  ─────────► relay ──────────────────────────────► USDC + xStock vaults
                                   │
 push (Expo) ◄──────────────────── keeper (tick loop) ── open/settle/pay ─┘
                                   │  prices: Jupiter | Pyth × multiplier
                                   └  store: files | Postgres (samples, published inputs, push tokens)
```

## The program (`programs/league`)

Accounts (PDAs):
- `config` holds the admin, keeper, stake mint (USDC), season pot and platform balance. It also **owns every vault**: the USDC ticket vault and one vault per basket token (associated token accounts of the config PDA).
- `registry` lists the tokens a basket may hold (xStocks are Token-2022; crypto can be classic Token) and flags the crypto slice.
- `round [id]` holds the times, ticket size, cap, totals, boost, the settlement totals and the hash of the published inputs.
- `team [round, team_key]` is one ETF: captain, name, buy fee, legs (mint + weight), member count. `team_key` = sha256 of the sorted (mint, weight rounded to 1%) rows, so identical baskets merge into one team (clones).
- `entry [round, wallet]` is one ticket: index (entry order), team key, locked basket (raw amounts), payout. It is closed (rent back to the wallet) once paid and the basket is back.

Instructions: `initialize`, `set_asset`, `set_keeper/admin/paused`, `fund_season`, `withdraw_platform`, `open_round`, `enter_creator` (basket legs as remaining accounts; a 10-token basket fits in one transaction with the league's address lookup table), `enter_backer`, `boost_round`, `settle_begin` / `settle_write` (batches) / `settle_finish`, `void_round`, `claim` and `return_basket` (both **permissionless**: money and tokens only ever go to the entry's owner, so the keeper pays everyone out).

What the program enforces (the keeper is trusted only to compute the payouts):
- **Conservation**: Σ payouts + platform + season_in = Σ stakes + season_out + boost, checked at `settle_begin`, and `settle_finish` only passes when every entry has exactly one payout written and they add up to that total.
- **Ceiling**: no payout above stake × (1 + cap × (1 + max_backers)) + boost.
- The season pot can't go negative.
- **Settle epochs**: a restarted settlement invalidates payouts written under the old one.
- Baskets always go back to their owner, whatever the result. Legs return one by one, so a paused token doesn't block the others.
- **Liveness**: 3 days after the round ends, anyone can void an unsettled round; everyone gets their ticket and basket back.

Not enforced on-chain (the keeper refunds an entry that breaks them): the $10 minimum, the 50% / 20% crypto caps, and the declared weights matching the locked amounts (within 5 points at the start prices).

## Settlement (`packages/core`)

`engine.ts` is the shared engine from the earlier versions: D = best return − return, k = n//2 + 1, m = the k-th smallest D, the median at D = m. Only teams strictly above the median win (2·D < 2·D_median): no draws, and the round is void (`NoneAboveMedian`) if nobody is above. Then accuracy (1/(1+D/m))^6, a 10% take (half platform, half season pot), thin-pot top-up, a 100× gain cap, the creator's 10% of backers' gains.

`settlement.ts` turns on-chain entries plus price snapshots into one payout per entry, along with the **published inputs** (prices, baskets, statuses, payouts). Their sha256 goes on-chain. `recomputeFromInputs` rebuilds the payouts from the published JSON, and `GET /v1/rounds/:id/verify` does exactly that.

Prices: a snapshot is the mean of several samples taken in a window after the open (start) and after the close (end). Value = USD per whole **raw** token = UI price × the token's ScaledUiAmount multiplier, so dividends and splits count as returns. A token that is missing or not trading in either window voids the round (everyone refunded).

## Keeper (`server/src/keeper`)

`tick()` runs every 30s and does whatever is due, so restarts are safe:
- No open round: open one. Weekly means Monday 9:30am to Friday 4pm New York; `demo:<entry>:<run>` is in minutes.
- After entries close: take start samples, then hourly chart samples.
- After the end: take end samples, settle (publish the inputs, write the payouts), then distribute: claim plus return_basket for every entry.
- Notifications (Expo push) on round open, round live and each player's result.

## API (`server/src/api`)

Read endpoints compute what the app shows:
- **open**: a preview, ranked by each basket's last 24h.
- **live**: projected with the engine "as if the round ended now".
- **settled**: final, from the published inputs.

Write endpoints return a `TxPlan` of unsigned v0 transactions (with the lookup table), already checked against round state, balances and basket rules, so the wallet never signs something that would fail. `POST /v1/tx/send` relays signed transactions, so the app needs no RPC.

Buying an ETF: on mainnet, one Jupiter swap per leg, plus the creator's fee as a USDC transfer. On test clusters, the **test desk** sells test tokens at live prices (the server co-signs as mint authority).

## The app (`apps/mobile`)

- Expo SDK 57, Expo Router with native tabs, TanStack Query (polling live screens), react-native-svg charts.
- The design tokens are the only place colors, type and spacing live (`src/theme`), so the brand drops in there.
- Wallets (`src/wallet`):
  - MWA on Android. Needs a development build.
  - Phantom deeplinks: an encrypted connect/sign round-trip on the `indx://` scheme.
  - A device test wallet for devnet.

## Clusters

| | program | stake | basket tokens | prices |
|---|---|---|---|---|
| `lite` | in-process LiteSVM | test USDC | test copies of xStocks | Jupiter (real) or demo |
| `localnet` | solana-test-validator | test USDC | test copies | Jupiter or demo |
| `devnet` | deployed | test USDC (faucet) | test copies (faucet / test desk) | Jupiter (real xStock prices) |
| `mainnet` | deployed | USDC | real xStocks | Jupiter or Pyth |
