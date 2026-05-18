# Next batch for Gasless

## URGENT: Peer onramp — root cause of TRON USDT pre-select not working

**Diagnosis (after inspecting `@zkp2p/sdk@0.4.0` installed locally):**

The extension's `onramp()` protocol and `peer.xyz/swap` (the web app) are two
different products. They were getting conflated.

- **`peer.xyz/swap` (web app)** — supports TRON USDT. Confirmed visually:
  the "Select Token" modal lists Tron and Tether USD with contract
  `TR7N...Lj6t`.
- **`@zkp2p/sdk` v0.4.0 extension `onramp()`** — still EVM-only. Hard
  evidence from `dist/index.cjs`:

  ```js
  var SUPPORTED_CHAIN_IDS = {
    BASE_MAINNET: 8453,
    SCROLL_MAINNET: 534352,
    HARDHAT: 31337
  };
  var TOKEN_METADATA = { USDC: { symbol: "USDC", decimals: 6, name: "USD Coin" } };
  ```

  Zero occurrences of `tron`, `728126428`, `0x2b6653dc`, or `TR7NHqje`
  anywhere in the SDK bundle.

**So calling `ext.onramp(queryString)` with `toToken=728126428:TR7N...` will
never pre-select TRON USDT.** No chain-ID guess fixes this — the extension's
fiat→crypto proof pipeline simply does not ship TRON support yet. The
chain ID `728126428` is correct as a TRON identifier; the SDK just doesn't
recognise it.

**Recommended fix:** stop calling `ext.onramp()` for the TRON flow. Use
`openSidebar(route)` to deep-link to the web app's swap UI inside the
sidebar:

```ts
peerExtensionSdk.openSidebar(
  "swap?tab=buy&toChain=728126428&toToken=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
);
```

The exact query-param names (`toChain`, `toToken`, etc.) are guesses based
on common patterns. Verify by manually selecting TRON + USDT on
`peer.xyz/swap` and watching the URL change, or by inspecting their JS
bundle in DevTools. If params are not supported, fall back to
`openSidebar("swap?tab=buy")` — the user is one click from the right
token.

**Do not:** keep iterating on `intentHash` / `callback` / `toToken`
arguments to `ext.onramp()`. Those calls are for the Base/Scroll fiat
proof flow, not for TRON.

---

## Eight items, grouped into three themes

Land them in the order shown; later items in a group depend on earlier ones
in the same group.

## Theme A — Route TronGrid traffic through our backend

Goal: stop calling `api.trongrid.io` directly from the browser. Lower latency
for cached reads, no public rate-limit exposure, single place to swap providers.

### A1. Backend: `GET /api/tron/transactions/:address`
- Proxy TronGrid's TRC20 transfer history for the given address, filtered to
  USDT contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`.
- Query params: `limit` (default 20, max 50), `fingerprint` (opaque cursor
  passed through to TronGrid for pagination).
- Response: `{ data: Tx[], meta: { fingerprint?: string } }`.
- Use the existing TronGrid key from env (`TRONGRID_API_KEY`); fall back to
  unauthenticated if absent. Same error envelope as the rest of `/api/tron/*`.

### A2. Backend: verify `GET /api/tron/resources/:address` already exists
- Confirm it returns `{ energy, bandwidth, trxBalance }`. If missing, add it
  using `tronWeb.trx.getAccountResources`.

### A3. Backend: confirm `ADMIN_SECRET` gate on every `/api/admin/*` route
- `gasless.ts` already enforces it. Audit all admin handlers and extract a
  single `requireAdmin` middleware if duplication exists.

### A4. Frontend: `useUSDTTransactions` hook hits A1
- Replace the direct TronGrid fetch with `GET ${API_BASE}/api/tron/transactions/:address`.
- Hold `fingerprint` in hook state, expose `loadMore()` that re-fetches with
  the cursor and appends.

### A5. Frontend: `useTronResources` hook hits A2
- Same swap, no pagination needed.

### A6. History page: load-more button
- Render a "Load older" button when `fingerprint` is non-null; disable while
  loading. No infinite scroll.

## Theme B — Shareable payment links + QR scan

### B1. Install `@zxing/browser` in `artifacts/tron-wallet`
- Add to dependencies, regenerate lockfile, commit both.

### B2. `QRScanner.tsx` modal component
- Live camera feed via `@zxing/browser`, returns the decoded string.
- Handle permission denied and "no camera" gracefully with a visible message.
- Stop the stream on unmount and on close.

### B3. Send page wiring
- Camera icon button inside the recipient input. Opens `QRScanner`.
- If decoded string starts with `tron:` or is a valid base58 TRON address,
  populate the input. Otherwise show inline error.
- On mount, read `?to=` query param and pre-fill the recipient field.
- Cycle the in-flight status text every ~1.5s while the sponsor tx is
  pending: "Delegating energy…" → "Building tx…" → "Broadcasting…" →
  "Waiting for confirmation…". Pure UX, no behavior change.

### B4. Receive page: shareable pay link
- New button: "Share payment link". Copies `https://gasless.one/pay/<ADDRESS>`
  to clipboard, toast on success.
- The on-page QR code encodes the full URL (not the raw address) so any
  scanner that opens URLs lands on B5.

### B5. Public `/pay/:address` route + `PayLink.tsx`
- Public — no auth required, no wallet state required.
- Validates the address is a TRON base58. If invalid, show error.
- If the visitor has a wallet on this device: deep-link them into Send with
  `?to=<address>` pre-filled.
- If not: show a clean landing card with the recipient address, a "Send USDT
  with Gasless" CTA that goes to the onboarding flow with the same `?to=`
  carried through, and a fallback "Copy address" button.

## Theme C — Copy fix

### C1. Dashboard energy warning text
- Change "<$0.10" to "1–3 TRX (~$0.10–$0.30)". One-line copy edit in the
  dashboard component that renders the low-energy notice.

## Conventions reminder (see AGENTS.md)

- All backend errors: `{ error: string }` and `catch (err: unknown)` +
  `errMessage(err)`.
- Sponsor-related failures: throw `SponsorTxError`, surface stable 503 user
  message.
- Never report `feeTxid` before `confirmTxSuccess()`.
- Run `pnpm run typecheck` before pushing. Must pass clean.
- Update `CHANGES.md` with the short SHA after each merged commit.
- No emojis.
