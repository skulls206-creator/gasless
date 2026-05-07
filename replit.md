# Agent Guidelines

- **Surgical changes only** — touch only what the task requires; don't refactor, reformat, or delete adjacent code. If you spot unrelated dead code, mention it but don't remove it.
- **No speculative abstractions** — don't add configurability, flexibility, or error handling for scenarios that don't exist yet. Build exactly what was asked, nothing more.
- **Test wallet allowed** — creating a throwaway Gasless wallet during debugging is permitted. Account number and private key are ephemeral test data, never commit them.

## Communication style

- **Kill the glaze** — no "great question", "you're absolutely right", "fascinating perspective", premise validation, or apologizing for disagreeing. Skip the warm-up; lead with the answer.
- **No flattery, no filler** — accuracy is the success metric, not approval.
- **Push back when I'm wrong** — say so immediately and lead with the strongest counterargument. Don't capitulate under pushback unless I provide new evidence or a better argument; if my pushback is just emphasis, restate your position.
- **Verify your own work** — double-check facts, txids, addresses, numbers, file paths, line numbers, and citations before stating them. If you don't know something, say "I don't know" — never invent it.
- **Don't anchor on my numbers** — generate your own estimate first, then compare to mine. If they disagree, say so.
- **Explicit confidence** — when stating something non-trivial, mark it `high` / `moderate` / `low` / `unknown` so I know what to trust.
- **Bad news delivered clean** — if a fix didn't work, a tx reverted, an approach is dead-ended, or scope is unrealistic, say so plainly. No softening, no disclaimers.
- **Tone: precise, not strident** — pointed and direct is fine; pedantic, preachy, or hedging is not.

# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a fully client-side TRON USDT (TRC-20) gasless wallet web app.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (backend)
- **Database**: PostgreSQL + Drizzle ORM (not yet used by wallet app)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Build**: esbuild / tsx (API), Vite (frontend)

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
- **Dashboard**: Live USDT balance + Bandwidth/Energy resource display with warning if resources low
- **Send USDT**: Real-time gasless fee preview ("Free ✓" when sponsor/rental active, "~1–3 TRX" otherwise). QR scan camera button + ?to= query-param pre-fill. Cycling progress labels during pending.
- **Receive**: QR code encodes full payment-link URL + shareable payment link card with Copy/Share buttons
- **Transaction History**: TRC-20 transaction list from backend proxy, infinite-scroll "Load More" pagination via fingerprint cursor
- **Backup**: Private key reveal behind account number re-entry
- **Pay tab**: Peer.xyz widget integration
- **PayLink** (`/pay/:address`): Public route — logged-in users are redirected to /send?to=; logged-out users see a CTA with "Log In & Send" / "Create Wallet & Send"
- **QRScanner**: Full-screen camera modal. Extracts TRON address from plain addresses, `tron:` URI, payment-link URLs (`/pay/Txxxxx`), and `?to=` query params.
- **Gasless education modal**: Auto-shown on first send, always accessible via info icon

### Key Files
- `src/context/WalletContext.tsx` — Auth, encryption, wallet state
- `src/lib/tron.ts` — TronWeb integration (sign only; all chain reads go via backend proxy)
- `src/hooks/use-tron.ts` — React Query hooks for balance/resources/tx history (all proxied)
- `src/pages/` — Welcome, CreateAccount, Login, Dashboard, Send, Receive, History, Backup, Pay, ImportWallet, PayLink
- `src/components/ui/QRScanner.tsx` — @zxing/browser camera scanner with smart address extraction
- `src/components/ui/GaslessModal.tsx` — Bandwidth/Energy education modal

### PWA & Push Notifications
- **Service worker** (`src/sw.ts`): Workbox precache + push event handler + notificationclick
- **VitePWA** (`vite.config.ts`): `injectManifest` strategy pointing at `src/sw.ts`
- **Notification bell** in AppLayout header — subscribe/unsubscribe to push
- **Install banner** (`InstallPWA.tsx`): slides up on `beforeinstallprompt`
- **Backend poller** (`artifacts/api-server/src/routes/push.ts`): every 30s per subscribed address, checks TronGrid for new incoming TRC-20 txs, sends Web Push notification, dedupes by `last_seen_tx`
- VAPID keys: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` env vars

### Context Menus (Radix ContextMenu)
- **Receive page**: right-click address card → Copy address / View on Tronscan
- **History page**: right-click transaction row → Copy TX hash / Copy address / View on Tronscan

### Frontend Dependencies
- `tronweb` — TRON blockchain interaction (signing only in browser)
- `crypto-js` — AES-256 encryption of private key
- `qrcode.react` — QR code generation
- `@zxing/browser` + `@zxing/library` — QR code camera scanning
- `framer-motion` — Page animations
- `vite-plugin-pwa` — PWA manifest + service worker injection
- `web-push` (api-server) — VAPID-based Web Push delivery
- `@tanstack/react-query` — Data fetching + caching
- `wouter` — Client-side routing

## Backend API (`artifacts/api-server`)

### Public Endpoints (no auth required)
- `GET /api/tron/balance/:address` — proxy to TronGrid balance query
- `GET /api/tron/resources/:address` — proxy to TronGrid account resources (energy, bandwidth)
- `GET /api/tron/transactions/:address?fingerprint=&limit=` — paginated TRC-20 tx history proxy
- `POST /api/tron/build-transfer` — builds unsigned USDT transfer tx server-side
- `GET /api/sponsor-info` — safe public status: `{ configured, active, estimatedSendsRemaining }`
- `GET /api/config` — fee config: `{ feeAmount, feeRecipient, feesEnabled }`
- `POST /api/gasless-send` — broadcast signed tx + rent/delegate energy from sponsor
- `GET /api/push/vapid-key` — returns VAPID public key for client subscription
- `POST /api/push/subscribe` — save push subscription
- `POST /api/push/unsubscribe` — remove subscription by endpoint

### Admin Endpoints (protected by `X-Admin-Secret` header or `?secret=` query param when `ADMIN_SECRET` env var is set)
- `GET /api/admin/status` — full sponsor wallet status + rental balance
- `POST /api/admin/stake` — stake TRX for energy from the sponsor wallet

### Key Library Files
- `src/lib/sponsor.ts` — Sponsor wallet: delegate energy, top-up TRX, stake, status
- `src/lib/energyRent.ts` — On-demand energy rental (Feee.io + EnergyRentPro)
- `src/routes/gasless.ts` — `/api/gasless-send` with 3-tier energy priority
- `src/routes/tron.ts` — TronGrid proxy routes
- `src/routes/push.ts` — Push notification routes + poller

### Energy Sponsorship (3-tier priority on each send)
1. **On-demand rental** (Feee.io or EnergyRentPro) — only active when `ENERGY_RENT_API_KEY` is set
2. **Staked delegation** — sponsor's own frozen TRX pool (free if available)
3. **TRX top-up fallback** — send 2 TRX to user so they can pay their own fee

### Energy Rental Providers
Rental is **only attempted** when `ENERGY_RENT_API_KEY` is set. Without it, tiers 2 and 3 handle sponsorship.

**Feee.io** (`ENERGY_RENT_PROVIDER=feee`, default):
- POST `https://feee.io/open/v3/order/create` (5-minute fixed rental, cheapest)
- Auth: `key` header = `ENERGY_RENT_API_KEY`
- Body: `{ resource_type: 1, receive_address, resource_value: 65000 }`
- Balance: GET `https://feee.io/open/v2/api/query` → `data.trx_money`
- Cost: ~0.013 TRX per 65,000-energy send (energy arrives in 3–6 s)

**EnergyRentPro** (`ENERGY_RENT_PROVIDER=erp`, requires `ENERGY_RENT_API_KEY`):
- GET `https://api.tronenergyrent.com/place-energy-order?apiKey=...&period=1h&energyAmount=...&destinationAddress=...`
- Balance: GET `/get-balance?apiKey=...` → `payload.balanceTrx`
- Cost: ~2.86 TRX per 65,000 energy (1-hour rental, 44 SUN/energy)
- Duration controlled by `ENERGY_RENT_DURATION_HOURS` (default: `"1"`)

### Env Vars
| Variable | Required | Description |
|---|---|---|
| `SPONSOR_PRIVATE_KEY` | Yes | Sponsor wallet private key |
| `SPONSOR_ADDRESS` | Yes | Sponsor wallet base58 address |
| `ADMIN_SECRET` | No | Protects `/api/admin/*` endpoints |
| `TRONGRID_API_KEY` | No | TronGrid Pro API key (reduces 429s) |
| `ENERGY_RENT_API_KEY` | No | Activates rental tier; required for both `feee` and `erp` |
| `ENERGY_RENT_PROVIDER` | No | `"feee"` (default) or `"erp"` |
| `ENERGY_RENT_DURATION_HOURS` | No | Rental duration for `erp` provider (default: `"1"`) |
| `FEE_RECIPIENT_ADDRESS` | No | Override fee recipient (defaults to SPONSOR_ADDRESS) |
| `VAPID_PUBLIC_KEY` | No | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | No | Web Push VAPID private key |
| `VAPID_EMAIL` | No | Web Push VAPID contact email |

### Database Tables
- `wallet_backups` — cloud encrypted PK backup keyed by account hash
- `push_subscriptions` — Web Push subscriptions with `last_seen_tx` for dedup

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
