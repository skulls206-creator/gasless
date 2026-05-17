# CHANGES.md

Append-only changelog. One entry per merged change. Newest at the top.
Format:

```
## YYYY-MM-DD — <short description>  (sha: <git-short>)
<agent name> — <what changed and why, one paragraph>
```

If an agent ships multiple changes in a day, add multiple entries.

---

## 2026-05-17 — Multi-agent collaboration infra  (sha: pending)
**Replit Agent.** Stood up the cross-agent build. Added GitHub Pages
workflow (`.github/workflows/deploy-pages.yml`) that builds the wallet
with `VITE_API_BASE_URL` baked in from repo variable
`GASLESS_API_BASE_URL`. Added `CNAME` for `gasless.khurk.xyz`. Added
`/api/version` endpoint and Vite `__BUILD_ID__` injection so every
build is tagged with its git short SHA. CORS on the API now accepts
`ALLOWED_ORIGINS` (comma-separated allowlist). All frontend fetches
routed through `apiUrl()` helper in `src/lib/api.ts`. Authored
`AGENTS.md` (rules) and this file.

## 2026-05-17 — Task #9: resource guarantee before every broadcast  (sha: pending)
**Replit Agent.** Replaced the old `topUpUserTRX` + `ensureUserHasBandwidthTRX`
pair with a single `ensureUserReadyForSend(userAddress, txCount)` that
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
`maxTopUpsAtFullBurn`.

## Backlog

Things the human flagged but no agent has picked up yet:

- (none)
