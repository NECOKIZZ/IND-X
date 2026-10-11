# Mobile app

Expo SDK 57 · Expo Router (native tabs) · TanStack Query · react-native-svg.

```bash
[ -f .env ] || cp .env.example .env   # never overwrites an existing .env; set EXPO_PUBLIC_API_URL
npx expo start                  # Expo Go: Phantom or the test wallet
npx expo run:android            # development build: + Mobile Wallet Adapter, push
```

- `src/app/`: screens (League, Build, Portfolio, Results, ETF, round, connect, buy, rules)
- `src/theme/`: **placeholder brand**. Name, colors, fonts and copy live here only.
- `src/wallet/`: Mobile Wallet Adapter (Android), Phantom deeplinks, device test wallet
- `src/lib/`: API client (types from `@indx/core`), queries, notifications
