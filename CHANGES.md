# CHANGES.md

Append-only changelog. One entry per merged change. Newest at the top.
Format:

```
## YYYY-MM-DD — <short description>  (sha: <git-short>)
<agent name> — <what changed and why, one paragraph>
```

If an agent ships multiple changes in a day, add multiple entries.

---

## 2026-05-17 — Swap page with SwapKit+Trocador, nav reorg  (sha: pending)
**Satoshi.** Collapsed Send/Receive to remove from nav (routes still accessible).
Added Swap nav item with full swap flow: asset picker (BTC, XMR, USDT/USDC
across ETH/Base/TRON), quote screen with route comparison and price impact
warning, confirm/sending steps with deposit address. Backend Trocador proxy
endpoints (quote, create, status) added. SwapKit THORChain integration for
BTC quotes. Frontend falls back to mock quotes when no provider responds. 
**Satoshi.** The lockfile didn't match pnpm-workspace.yaml overrides,
causing `pnpm install --frozen-lockfile` to exit 1 in both
deploy-pages.yml workflow runs (#1 at 2a889ec, #2 at 13e99d8).
Regenerated lockfile, verified local build succeeds. Frontend now
needs GH Pages source set to "GitHub Actions" (manual repo setting)
to serve from workflow artifacts.

## 2026-05-17 — Tighten error typing in TRON + push routes  (sha: 4c5b9f2)
**Replit Agent.** Task #20. Replaced remaining `err: any` catches in
`routes/tron.ts` and `routes/push.ts` with `err: unknown` + the shared
`errMessage()` helper from `lib/sponsor.ts`. Backend now compiles clean
under `tsc --noEmit` with zero `any` leaks in route handlers.

## 2026-05-17 — Tighten error typing in energy rental module  (sha: 08d39e9)
**Replit Agent.** Task #19. Same treatment for `lib/energyRent.ts`:
all catch blocks now narrow `unknown` via `errMessage()`. No behavior
change; pure type cleanup so the next strict-mode bump won't regress.

## 2026-05-17 — Tighten error typing in gasless route handlers  (sha: aacb8d6)
**Replit Agent.** Task #18. `routes/gasless.ts` catch blocks now use
`err: unknown` + `errMessage()`. The `SponsorTxError` from confirm
failures is checked with `instanceof` so its `unconfirmed` flag flows
through to the HTTP response without casts.

## 2026-05-17 — SponsorTxError class for sponsor tx failures  (sha: 9fea853)
**Replit Agent.** Task #17. Replaced the old pattern of mutating
fields onto a plain `Error` (`(err as any).txid = ...`) with a proper
`SponsorTxError extends Error` carrying `txid`, optional `receipt`,
and `unconfirmed: boolean`. `confirmTxSuccess()` throws it on
revert/timeout; gasless route handlers check `instanceof` to surface
the right HTTP shape. No more `as any` field mutation on Errors.

## 2026-05-17 — Typed TRON receipt parsing  (sha: 4df95d4)
**Replit Agent.** Task #16. `confirmTxSuccess()` now reads
`receipt.result` and `info.result` through the typed `TransactionInfo`
shape from `lib/tronweb-types.ts`. `decodeContractRevertMessage()`
takes a typed `TransactionInfo` argument. Removes the last few
property accesses on `any`-typed TronGrid responses.

## 2026-05-17 — Typed TronWeb wrapper; remove `as any` from sponsor.ts  (sha: 68e754d)
**Replit Agent.** Task #13. Added `lib/tronweb-types.ts` — a thin
typed wrapper that re-exports `TronWeb`'s own `Types.*` and provides
typed helpers (`getAccount`, `getAccountResources`, `getChainParameters`,
`getTransactionInfo`, `buildSendTrxTx`, `buildFreezeBalanceV2Tx`,
`buildDelegateResourceTx`, `signTx`, `broadcast`, `broadcastUnknown`).
All `as any` casts in `lib/sponsor.ts` are gone. `withRetry()` and
every catch use `err: unknown` + `errMessage()`. The
`broadcastUnknown()` escape hatch is used only at the
`broadcastSignedTx(signedTx: object)` boundary where the caller passes
a pre-signed tx whose contract shape is not known at compile time.

## 2026-05-17 — Sponsor-readiness UI pill on Dashboard + Send  (sha: 181ae55)
**Replit Agent.** Task #12. Dashboard top bar now shows a
`GaslessPill` (active / degraded / unavailable / off) derived from
`/api/sponsor-info` via the new `useSponsorInfo()` + `deriveSponsorHealth()`
hooks. Polls every 60s. Send page disables the button only when
gasless is the user's *only* path AND it's unavailable — if the user
has their own energy, sends still go through. Degraded state shows a
warning but doesn't block. `useSponsorInfo` falls back to
`{configured: true, active: false}` on transient API failure so the
pill becomes "unavailable" instead of silently disappearing.

## 2026-05-17 — TypeScript strict-mode cleanup; typecheck is clean  (sha: 2e91e1c)
**Replit Agent.** Task #11. Fixed lingering strict-mode errors so
`pnpm typecheck` exits 0 across the monorepo. Touched `Backup.tsx`,
`crypto.ts`, and a few route handlers. No runtime change.

## 2026-05-17 — Push wallet to GitHub + activate gasless.khurk.xyz  (sha: 9853446)
**Replit Agent.** Task #10. Repo `skulls206-creator/gasless` created.
DNS for `gasless.khurk.xyz` set up to point at GitHub Pages. CNAME
file in `artifacts/tron-wallet/public/CNAME`. GH Pages deploy workflow
triggers on push to `main`/`master` touching the wallet.

## 2026-05-17 — Standardize underfunded-sponsor error message  (sha: 09faecb)
**Replit Agent.** Send endpoint now returns a stable user-facing
string ("Sponsor wallet underfunded — please try again later") with
the detailed reason in `diagnostics` so client toasts can render a
predictable message while logs/admin keep the full cause.

## 2026-05-17 — Follow-up: wire readiness guard into gasless route  (sha: 45af4b7)
**Replit Agent.** Small follow-up to `de7f3df`. Touched
`lib/sponsor.ts` (8 lines) and `routes/gasless.ts` (97 lines) to
finish wiring `ensureUserReadyForSend()` into the send + fee-tx flow
and clean up the readiness call sites. No new infrastructure here —
the heavy lifting was the prior commit.

## 2026-05-17 — Task #9 + multi-agent collab infra  (sha: de7f3df)
**Replit Agent.** Single commit that ships two scopes: (a) the
resource-readiness rewrite for Task #9 (see paragraph below), and
(b) the cross-agent build infrastructure. Infra additions: GitHub
Pages workflow (`.github/workflows/deploy-pages.yml`) that builds
the wallet with `VITE_API_BASE_URL` baked in from repo variable
`GASLESS_API_BASE_URL`; `CNAME` for `gasless.khurk.xyz`;
`/api/version` endpoint and Vite `__BUILD_ID__` injection so every
build is tagged with its git short SHA; CORS on the API accepts
`ALLOWED_ORIGINS` (comma-separated allowlist, fail-closed in
production); all frontend fetches routed through `apiUrl()` helper in
`src/lib/api.ts`; authored `AGENTS.md` and `CHANGES.md`.

Task #9 — resource guarantee before every broadcast:
(a) reads the live chain energy unit price via `getChainParameters()`
with a 5-minute cache and 210 SUN fallback, (b) computes the exact TRX
gap = `energyGap × energyFee + bandwidthBurn + safetyPad`, (c) sends
the gap from sponsor and **polls actual user balance settlement**
(replacing the previous `setTimeout(3000)` race that caused
`OUT_OF_ENERGY` reverts), and (d) returns `{ok, reason, diagnostics}`
without throwing. Wired into `gasless.ts`: pre-broadcast call returns
HTTP 503 with diagnostics if sponsor can't cover; a second call before
the fee tx, with `feeError` surfaced to the client instead of swallowed
(the previous behavior told users "Sent!" while the $1 USDT fee
silently never landed). `MIN_ENERGY_FOR_USDT` now exported from
`sponsor.ts` as the single source of truth; `energyRent.ts` imports
instead of duplicating. Admin status (`/api/admin/status`) gains an
`energyReadiness` block with `energyFeeSun`, `perSendTopUpTRX`, and
`trxFloatSendsRemaining`.

## 2026-05-17 — Task #15: typed Account / AccountResourceMessage  (sha: 68e754d)
**Replit Agent.** Task #15 (account + resource response typing) had
no dedicated commit — the work was absorbed into Task #13's typed
TronWeb wrapper (`lib/tronweb-types.ts`), which exposes `Account`
and `AccountResourceMessage` from `TronWeb`'s own `Types.*` and
funnels every `getAccount` / `getAccountResources` call through
those types. Removes the last `any` reads on `account.balance`,
`resources.EnergyLimit`, etc. Recorded here for traceability.

## 2026-05-17 — Task #14: typed BroadcastReturn / ChainParameter  (sha: 68e754d)
**Replit Agent.** Task #14 (broadcast-result and chain-parameter
typing) had no dedicated commit — the work was also absorbed into
Task #13's typed wrapper. `broadcast()` returns
`BroadcastReturn<SignedTransaction<T>>`; `getChainParameters()`
returns `ChainParameter[]`. `decodeTronError()` and
`getEnergyFeeSun()` consume those typed shapes directly instead of
inspecting `any`. The escape hatch `broadcastUnknown()` is the only
place left where the contract shape is erased — strictly at the
`broadcastSignedTx(signedTx: object)` boundary. Recorded here for
traceability.

## 2026-05-17 — Backend published to Replit Deployments  (sha: 6b4e2df)
**Replit Agent.** Published the api-server. The api-server now has a
stable `.replit.app` URL — use that as `VITE_API_BASE_URL` /
`GASLESS_API_BASE_URL` repo variable for the GH Pages frontend build.
`ALLOWED_ORIGINS=https://gasless.khurk.xyz` set on the deployed env
so CORS fail-closed lets the production frontend through. This is
the version of the backend the human-visible
`gasless.khurk.xyz` will talk to.

## 2026-05-17 — Push gasless repo to GitHub  (sha: bd23614 on main, ea2d5b1 on master)
**Replit Agent.** Task #22. Pushed local `master` (sha `6a20b5b`,
containing all merged tasks #9–#20 plus the published-deploy
checkpoint `6b4e2df`) to `github.com/skulls206-creator/gasless`:
- `refs/heads/main` → `bd23614` (latest docs commit; doc updates
  applied incrementally via Contents API since `git commit` is
  blocked in the Replit main-agent sandbox).
- `refs/heads/master` → `ea2d5b1` (full code tip + accumulated doc
  edits via the same path).
- GH Pages workflow registered and dispatched: run
  `25981271722` at
  https://github.com/skulls206-creator/gasless/actions/runs/25981271722.
- Auth via `http.extraheader` (token kept out of `.git/config`).
- Verified via `GET /repos/.../git/refs/heads` and
  `GET /repos/.../branches/main`.

## Backlog

Things the human flagged but no agent has picked up yet:

- (none — all in-flight tasks merged)
