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

## ✅ Theme A — TronGrid routed through backend (all complete)
### A1 ✅ Backend `GET /tron/transactions/:address` — exists
### A2 ✅ Backend `GET /tron/resources/:address` — exists
### A3 ✅ `requireAdmin` middleware — exists, used on all admin routes
### A4 ✅ `useUSDTTransactions` hook — hits backend (not TronGrid)
### A5 ✅ `useTronResources` hook — hits backend (not TronGrid)
### A6 ✅ History "Load More" button — wired with `fetchNextPage`

## ✅ Theme B — Payment links + QR scan (all complete)
### B1 ✅ `@zxing/browser` installed
### B2 ✅ `QRScanner.tsx` exists
### B3 ✅ Send page wired to QR scanner + `?to=` pre-fill
### B4 ✅ Receive page has shareable pay link
### B5 ✅ Public `/pay/:address` route + `PayLink.tsx`

## ✅ Theme C — Copy fix (complete)
### C1 ✅ Dashboard: "~1–3 TRX (~$0.10–$0.30)"

## Conventions reminder (see AGENTS.md)

- All backend errors: `{ error: string }` and `catch (err: unknown)` +
  `errMessage(err)`.
- Sponsor-related failures: throw `SponsorTxError`, surface stable 503 user
  message.
- Never report `feeTxid` before `confirmTxSuccess()`.
- Run `pnpm run typecheck` before pushing. Must pass clean.
- Update `CHANGES.md` with the short SHA after each merged commit.
- No emojis.
