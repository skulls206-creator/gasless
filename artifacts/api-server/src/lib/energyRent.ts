/**
 * On-demand TRON energy rental.
 *
 * Rental is ONLY attempted when ENERGY_RENT_API_KEY is set.
 * If the env var is absent the module behaves as if rental is not configured,
 * and the existing staked-delegation → TRX-top-up fallback path continues
 * to work without any regression.
 *
 * Supported providers (ENERGY_RENT_PROVIDER, default "feee"):
 *
 *   "feee"       — Feee.io V3 (5-minute rental, cheapest option).
 *                  POST https://feee.io/open/v3/order/create
 *                  Docs: https://feee.io/doc/en-US/api/
 *                  Auth: `key` header = ENERGY_RENT_API_KEY
 *                  Balance: GET /v2/api/query → data.trx_money
 *
 *   "erp" / "ter" — EnergyRentPro / TronEnergyRent (backup provider).
 *                   GET https://api.tronenergyrent.com/place-energy-order
 *                   Auth: apiKey query param = ENERGY_RENT_API_KEY
 *                   Balance: GET /get-balance?apiKey=...
 *
 * Additional env vars:
 *   ENERGY_RENT_PROVIDER        — "feee" | "erp" | "ter"  (default: "feee")
 *   ENERGY_RENT_API_KEY         — required to activate rental at all
 *   ENERGY_RENT_DURATION_HOURS  — rental duration for "erp"/"ter" provider (default: "1")
 */

const FEEE_BASE = "https://feee.io/open";
const ERP_BASE  = "https://api.tronenergyrent.com";

// Single source of truth lives in sponsor.ts so admin status, readiness
// checks, and rental sizing never drift apart.
import { MIN_ENERGY_FOR_USDT, errMessage } from "./sponsor.js";

export interface RentalResult {
  success: boolean;
  energyDelegated: number;
  costTrx: number;
  provider: string;
  ref?: string;
}

// ── Provider response shapes ───────────────────────────────────────────────

interface FeeeOrderResponse {
  code?: number;
  msg?: string;
  data?: {
    pay_amount?: number;
    price_in_sun?: number;
    resource_value?: number;
    order_no?: string;
  };
}

interface FeeeBalanceResponse {
  code?: number;
  data?: {
    trx_money?: number;
  };
}

interface ERPOrderResponse {
  status?: string;
  errorCode?: string;
  errorDescription?: string;
  payload?: {
    totalPriceTrx?: number;
    orderId?: string;
  };
}

interface ERPBalanceResponse {
  status?: string;
  payload?: {
    balanceTrx?: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getProvider(): "feee" | "erp" {
  const p = (process.env.ENERGY_RENT_PROVIDER ?? "feee").toLowerCase();
  return p === "erp" || p === "ter" ? "erp" : "feee";
}

function getApiKey(): string {
  const key = process.env.ENERGY_RENT_API_KEY;
  if (!key) throw new Error("ENERGY_RENT_API_KEY is not set");
  return key;
}

/**
 * HTTP fetch with up to maxTries attempts.
 * Retries on:
 *  - Thrown network errors
 *  - HTTP 429 (rate-limit) and 5xx (server error)
 */
async function fetchWithRetry<T = unknown>(
  url: string,
  init?: RequestInit,
  maxTries = 3,
): Promise<T> {
  let delay = 3_000;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(url, init);
    } catch (err: unknown) {
      lastErr = err;
      if (attempt < maxTries) await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    // Retry on rate-limit or server errors
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`HTTP ${res.status}`);
      if (attempt < maxTries) await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    return (await res.json()) as T;
  }

  throw lastErr ?? new Error("fetchWithRetry: all attempts failed");
}

// ── Feee.io provider ───────────────────────────────────────────────────────

async function rentViaFeee(
  userAddress: string,
  energyNeeded: number,
): Promise<RentalResult> {
  const apiKey = getApiKey();

  const body = {
    resource_type:  1,           // 1 = energy
    receive_address: userAddress,
    resource_value:  energyNeeded,
  };

  console.log(`[energyRent] Feee.io V3: ordering ${energyNeeded} energy → ${userAddress}`);

  const result = await fetchWithRetry<FeeeOrderResponse>(
    `${FEEE_BASE}/v3/order/create`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", key: apiKey },
      body:    JSON.stringify(body),
    },
    3,
  );

  if (result.code !== 0) {
    throw new Error(`Feee.io order failed (code ${result.code}): ${result.msg}`);
  }

  const data = result.data ?? {};
  const costTrx: number = data.pay_amount
    ?? (data.price_in_sun ? data.price_in_sun / 1_000_000 : 0.013);
  const delivered: number = data.resource_value ?? energyNeeded;

  console.log(
    `[energyRent] Rented ${delivered} energy for ${userAddress} via feee` +
    ` (cost: ~${costTrx.toFixed(6)} TRX, order: ${data.order_no ?? "?"})`,
  );

  // Energy arrives in 3-6 seconds per Feee.io docs
  await new Promise((r) => setTimeout(r, 6_000));

  return {
    success: true,
    energyDelegated: delivered,
    costTrx,
    provider: "feee",
    ref: data.order_no,
  };
}

async function getFeeeBalance(): Promise<number> {
  const apiKey = getApiKey();
  try {
    const result = await fetchWithRetry<FeeeBalanceResponse>(
      `${FEEE_BASE}/v2/api/query`,
      { headers: { key: apiKey } },
      2,
    );
    if (result.code !== 0) return 0;
    return result.data?.trx_money ?? 0;
  } catch (err: unknown) {
    console.warn(`[energyRent] getFeeeBalance failed: ${errMessage(err)}`);
    return 0;
  }
}

// ── ERP (EnergyRentPro) provider ───────────────────────────────────────────
//
// ⚠️ NOTE: ERP requires the API key as a query parameter (?apiKey=...) in the URL.
//    This is a constraint of their API design — there is no header-based auth option.
//    The key is transmitted over HTTPS so it is encrypted in transit, but it will
//    appear in server access logs. If this is a concern, consider using the "feee"
//    provider instead, which sends the key as a header.

async function rentViaERP(
  userAddress: string,
  energyNeeded: number,
): Promise<RentalResult> {
  const apiKey        = getApiKey();
  const durationHours = process.env.ENERGY_RENT_DURATION_HOURS ?? "1";
  const period        = `${durationHours}h`;

  const url = new URL(`${ERP_BASE}/place-energy-order`);
  url.searchParams.set("apiKey",                        apiKey);
  url.searchParams.set("period",                        period);
  url.searchParams.set("energyAmount",                  String(energyNeeded));
  url.searchParams.set("destinationAddress",            userAddress);
  url.searchParams.set("preActivateDestinationAddress", "1");

  console.log(`[energyRent] ERP: ordering ${energyNeeded} energy (${period}) → ${userAddress}`);

  const result = await fetchWithRetry<ERPOrderResponse>(url.toString(), undefined, 3);

  if (result.status !== "SUCCESS") {
    throw new Error(
      `ERP order failed: ${result.errorDescription ?? result.errorCode ?? JSON.stringify(result)}`,
    );
  }

  const costTrx: number = result.payload?.totalPriceTrx ?? 0;
  const orderId: string = result.payload?.orderId ?? "?";

  console.log(
    `[energyRent] Rented ${energyNeeded} energy for ${userAddress} via erp` +
    ` (cost: ~${costTrx.toFixed(6)} TRX, order: ${orderId})`,
  );

  // Wait for delegation to propagate
  await new Promise((r) => setTimeout(r, 4_000));

  return {
    success: true,
    energyDelegated: energyNeeded,
    costTrx,
    provider: "erp",
    ref: orderId,
  };
}

async function getERPBalance(): Promise<number> {
  const apiKey = getApiKey();
  try {
    const result = await fetchWithRetry<ERPBalanceResponse>(
      `${ERP_BASE}/get-balance?apiKey=${encodeURIComponent(apiKey)}`,
      undefined,
      2,
    );
    return result.status === "SUCCESS" ? (result.payload?.balanceTrx ?? 0) : 0;
  } catch (err: unknown) {
    console.warn(`[energyRent] getERPBalance failed: ${errMessage(err)}`);
    return 0;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true only when ENERGY_RENT_API_KEY is set (the operator has
 * configured a rental account). Without the key, the module is disabled and
 * the existing staked-delegation → TRX-top-up fallback path is used instead.
 */
export function isRentalConfigured(): boolean {
  return !!process.env.ENERGY_RENT_API_KEY;
}

/**
 * Rent energy from an external provider and have it delegated to userAddress.
 * Blocks until the energy is confirmed delegated (or throws on failure).
 * Only call this when isRentalConfigured() is true.
 */
export async function rentEnergyForUser(
  userAddress: string,
  energyNeeded: number = MIN_ENERGY_FOR_USDT,
): Promise<RentalResult> {
  const provider = getProvider();
  if (provider === "erp") return rentViaERP(userAddress, energyNeeded);
  return rentViaFeee(userAddress, energyNeeded);
}

/**
 * Return rental balance info for the admin status endpoint.
 * Returns null if rental is not configured or balance lookup fails.
 */
export async function getRentalBalance(): Promise<{
  provider: string;
  trxBalance: number;
  estimatedSendsRemaining: number;
} | null> {
  if (!isRentalConfigured()) return null;

  const provider = getProvider();
  try {
    const trxBalance    = provider === "erp" ? await getERPBalance() : await getFeeeBalance();
    // Heuristic cost per send: feee V3 ~0.013 TRX (5-min, 65k energy);
    // erp ~2.86 TRX (1-hour, 44 SUN/energy). Used only for admin telemetry.
    // Overridable via ENERGY_RENT_COST_PER_SEND_ERP and ENERGY_RENT_COST_PER_SEND_FEEE.
    const costPerSend = provider === "erp"
      ? parseFloat(process.env.ENERGY_RENT_COST_PER_SEND_ERP ?? "2.86")
      : parseFloat(process.env.ENERGY_RENT_COST_PER_SEND_FEEE ?? "0.013");
    return {
      provider,
      trxBalance,
      estimatedSendsRemaining: costPerSend > 0 ? Math.floor(trxBalance / costPerSend) : 0,
    };
  } catch (err: unknown) {
    console.error(`[energyRent] getRentalBalance error: ${errMessage(err)}`);
    return null;
  }
}
