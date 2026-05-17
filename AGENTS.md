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
  tron-wallet/      Vite + React PWA (GitHub Pages)
  mockup-sandbox/   Component preview server (dev only)
.github/workflows/  CI — only the GH Pages deploy lives here
AGENTS.md           This file
CHANGES.md          Append-only changelog, one entry per merged change
```

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

## Code style

- TypeScript strict; existing strict errors in `sponsor.ts` /
  `crypto.ts` / `Backup.tsx` are pre-existing TronWeb / WebCrypto type
  mismatches — runtime works. Don't introduce new ones.
- Functional React. shadcn/ui + Tailwind. No CSS modules, no styled
  components.
- Backend: Express + TypeScript. No new ORMs; we don't use a DB.
- Error responses: `{ error: string, ...optional fields }`. Use
  appropriate status codes (400 user, 403 auth, 429 rate, 502 chain
  failure, 503 unrecoverable resource).

## Workflow

1. **Pick up a task** from CHANGES.md `## Backlog` or from the human.
2. **Don't break the other agent's in-flight work.** If you see a
   feature branch or uncommitted change you didn't make, ask the human
   before stomping it.
3. **Make the change.** Keep PRs/commits scoped — one logical change
   per commit, descriptive message.
4. **Test what you can.** Backend: run the dev server, hit the route
   with curl. Frontend: build and check console. Real mainnet sends
   require the human (they cost real TRX/USDT).
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
