#!/usr/bin/env bash
# A local Solana validator with the league program preloaded, set up with
# test tokens. Then run the server against it:
#   LEAGUE_CLUSTER=localnet KEEPER_KEYPAIR=~/.config/solana/id.json \
#   FAUCET_KEYPAIR=~/.config/solana/id.json LEAGUE_RUN_KEEPER=1 pnpm server
set -euo pipefail
cd "$(dirname "$0")/.."
PROGRAM_ID=$(solana-keygen pubkey target/deploy/league-keypair.json)
test -f target/deploy/league.so || anchor build
test -f ~/.config/solana/id.json || solana-keygen new --no-bip39-passphrase -s -o ~/.config/solana/id.json
solana-test-validator --reset --quiet --ledger .anchor/test-ledger --bpf-program "$PROGRAM_ID" target/deploy/league.so &
VALIDATOR=$!
trap 'kill $VALIDATOR' EXIT
sleep 8
solana -ul airdrop 100 >/dev/null
pnpm tsx scripts/deploy.ts localnet
echo "validator running (pid $VALIDATOR). Ctrl-C to stop."
wait $VALIDATOR
