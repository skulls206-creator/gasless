# CODING-NOTES — gasless

## What This Project Is
USDT Wallet on the TRON (TRX) Network.

## Tech Stack
- pnpm monorepo
- React + Vite + PWA (vite-plugin-pwa)
- tronweb (TRON blockchain SDK)
- TypeScript (likely)

## Structure
```
/
├── artifacts/
│   ├── tron-wallet/     # Main wallet app
│   ├── api-server/
│   └── mockup-sandbox/
├── lib/
│   ├── db/
│   ├── api-client-react/
│   ├── api-zod/
│   └── api-spec/
└── package.json
```

## Build & Dev
- **Install:** `pnpm install`
- **Build:** `pnpm run build`
- **Typecheck:** `pnpm run typecheck`
- **Dev:** `cd artifacts/tron-wallet && pnpm run dev`

## Deploy
- GitHub Pages via `.github/workflows/deploy.yml`

## TypeScript
- Root: strict: false likely. Enable strict: true if applicable.
- Project references (tsc --build)

## Tests & Lint
- None configured

## Known Gotchas
- pnpm required
- TRON blockchain interactions require TRX for gas fees
- Wallet must handle private keys securely — never log them
- USDT (TRC-20) uses 6 decimal places, not 18 like most ERC-20 tokens
- PWA needs good offline fallback for wallet balance display

## Previous Bugs / Regressions
*(Fill in as they happen)*
