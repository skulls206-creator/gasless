# Agent Guidelines

- **Surgical changes only** — touch only what the task requires; don't refactor, reformat, or delete adjacent code. If you spot unrelated dead code, mention it but don't remove it.
- **No speculative abstractions** — don't add configurability, flexibility, or error handling for scenarios that don't exist yet. Build exactly what was asked, nothing more.
- **Test wallet allowed** — creating a throwaway Gasless wallet during debugging is permitted. Account number and private key are ephemeral test data, never commit them.

# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a fully client-side TRON USDT (TRC-20) gasless wallet web app.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (backend — minimal use for this project)
- **Database**: PostgreSQL + Drizzle ORM (not yet used by wallet app)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (backend)
│   ├── tron-wallet/        # TRON USDT Wallet (main frontend app, served at /)
│   └── mockup-sandbox/     # UI component sandbox
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TRON USDT Wallet (`artifacts/tron-wallet`)

A fully browser-side gasless USDT (TRC-20) wallet on the TRON network.

### Features
- **Mullvad-style passwordless auth**: 20-digit account number (XXXXX-XXXXX-XXXXX-XXXXX) used to AES-256 encrypt the private key locally. No server. No email.
- **Wallet creation & import**: Generate a new TRON keypair or import via private key
- **Dashboard**: Live USDT balance + Bandwidth/Energy resource display
- **Send USDT**: Real-time gasless fee preview (Free ✓ or ~1 TRX warning)
- **Receive**: QR code + copyable wallet address
- **Transaction History**: TRC-20 transaction list from TronGrid API
- **Backup**: Private key reveal behind account number re-entry
- **Pay tab**: Peer.xyz widget integration with wallet address pre-filled
- **Gasless education modal**: Auto-shown on first send, always accessible via info icon

### Key Files
- `src/context/WalletContext.tsx` — Auth, encryption, wallet state
- `src/lib/tron.ts` — TronWeb integration, TronGrid API calls
- `src/hooks/use-tron.ts` — React Query hooks for balance/resources/tx history
- `src/pages/` — All page components (Welcome, CreateAccount, Login, Dashboard, Send, Receive, History, Backup, Pay, ImportWallet)
- `src/components/ui/GaslessModal.tsx` — Bandwidth/Energy education modal

### PWA & Push Notifications
- **Service worker** (`src/sw.ts`): Workbox precache + push event handler + notificationclick
- **VitePWA** (`vite.config.ts`): `injectManifest` strategy pointing at `src/sw.ts`
- **Notification bell** in AppLayout header — subscribe/unsubscribe to push (Radix Tooltip shows state)
- **Install banner** (`InstallPWA.tsx`): slides up on `beforeinstallprompt`, Spring-animated with Framer Motion
- **Backend poller** (`artifacts/api-server/src/routes/push.ts`): every 30s per subscribed address, checks TronGrid for new incoming TRC-20 txs, sends Web Push notification, dedupes by `last_seen_tx`
- VAPID keys: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` env vars

### Context Menus (Radix ContextMenu)
- **Receive page**: right-click address card → Copy address / View on Tronscan
- **History page**: right-click transaction row → Copy TX hash / Copy address / View on Tronscan

### Dependencies
- `tronweb` — TRON blockchain interaction
- `crypto-js` — AES-256 encryption of private key
- `qrcode.react` — QR code generation
- `framer-motion` — Page animations
- `vite-plugin-pwa` — PWA manifest + service worker injection
- `web-push` (api-server) — VAPID-based Web Push delivery

### Backend API (`artifacts/api-server`)
- `GET /api/tron/balance/:address` — proxy to TronGrid (prevents mobile rate-limiting)
- `GET /api/push/vapid-key` — returns VAPID public key for client subscription
- `POST /api/push/subscribe` — save push subscription (address + PushSubscription JSON)
- `POST /api/push/unsubscribe` — remove subscription by endpoint
- `POST /api/wallet/sync` — cloud backup (SHA-256 hash of account number + encrypted PK)
- `GET /api/wallet/recover/:hash` — retrieve encrypted PK for cloud recovery

### Database Tables
- `wallet_backups` — cloud encrypted PK backup keyed by account hash
- `push_subscriptions` — Web Push subscriptions with `last_seen_tx` for dedup

### TronGrid API (proxied via backend)
- `https://api.trongrid.io`
  - GET `/v1/accounts/{address}` — account resources (bandwidth, energy)
  - GET `/v1/accounts/{address}/transactions/trc20` — TRC-20 tx history
- USDT contract: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
