# Rules

## Entering
- **Create**: lock a basket of 3–10 allowed tokens worth at least **$10**, plus a **$5 USDC ticket**.
  - At least 3 of the tokens must be stocks or funds.
  - No token above 50%.
  - Crypto (BTC, ETH) at most 20% in total.
  - Name the ETF (up to 32 bytes) and set a buy fee of 0–2%.
- **Clone**: a basket with the same tokens and the same weights to 1% as an existing ETF joins that team instead of making a new one.
- **Back**: put a $5 ticket on an existing ETF. A team holds at most 20 members besides its creator.
- One entry per wallet per round.

## The week
Entries close **Monday 9:30am New York** (the US open), and the round ends **Friday 4pm** (the close). Baskets are locked in between. They come back to their owners after the round, whatever the result.

## Scoring
- Each ETF scores the **buy-and-hold return of the creator's locked basket**, from start prices (several samples after the open) to end prices (several samples after the close).
- Prices are in USD per raw token, so the xStocks dividend multiplier counts.
- If a scored token has no fresh price in a window, the round is void and everyone is refunded.

## MEDIAN and payouts
With `n` ETFs:
- D = best return − this return.
- k = n//2 + 1, and m = the k-th smallest D.
- **Above MEDIAN** (D < m) wins. **On MEDIAN** draws: the ticket comes back. **Below** loses its ticket.
- If at least half the ETFs tie at the top, those win and nobody draws.
- Fewer than 4 ETFs, or every return equal: the round is void and everyone is refunded.

The pot is the losing tickets minus a **10% take** (5% platform, 5% season pot), plus any boost.
- It is split across winning teams by **team tickets × accuracy**, where accuracy = (1 / (1 + D/m))^6.
- A team's gain is capped at 100× its tickets. Anything left goes back to the season pot, then to losers pro rata.
- If the pot is below 5% of the winning tickets, the season pot tops it up.
- Inside a team, winnings split by ticket, and **the creator takes 10% of backers' winnings**.

## Invalid entries
The keeper checks each basket at the start prices, with drift allowed: up to 55%, at least $9.50, crypto up to 25%. It also checks that the declared weights match the locked amounts within 5 points. An entry that fails is refunded its ticket and its basket. Its backers are refunded too.

## Trust
The keeper computes payouts with open-source code (`packages/core`) and publishes every input (`/v1/rounds/:id/inputs`); the inputs' hash goes on-chain. `/v1/rounds/:id/verify` recomputes it. The program enforces:
- conservation;
- the payout ceiling;
- one payout per entry;
- baskets returned to their owners;
- a void anyone can trigger 3 days after a round the keeper didn't settle.
