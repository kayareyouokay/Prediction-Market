# Kairo frontend architecture

## Backend contract discovered

Public endpoints:

- `GET /markets` returns every `Market`.
- `GET /market?marketId=<id>` returns one market or `null`.

Authenticated endpoints use a Supabase bearer access token. The backend obtains `user_metadata.custom_claims.address`, upserts a database user, and uses that user for all account data:

- `POST /order` accepts `{ marketId, side: "yes" | "no", type: "buy" | "sell", price: integer cents, qty: integer shares }`.
- `POST /split` and `POST /merge` accept `{ marketId, amount }`; amount is implemented as paired-share/collateral-cent quantity.
- `GET /balance`, `GET /positions`, and `POST /history` expose account data.
- `POST /onramp` and `POST /offramp` accept a USD decimal amount and convert it to integer cents server-side.

`Market` stores title, description, resolution description, Yes/No JSON orderbooks, `totalQty`, and optional `resolution`. `Position` stores integer shares by `(user, market, Yes|No)`. `OrderHistory` records only type, price, quantity, user, and market—there are no timestamps. The backend has no market administration, resolution payout, search, category, activity feed, or watchlist APIs. `/sell` is currently an empty endpoint; sell execution is implemented by `POST /order`.

Trading is a transactional crossed limit-order flow. A buy matches asks for its chosen outcome up to the limit; a sell requires an existing corresponding position and matches the opposite book. Unfilled quantity becomes an orderbook entry. Split debits collateral and gives one Yes and one No share; merge burns paired shares and credits collateral. No settlement payout logic is implemented.

## Frontend structure

- `src/lib/types.ts`: typed entities and request/response contracts.
- `src/lib/api.ts`: single typed transport layer, including bearer-token attachment.
- `src/lib/supabase.ts`: lazy Supabase client so public discovery runs without auth configuration.
- `src/App.tsx`: view routing, reusable market, account, trade-ticket, state, table, and feedback components.
- `src/index.css`: dark-first token-like visual system and responsive component styles.

The app uses browser-history routing with no additional routing dependency. Market search, categories, and trending order are intentionally derived from the market feed. Public data is loaded once per view and individual market depth is refreshed every 12 seconds; account data is fetched concurrently and refreshed after funding operations.
