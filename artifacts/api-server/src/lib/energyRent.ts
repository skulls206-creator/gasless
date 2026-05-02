import { TronWeb } from "tronweb";

/**
 * On-demand TRON energy rental.
 *
 * Supported providers (set via ENERGY_RENT_PROVIDER env var):
 *  "tronnrg" (default) — pay-per-tx, no API key needed.
 *    Sponsor wallet sends TRX directly to TronNRG; they delegate energy to the user.
 *    Pricing: 16,250 energy per TRX. Min order: 4 TRX (65,000 energy = 1 USDT send).
 *    Docs: https://support.tronnrg.com/developer-docs/rent-tron-energy-tronweb
 *
 *  "ter" — TronEnergyRent, requires ENERGY_RENT_API_KEY.
 *    Pre-funded balance at their service. Simpler: single GET request per order.
 *    Docs: https://tronenergyrent.com/en/documentation-api
 *
 * Env vars:
 *   ENERGY_RENT_PROVIDER        — "tronnrg" | "ter"  (default: "tronnrg")
 *   ENERGY_RENT_API_KEY         — API key for TronEnergyRent (required when provider="ter")
 *   ENERGY_RENT_DURATION_HOURS  — rental duration in hours for TER (default: "1")
 */

const TRONGRID = "https://api.trongrid.io";

// TronNRG
const TRONNRG_PAYMENT_ADDRESS = "TFqUiCu1JwLHHnBNeaaVKH7Csm4aA3YhZx";
const TRONNRG_API             = "https://api.tronnrg.com";
const TRONNRG_ENERGY_PER_TRX  = 16_250;
const TRONNRG_MIN_TRX         = 4;       // minimum: 65,000 energy = 1 USDT send

// TronEnergyRent
const TER_API                    = "https://api.tronenergyrent.com";
const TER_APPROX_SUN_PER_ENERGY  = 44;   // ~44 sun/energy at 1h; actual price varies

const MIN_ENERGY_FOR_USDT = 65_000;

export interface RentalResult {
  success: boolean;
  energyDelegated: number;
  costTrx: number;
  provider: string;
  ref?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizePk(pk: string): string {
  return pk.startsWith("0x") || pk.startsWith("0X") ? pk.slice(2) : pk;
}

function getSponsorTronWeb(): InstanceType<typeof TronWeb> {
  const rawPk = process.env.SPONSOR_PRIVATE_KEY;
  if (!rawPk) throw new Error("SPONSOR_PRIVATE_KEY not configured");
  const pk = normalizePk(rawPk.trim());
  return new TronWeb({ fullHost: TRONGRID, privateKey: pk });
}

function getSponsorAddress(): string {
  const addr = process.env.SPONSOR_ADDRESS;
  if (!addr) throw new Error("SPONSOR_ADDRESS not configured");
  return addr;
}

function getProvider(): "tronnrg" | "ter" {
  const p = (process.env.ENERGY_RENT_PROVIDER ?? "tronnrg").toLowerCase();
  return p === "ter" ? "ter" : "tronnrg";
}

/** HTTP fetch with up to maxTries retries on network / 5xx errors. */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxTries = 3,
): Promise<any> {
  let delay = 3_000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const res = await fetch(url, init);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < maxTries) await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw lastErr;
}

// ── TronNRG provider ───────────────────────────────────────────────────────

async function rentViaTronNRG(
  userAddress: string,
  energyNeeded: number,
): Promise<RentalResult> {
  const tronWeb        = getSponsorTronWeb();
  const sponsorAddress = getSponsorAddress();
  const pk             = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());

  // Linear pricing: 16,250 energy per TRX. Min 4 TRX.
  const trxNeeded = Math.max(TRONNRG_MIN_TRX, Math.ceil(energyNeeded / TRONNRG_ENERGY_PER_TRX));
  const sunNeeded = trxNeeded * 1_000_000;
  const expectedEnergy = trxNeeded * TRONNRG_ENERGY_PER_TRX;

  console.log(
    `[energyRent] TronNRG: sending ${trxNeeded} TRX for ~${expectedEnergy} energy → ${userAddress}`,
  );

  // 1. Send TRX from sponsor wallet to TronNRG payment address
  const paymentTx = await (tronWeb.transactionBuilder as any).sendTrx(
    TRONNRG_PAYMENT_ADDRESS, sunNeeded, sponsorAddress,
  );
  const signedPayment = await tronWeb.trx.sign(paymentTx, pk);
  const broadcast     = await tronWeb.trx.sendRawTransaction(signedPayment);

  if ((broadcast as any).result !== true) {
    throw new Error(`TronNRG payment broadcast failed: ${JSON.stringify(broadcast)}`);
  }
  const txid = (broadcast as any).txid as string;
  console.log(`[energyRent] TronNRG payment tx: ${txid}`);

  // 2. Sign message proving we are the sender, specifying delegate target
  const message   = `${txid}:${userAddress}`;
  const signature = await (tronWeb.trx as any).signMessageV2(message, pk);

  // 3. Claim delegation — retry on payment_verification_failed (tx not yet indexed)
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const result = await fetchWithRetry(
      `${TRONNRG_API}/delegate`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tx_hash: txid, delegate_to: userAddress, signature }),
      },
      1, // single attempt per loop iteration; outer loop handles payment_verification_failed
    );

    if (!result.error) {
      const energyDelegated: number = result.energy ?? expectedEnergy;
      console.log(
        `[energyRent] TronNRG: ${energyDelegated} energy delegated` +
        (result.ref ? ` (ref: ${result.ref})` : ""),
      );
      // Wait for energy to fully propagate before caller broadcasts
      await new Promise((r) => setTimeout(r, 3_000));
      return { success: true, energyDelegated, costTrx: trxNeeded, provider: "tronnrg", ref: result.ref };
    }

    if (result.error === "payment_verification_failed") {
      console.log(`[energyRent] TronNRG claim attempt ${attempt} — tx not yet indexed, waiting 3 s…`);
      lastErr = new Error(result.message ?? result.error);
      await new Promise((r) => setTimeout(r, 3_000));
      continue;
    }

    // Non-retryable error
    throw new Error(`TronNRG delegation failed: ${result.message ?? result.error}`);
  }
  throw lastErr ?? new Error("TronNRG: claim failed after all retries");
}

// ── TronEnergyRent (TER) provider ─────────────────────────────────────────

async function rentViaTER(
  userAddress: string,
  energyNeeded: number,
): Promise<RentalResult> {
  const apiKey = process.env.ENERGY_RENT_API_KEY;
  if (!apiKey) throw new Error("ENERGY_RENT_API_KEY is required for provider=ter");

  const durationHours = process.env.ENERGY_RENT_DURATION_HOURS ?? "1";
  const period        = `${durationHours}h`;

  const url = new URL(`${TER_API}/place-energy-order`);
  url.searchParams.set("apiKey",                       apiKey);
  url.searchParams.set("period",                       period);
  url.searchParams.set("energyAmount",                 String(energyNeeded));
  url.searchParams.set("destinationAddress",           userAddress);
  url.searchParams.set("preActivateDestinationAddress", "1"); // handles unactivated wallets

  console.log(`[energyRent] TER: ordering ${energyNeeded} energy (${period}) → ${userAddress}`);

  const result = await fetchWithRetry(url.toString(), undefined, 3);

  if (result.status !== "SUCCESS") {
    throw new Error(
      `TronEnergyRent failed: ${result.errorDescription ?? result.errorCode ?? JSON.stringify(result)}`,
    );
  }

  const costTrx: number =
    result.payload?.totalPriceTrx ??
    (energyNeeded * TER_APPROX_SUN_PER_ENERGY) / 1_000_000;

  console.log(
    `[energyRent] TER: ${energyNeeded} energy ordered, cost ${costTrx} TRX` +
    (result.payload?.orderId ? ` (orderId: ${result.payload.orderId})` : ""),
  );

  // Wait for delegation to propagate
  await new Promise((r) => setTimeout(r, 3_000));

  return {
    success: true,
    energyDelegated: energyNeeded,
    costTrx,
    provider:        "ter",
    ref:             result.payload?.orderId,
  };
}

// ── TER balance check ──────────────────────────────────────────────────────

async function getTERBalance(): Promise<number> {
  const apiKey = process.env.ENERGY_RENT_API_KEY;
  if (!apiKey) return 0;
  try {
    const result = await fetchWithRetry(
      `${TER_API}/get-balance?apiKey=${encodeURIComponent(apiKey)}`,
      undefined,
      2,
    );
    return result.status === "SUCCESS" ? (result.payload?.balanceTrx ?? 0) : 0;
  } catch {
    return 0;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Returns true if energy rental is usable with the current env configuration. */
export function isRentalConfigured(): boolean {
  const provider = getProvider();
  const hasSponsor = !!(process.env.SPONSOR_PRIVATE_KEY && process.env.SPONSOR_ADDRESS);
  if (provider === "ter") return hasSponsor && !!process.env.ENERGY_RENT_API_KEY;
  // tronnrg: only needs sponsor wallet (TRX is sent directly from it)
  return hasSponsor;
}

/**
 * Rent energy from an external provider and have it delegated to userAddress.
 * Blocks until the energy is confirmed delegated (or throws on failure).
 */
export async function rentEnergyForUser(
  userAddress: string,
  energyNeeded: number = MIN_ENERGY_FOR_USDT,
): Promise<RentalResult> {
  const provider = getProvider();
  if (provider === "ter") return rentViaTER(userAddress, energyNeeded);
  return rentViaTronNRG(userAddress, energyNeeded);
}

/**
 * Return the rental balance available for admin status display.
 * Returns null if rental isn't configured or balance lookup fails.
 */
export async function getRentalBalance(): Promise<{
  trxBalance: number;
  provider: string;
  estimatedSendsRemaining: number;
  costPerSendTrx: number;
} | null> {
  if (!isRentalConfigured()) return null;

  const provider = getProvider();
  try {
    if (provider === "ter") {
      const trxBalance      = await getTERBalance();
      const costPerSendTrx  = (MIN_ENERGY_FOR_USDT * TER_APPROX_SUN_PER_ENERGY) / 1_000_000;
      return {
        trxBalance,
        provider: "ter",
        estimatedSendsRemaining: costPerSendTrx > 0 ? Math.floor(trxBalance / costPerSendTrx) : 0,
        costPerSendTrx,
      };
    }

    // tronnrg: draws from sponsor TRX balance directly
    const tronWeb        = getSponsorTronWeb();
    const sponsorAddress = getSponsorAddress();
    const account        = await tronWeb.trx.getAccount(sponsorAddress);
    const trxBalance     = ((account as any).balance ?? 0) / 1_000_000;
    const costPerSendTrx = TRONNRG_MIN_TRX; // 4 TRX minimum per send
    return {
      trxBalance,
      provider: "tronnrg",
      estimatedSendsRemaining: Math.floor(trxBalance / costPerSendTrx),
      costPerSendTrx,
    };
  } catch (err) {
    console.error("[energyRent] getRentalBalance error:", err);
    return null;
  }
}
