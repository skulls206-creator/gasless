# AGENTS.md — Rules for AI builders working on Gasless

This file is the contract between every AI agent (Replit Agent, Codex,
Cursor, Claude Code, etc.) and the human owner. **Read it before any
edit.** Update it when you learn a new convention.

## Project at a glance

- **Gasless** — non-custodial PWA wallet for TRON USDT (TRC-20).
- **Auth**: 20-digit Mullvad-style account number + 6-digit PIN. No
  emails, no passwords, no servers store user keys.
- **Crypto**: PBKDF2 (210k rounds) → AES-256-GCM, encrypted blob in
  `localStorage`. Never log keys, mnemonics, or PINs.
- **Sponsor model**: a server-side sponsor wallet pays network fees
  (energy + bandwidth). User pays a $1 USDT service fee per send.
- **Split**: frontend → GitHub Pages at `gasless.khurk.xyz`; backend →
  Replit (`@workspace/api-server`). Secrets live ONLY on Replit.

## Repo layout

```
artifacts/
  api-server/       Express + TypeScript backend (Replit-hosted)
    src/lib/
      sponsor.ts          Resource readiness, SponsorTxError, constants
      tronweb-types.ts    Typed TronWeb wrappers — use these, not raw tw.*
      energyRent.ts       Optional on-demand rental provider
    src/routes/           gasless, tron, push, version
  tron-wallet/      Vite + React PWA (GitHub Pages)
    src/lib/api.ts        apiUrl() helper, BUILD_ID
    src/hooks/use-tron.ts useSponsorInfo, useUSDTBalance, useSendUSDT, …
  mockup-sandbox/   Component preview server (dev only)
.github/workflows/  CI — only the GH Pages deploy lives here
AGENTS.md           This file
CHANGES.md          Append-only changelog, one entry per merged change
```

## Deployment status

- **Backend** is **published** to Replit Deployments. The stable
  `.replit.app` URL is what the frontend's `GASLESS_API_BASE_URL`
  repo variable should point at. `ALLOWED_ORIGINS=https://gasless.khurk.xyz`
  is set on the deployed env.
- **Frontend** GH Pages deploy is wired (`.github/workflows/deploy-pages.yml`).
  It builds on push to `main`/`master` touching `artifacts/tron-wallet/**`,
  bakes `VITE_API_BASE_URL` from the `GASLESS_API_BASE_URL` repo
  variable, and serves at `gasless.khurk.xyz`.
- **Human still owns**: enabling GH Pages source = "GitHub Actions",
  setting the `GASLESS_API_BASE_URL` repo variable, and the DNS
  `gasless.khurk.xyz → skulls206-creator.github.io` CNAME.
  - **Update 2026-05-17**: `pnpm-lock.yaml` was stale vs.
    `pnpm-workspace.yaml` overrides — both deploy workflow runs failed
    at `pnpm install --frozen-lockfile`. Lockfile regenerated at sha
    `9883ac6`. If builds still fail after GH Actions source is enabled,
    run `pnpm install --no-frozen-lockfile` locally and commit the
    updated lockfile.

## Build identity

Every build is tagged with the short git SHA:

- Frontend: `__BUILD_ID__` injected via Vite `define` (see
  `vite.config.ts`). Exposed at runtime via `BUILD_ID` from
  `src/lib/api.ts`. Shown in Settings → About.
- Backend: `GET /api/version` returns `{ buildId, buildTime, bootTime }`.

**When you file or respond to a bug report, ALWAYS include the build
id.** That's how both human and AI builders confirm we're looking at
the same code.

## Hard rules

1. **Never commit a secret.** Sponsor private key, API keys for
   Feee.io/ERP, push VAPID keys — all live in Replit env. The repo must
   stay safe to make public.
2. **Never broadcast a TRC-20 tx without `ensureUserReadyForSend()`
   passing.** The sponsor's job is to guarantee resources; if it can't,
   return HTTP 503 with diagnostics rather than burn the user's USDT
   on an `OUT_OF_ENERGY` revert.
3. **Never swallow the fee-tx error.** If the main tx succeeds but the
   $1 service-fee transfer fails, surface `feeError` to the client and
   show the user a "fee skipped" toast. Never claim success silently.
4. **Resource constants live in `artifacts/api-server/src/lib/sponsor.ts`
   ONLY.** `MIN_ENERGY_FOR_USDT`, bandwidth burn, safety pad, sponsor
   reserve. `energyRent.ts` imports from there — do not redefine.
5. **Frontend API calls go through `apiUrl()`** from `src/lib/api.ts`,
   never raw `fetch("/api/...")`. The GH Pages build needs an absolute
   URL to reach the Replit backend.
6. **No silent fallbacks for failed crypto/auth operations.** Throw or
   surface; do not pretend things worked.
7. **Sponsor wallet reserve = 5 TRX minimum.** Never let an automated
   top-up drain below this.
8. **All admin endpoints require `x-admin-secret` header matching
   `ADMIN_SECRET`** env. New admin routes MUST use the existing
   `requireAdmin` middleware.
9. **HTTP 503 from `/api/gasless-send` uses a stable user-facing
   string.** When `ensureUserReadyForSend()` returns `ok:false`, the
   route MUST respond with
   `{ error: "Sponsor wallet underfunded — please try again later",
   reason, retryable: true, sponsored, diagnostics }`. The detailed
   cause goes in `reason` / `diagnostics` for logs and admin
   dashboards; the `error` string is stable so client toasts can
   render a predictable message. Do not change this string without
   updating both the Send page copy and this rule.
10. **Never report `feeTxid` until `confirmTxSuccess()` passes.** The
    fee tx must be broadcast, then confirmed on-chain, before its
    txid is returned to the client. If confirmation fails, set
    `feeError` and leave `feeTxid: null` so the UI shows "fee
    skipped". A prior bug reported success while the $1 USDT never
    landed in the sponsor wallet — do not regress this.

## Code style

- TypeScript strict; `pnpm typecheck` exits 0 across the monorepo as
  of sha `2e91e1c`. **Do not regress this.** No new `any` types, no
  new `as any` casts in routes or `lib/`.
- Catch blocks: `catch (err: unknown)` + `errMessage(err)` from
  `lib/sponsor.ts`. Never `catch (err: any)`. Never read fields off
  `err` without narrowing.
- TronWeb calls go through typed helpers in `lib/tronweb-types.ts`
  (`getAccount`, `getAccountResources`, `buildSendTrxTx`, etc.).
  Only `broadcastUnknown()` is allowed when the caller passes a
  pre-signed tx whose contract shape isn't known at compile time
  (used in `broadcastSignedTx`).
- Sponsor tx failures throw `SponsorTxError` (carries `txid`,
  optional `receipt`, `unconfirmed`). Don't mutate fields onto a
  plain `Error`.
- Functional React. shadcn/ui + Tailwind. No CSS modules, no styled
  components.
- Backend: Express + TypeScript. No new ORMs; we don't use a DB.
- Error responses: `{ error: string, ...optional fields }`. Use
  appropriate status codes (400 user, 403 auth, 429 rate, 502 chain
  failure, 503 unrecoverable resource).

## Admin readiness payload

`GET /api/admin/status` (auth: `x-admin-secret`) returns the
sponsor status plus an `energyReadiness` object with this exact
shape — do not rename or remove fields without updating any
external dashboards:

```ts
energyReadiness: {
  rentalOk: boolean;              // rental provider has TRX float
  stakedDelegationOk: boolean;    // sponsor's own staked pool covers ≥1 send
  trxFloatSendsRemaining: number; // worst-case sends if rental+stake both fail
  energyFeeSun: number;           // live chain energy unit price (cached 5min)
  perSendTopUpTRX: number | null; // worst-case per-send TRX top-up
}
```

`trxFloatSendsRemaining` is computed as `floor((trxBalance·1e6 −
TRX_SPONSOR_RESERVE_SUN) / perSendSun)` where `perSendSun =
MIN_ENERGY_FOR_USDT × energyFeeSun + BANDWIDTH_BURN_PER_TX_SUN +
READINESS_SAFETY_PAD_SUN`. All constants come from
`lib/sponsor.ts`.

## Sponsor health surface

The frontend reads `/api/sponsor-info` (public, no auth) and derives
`SponsorHealth` via `deriveSponsorHealth()`:
- `active` — sponsor configured + funded, ≥5 sends remaining.
- `degraded` — sponsor configured + funded, but <5 sends remaining.
- `unavailable` — sponsor configured but can't cover sends right now.
- `off` — sponsor not configured.

The Send page only **blocks** the user when gasless is the *only*
path AND health is `unavailable` (i.e. user has no energy of their
own). If the user has energy, sends still work without the sponsor.

## Workflow

1. **Pick up a task** from CHANGES.md `## Backlog` or from the human.
2. **Don't break the other agent's in-flight work.** If you see a
   feature branch or uncommitted change you didn't make, ask the human
   before stomping it.
3. **Make the change.** Keep PRs/commits scoped — one logical change
   per commit, descriptive message.
4. **Test what you can.** Always run `pnpm typecheck` — it must exit
   0. Backend: run the dev server, hit the route with curl. Frontend:
   build and check console. Real mainnet sends require the human (they
   cost real TRX/USDT).
5. **Update CHANGES.md** with a one-line entry under the date. Include
   the short git SHA after the merge.
6. **Update AGENTS.md** if you learned a new rule or convention.

## Things you cannot do alone

- Mainnet test sends (cost real money — human approves).
- Rotate `SPONSOR_PRIVATE_KEY` / `ADMIN_SECRET` (live in Replit env).
- Modify DNS for `gasless.khurk.xyz` (human controls the registrar).
- Push to `main` directly — open a PR, human reviews & merges.

## When in doubt

Ask the human. They prefer blunt, anti-glaze, direct communication.
Don't over-apologize, don't pad with disclaimers, don't suggest 14
alternatives — pick the best one and explain why.
