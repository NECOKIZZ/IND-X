# Deploying

## 0. Your own program id
The program keypair is not in git. Before the first deploy:

```bash
anchor keys sync        # writes your program id into lib.rs and Anchor.toml
anchor build && node scripts/copy-idl.mjs
```

## 1. Devnet

```bash
solana config set -ud
solana airdrop 5                                   # or use a devnet faucet
solana-keygen new -o ~/.config/solana/keeper.json  # the keeper's key
solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/keeper.json)
anchor deploy --provider.cluster devnet
KEEPER_KEYPAIR=~/.config/solana/keeper.json pnpm deploy:devnet
git add deployments/devnet.json                    # the server reads it
```

This creates test USDC and test copies of the xStocks (priced by the real ones), initializes the league, registers the tokens and builds the lookup table. The admin keypair is the test tokens' mint authority: give it to the server as `FAUCET_KEYPAIR` for the faucet and the test desk.

## 2. Server

Any Node 22 host (Render, Fly, Railway, a VPS). One process can run both the API and the keeper:

```bash
LEAGUE_CLUSTER=devnet \
RPC_URL=https://<your devnet RPC> \
KEEPER_KEYPAIR='[...json array...]' \
FAUCET_KEYPAIR='[...json array...]' \
LEAGUE_RUN_KEEPER=1 \
LEAGUE_SCHEDULE=weekly \
DATABASE_URL=postgres://... \
pnpm server
```

Use Postgres (`DATABASE_URL`) in production: price samples and published inputs must survive redeploys. For short demo rounds, use `LEAGUE_SCHEDULE=demo:30:60`.

## 3. Mainnet

```bash
anchor deploy --provider.cluster mainnet
KEEPER_KEYPAIR=~/.config/solana/keeper.json pnpm deploy:mainnet   # real USDC + real xStocks
```

Then run the server with `LEAGUE_CLUSTER=mainnet`, a paid RPC, and `JUPITER_API_KEY` (and `PYTH_API_KEY` to score with Pyth). Seed the season pot (`fund_season`) so thin pots get topped up.

Before mainnet:
- Get an audit of the program.
- Check legal and regional restrictions for tokenized stocks.
- Move the upgrade authority and the admin to a multisig (Squads).
- Note: if an xStock issuer ever turns on a transfer hook for its token, set that token disabled (`set_asset`) before the next round.

## 4. The app

```bash
cd apps/mobile
npx eas-cli@latest init                # links an EAS project (needed for push)
EXPO_PUBLIC_API_URL=https://api.your-domain npx eas-cli@latest build --profile development   # MWA needs a dev build
```

Expo Go works for everything except Mobile Wallet Adapter and push. Use the Phantom or test wallet there.
