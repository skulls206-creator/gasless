# Security Fix Summary

Date: 2026-05-19

## Issue 1: CRITICAL — Admin endpoint uses plain header without crypto challenge
**File:** `artifacts/api-server/src/routes/gasless.ts`

**Changes:**
- When `ADMIN_SECRET` is not set, admin endpoints are now **disabled** (403) instead of being open to all
- Removed `req.query.secret` support — secret is no longer accepted via query string (would leak in server logs)
- Added IP logging on unauthorized admin access attempts
- Response on unauthorized now includes `forbidden` code instead of generic `401` when secret is unconfigured

## Issue 2: CRITICAL — feeError returned to client
**File:** `artifacts/api-server/src/routes/gasless.ts`

**Changes:**
- `feeError` is now sanitized before being sent to the client — it shows a generic user-friendly message instead of the raw error string
- The raw error still appears in server-side logs

## Issue 3: HIGH — API keys exposed in URLs/logs
**Files:** `artifacts/api-server/src/routes/swap.ts`, `artifacts/api-server/src/lib/energyRent.ts`

**Changes (swap.ts):**
- Added `console.log` statements that confirm "Trocador API key configured" without revealing the key value
- Added inline code comments noting that Trocador's API design requires the key as a query parameter

**Changes (energyRent.ts):**
- Added documentation block explaining that ERP requires the API key as a query parameter (their API constraint)
- Notes that HTTPS encrypts the key in transit, but it may appear in access logs
- Suggests using the "feee" provider instead (which sends key as a header) if this is a concern

## Issue 4: Request body size limits
**File:** `artifacts/api-server/src/app.ts`

**Status:** ✅ Already implemented — `express.json({ limit: "64kb" })` and `express.urlencoded({ extended: true, limit: "16kb" })` were already in place (stricter than the 1mb requirement).

## Issue 5: Validate fee recipient address
**File:** `artifacts/api-server/src/routes/gasless.ts`

**Changes:**
- `getFeeRecipient()` now validates that the address starts with "T" (valid TRON base58 prefix)
- Returns `null` with a warning log if the address is invalid

## Issue 6: Add .gitignore at repo root
**File:** `.gitignore`

**Changes:**
- Created `.gitignore` at the repo root ignoring `node_modules/`, `dist/`, `.env`, `.env.local`, `*.log`, and `.DS_Store`
