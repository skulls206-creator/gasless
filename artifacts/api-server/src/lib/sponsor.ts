import { TronWeb } from "tronweb";

const TRONGRID = "https://api.trongrid.io";

/** Retry a TronWeb SDK call up to maxTries times on 429 / rate-limit errors. */
async function withRetry<T>(fn: () => Promise<T>, maxTries = 4): Promise<T> {
  let delay = 1500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      const is429 = msg.includes("429") || msg.includes("Too Many") || msg.includes("rate");
      if (!is429 || attempt >= maxTries) throw err;
      lastErr = err;
      console.warn(`[sponsor] TronGrid 429 — retry ${attempt}/${maxTries} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw lastErr;
}

// ── Resource budget — single source of truth ──────────────────────────────
// One TRC-20 USDT transfer burns ~31k energy + ~17k SSTORE penalty
// (TIP-491, first-time recipients), and TRON applies an escalating penalty
// after repeated OUT_OF_ENERGY reverts. 130k covers worst case with
// TronWeb's ~30% headroom. Exported so energyRent.ts/gasless.ts/admin
// status all agree.
export const MIN_ENERGY_FOR_USDT = 130_000;

// Bandwidth burn per TRC-20 transfer is ~345 bytes × 1000 SUN/byte ≈
// 0.345 TRX. Round up to 0.5 TRX/tx as a safety floor.
export const BANDWIDTH_BURN_PER_TX_SUN = 500_000;

// Pad every top-up by 1 TRX over the computed minimum to absorb chain
// param changes and rounding error.
export const READINESS_SAFETY_PAD_SUN = 1_000_000;

// Never drain sponsor wallet below this reserve.
export const TRX_SPONSOR_RESERVE_SUN = 5_000_000; // 5 TRX

// How long to poll for the top-up tx to land on-chain.
const TOPUP_SETTLE_TIMEOUT_MS = 30_000;
const TOPUP_SETTLE_POLL_MS    = 1_500;

// Cache the chain's energy unit price (SUN/energy) for 5 min to avoid
// hammering getChainParameters on every send.
let energyFeeCache: { sun: number; fetchedAt: number } | null = null;
const ENERGY_FEE_TTL_MS = 5 * 60_000;
// Hard fallback if chain params ever fail — current mainnet value as of May 2026.
const ENERGY_FEE_FALLBACK_SUN = 210;

export async function getEnergyFeeSun(): Promise<number> {
  const now = Date.now();
  if (energyFeeCache && now - energyFeeCache.fetchedAt < ENERGY_FEE_TTL_MS) {
    return energyFeeCache.sun;
  }
  try {
    const tronWeb = getSponsorTronWeb() ?? new TronWeb({ fullHost: TRONGRID });
    const params: any[] = await withRetry(() => tronWeb.trx.getChainParameters());
    const fee = params.find((p) => p?.key === "getEnergyFee")?.value;
    const sun = typeof fee === "number" && fee > 0 ? fee : ENERGY_FEE_FALLBACK_SUN;
    energyFeeCache = { sun, fetchedAt: now };
    return sun;
  } catch (err: any) {
    console.warn(`[sponsor] getChainParameters failed: ${err.message} — using ${ENERGY_FEE_FALLBACK_SUN} SUN/energy fallback`);
    return ENERGY_FEE_FALLBACK_SUN;
  }
}

function normalizePk(pk: string): string {
  return pk.startsWith("0x") || pk.startsWith("0X") ? pk.slice(2) : pk;
}

function getSponsorTronWeb(): InstanceType<typeof TronWeb> | null {
  const rawPk = process.env.SPONSOR_PRIVATE_KEY;
  if (!rawPk) return null;
  const pk = normalizePk(rawPk.trim());
  return new TronWeb({ fullHost: TRONGRID, privateKey: pk });
}

function getSponsorAddress(): string | null {
  return process.env.SPONSOR_ADDRESS || null;
}

export function isSponsorConfigured(): boolean {
  return !!(process.env.SPONSOR_PRIVATE_KEY && process.env.SPONSOR_ADDRESS);
}

export type SponsorStatus =
  | { configured: false }
  | { configured: true; address: string; error: string }
  | {
      configured: true;
      address: string;
      trxBalance: number;
      energyLimit: number;
      energyUsed: number;
      availableEnergy: number;
      availableBandwidth: number;
      estimatedSendsRemaining: number;
    };

export async function getSponsorStatus(): Promise<SponsorStatus> {
  const tronWeb = getSponsorTronWeb();
  const address = getSponsorAddress();

  if (!tronWeb || !address) return { configured: false };

  try {
    const [account, resources] = await Promise.all([
      withRetry(() => tronWeb.trx.getAccount(address)),
      withRetry(() => tronWeb.trx.getAccountResources(address)),
    ]);

    const trxBalance      = ((account as any).balance || 0) / 1_000_000;
    const energyLimit     = (resources as any).EnergyLimit || 0;
    const energyUsed      = (resources as any).EnergyUsed  || 0;
    const availableEnergy = energyLimit - energyUsed;
    const bwFree          = (resources as any).freeNetLimit  || 0;
    const bwFreeUsed      = (resources as any).freeNetUsed   || 0;
    const bwStaked        = (resources as any).NetLimit      || 0;
    const bwStakedUsed    = (resources as any).NetUsed       || 0;
    const availableBandwidth = bwFree - bwFreeUsed + bwStaked - bwStakedUsed;

    return {
      configured: true,
      address,
      trxBalance,
      energyLimit,
      energyUsed,
      availableEnergy,
      availableBandwidth,
      estimatedSendsRemaining: Math.floor(availableEnergy / MIN_ENERGY_FOR_USDT),
    };
  } catch (err: any) {
    return { configured: true, address, error: err.message };
  }
}

export async function stakeTRXForEnergy(amountTRX: number): Promise<{ txid: string }> {
  const tronWeb = getSponsorTronWeb();
  if (!tronWeb) throw new Error("Sponsor wallet not configured");

  const amountSun = Math.floor(amountTRX * 1_000_000);
  const tx = await (tronWeb.transactionBuilder as any).freezeBalanceV2(amountSun, "ENERGY");
  const pk = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  const signedTx = await tronWeb.trx.sign(tx, pk);
  const result = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result) throw new Error(`Stake failed: ${JSON.stringify(result)}`);
  return { txid: (result as any).txid };
}

// ── Pre-broadcast resource readiness ───────────────────────────────────────

export interface ReadinessResult {
  ok: boolean;
  /** Human-readable reason when ok=false. */
  reason?: string;
  /** Top-up tx hash if a TRX transfer was sent to close the gap. */
  topUpTxid?: string;
  topUpAmountTRX?: number;
  /** Diagnostics (always populated, useful for logging + admin status). */
  diagnostics: {
    energyAvailable: number;
    energyRequired: number;
    energyFeeSun: number;
    trxAvailableSun: number;
    trxRequiredSun: number;
    sponsorBalanceSun?: number;
  };
}

/**
 * Guarantee that `userAddress` has enough on-chain resources to broadcast
 * `txCount` TRC-20 transfers RIGHT NOW.
 *
 * Resource model (per tx):
 *   - Energy:    MIN_ENERGY_FOR_USDT (delegated OR burned from user TRX)
 *   - Bandwidth: BANDWIDTH_BURN_PER_TX_SUN (always burned from user TRX)
 *
 * Required user TRX = (energy_gap × energyFee) + (bandwidthBurn × txCount) + pad
 * where energy_gap = max(0, energyRequired − energyAvailable).
 *
 * If user TRX is short, sends the gap from sponsor wallet and polls
 * user balance until the transfer settles on-chain (no setTimeout race).
 *
 * Returns ok=false (does NOT throw) if sponsor cannot cover the gap or
 * the top-up tx doesn't settle in time — caller decides how to surface
 * to the client (e.g. HTTP 503).
 */
export async function ensureUserReadyForSend(
  userAddress: string,
  txCount = 1,
): Promise<ReadinessResult> {
  const tronWeb        = getSponsorTronWeb();
  const sponsorAddress = getSponsorAddress();
  if (!tronWeb || !sponsorAddress) {
    throw new Error("Sponsor wallet not configured");
  }

  const energyFeeSun = await getEnergyFeeSun();

  // Snapshot user resources + balance in parallel.
  const [userAccount, userResources] = await Promise.all([
    withRetry(() => tronWeb.trx.getAccount(userAddress)),
    withRetry(() => tronWeb.trx.getAccountResources(userAddress)),
  ]);
  const trxAvailableSun: number = (userAccount as any).balance ?? 0;
  const energyLimit:     number = (userResources as any).EnergyLimit ?? 0;
  const energyUsed:      number = (userResources as any).EnergyUsed  ?? 0;
  const energyAvailable        = Math.max(0, energyLimit - energyUsed);

  const energyRequired = MIN_ENERGY_FOR_USDT * txCount;
  const energyGap      = Math.max(0, energyRequired - energyAvailable);
  const burnSun        = energyGap * energyFeeSun;
  const bandwidthSun   = BANDWIDTH_BURN_PER_TX_SUN * txCount;
  const trxRequiredSun = burnSun + bandwidthSun + READINESS_SAFETY_PAD_SUN;

  const diagnostics = {
    energyAvailable,
    energyRequired,
    energyFeeSun,
    trxAvailableSun,
    trxRequiredSun,
  };

  // Fast path — user already has everything they need.
  if (trxAvailableSun >= trxRequiredSun) {
    console.log(
      `[sponsor] Readiness OK for ${userAddress}: ` +
      `energy ${energyAvailable}/${energyRequired}, ` +
      `TRX ${(trxAvailableSun / 1e6).toFixed(3)}/${(trxRequiredSun / 1e6).toFixed(3)}`,
    );
    return { ok: true, diagnostics };
  }

  // Sponsor must cover the gap.
  const gapSun         = trxRequiredSun - trxAvailableSun;
  const sponsorAccount = await withRetry(() => tronWeb.trx.getAccount(sponsorAddress));
  const sponsorBalanceSun: number = (sponsorAccount as any).balance ?? 0;
  diagnostics.trxRequiredSun = trxRequiredSun;
  const diag = { ...diagnostics, sponsorBalanceSun };

  if (sponsorBalanceSun < gapSun + TRX_SPONSOR_RESERVE_SUN) {
    return {
      ok: false,
      reason:
        `Sponsor wallet cannot cover top-up: need ${(gapSun / 1e6).toFixed(3)} TRX ` +
        `(+${(TRX_SPONSOR_RESERVE_SUN / 1e6).toFixed(1)} TRX reserve), ` +
        `sponsor has ${(sponsorBalanceSun / 1e6).toFixed(3)} TRX.`,
      diagnostics: diag,
    };
  }

  console.log(
    `[sponsor] Top-up needed for ${userAddress}: ` +
    `sending ${(gapSun / 1e6).toFixed(3)} TRX ` +
    `(energy gap ${energyGap} × ${energyFeeSun} SUN = ${(burnSun / 1e6).toFixed(3)} TRX + ` +
    `bandwidth ${(bandwidthSun / 1e6).toFixed(3)} TRX + pad ${(READINESS_SAFETY_PAD_SUN / 1e6).toFixed(1)} TRX)`,
  );

  // Build → sign → broadcast TRX transfer.
  let topUpTxid: string;
  try {
    const tx       = await withRetry(() =>
      tronWeb.transactionBuilder.sendTrx(userAddress, gapSun, sponsorAddress),
    );
    const pk       = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
    const signedTx = await tronWeb.trx.sign(tx, pk);
    const result   = await withRetry(() => tronWeb.trx.sendRawTransaction(signedTx));

    if ((result as any).result !== true) {
      return {
        ok: false,
        reason: `TRX top-up rejected: ${decodeTronError(result)}`,
        diagnostics: diag,
      };
    }
    topUpTxid = (result as any).txid as string;
  } catch (err: any) {
    return {
      ok: false,
      reason: `TRX top-up broadcast failed: ${err.message ?? String(err)}`,
      diagnostics: diag,
    };
  }

  // Poll user balance until the top-up actually lands on-chain — DO NOT
  // rely on a fixed setTimeout. A pre-existing bug where the main tx
  // raced ahead of an unsettled top-up was the root cause of repeated
  // OUT_OF_ENERGY reverts.
  const targetSun = trxAvailableSun + gapSun - (READINESS_SAFETY_PAD_SUN / 2); // tolerate slight under-settlement
  const start     = Date.now();
  while (Date.now() - start < TOPUP_SETTLE_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, TOPUP_SETTLE_POLL_MS));
    try {
      const acct: any = await tronWeb.trx.getAccount(userAddress);
      const bal: number = acct.balance ?? 0;
      if (bal >= targetSun) {
        console.log(
          `[sponsor] Top-up settled in ${Date.now() - start}ms ` +
          `(tx ${topUpTxid}, balance ${(bal / 1e6).toFixed(3)} TRX)`,
        );
        return {
          ok: true,
          topUpTxid,
          topUpAmountTRX: gapSun / 1e6,
          diagnostics: { ...diag, trxAvailableSun: bal },
        };
      }
    } catch {
      // Network blip — keep polling
    }
  }

  return {
    ok: false,
    reason:
      `Top-up tx ${topUpTxid} not settled within ${TOPUP_SETTLE_TIMEOUT_MS / 1000}s. ` +
      "Check Tronscan; the send was aborted before broadcast to avoid an OUT_OF_ENERGY revert.",
    topUpTxid,
    topUpAmountTRX: gapSun / 1e6,
    diagnostics: diag,
  };
}

/** Legacy energy delegation — still used if sponsor has high energy staked. */
export async function delegateEnergyToUser(userAddress: string, txCount = 1): Promise<void> {
  const tronWeb        = getSponsorTronWeb();
  const sponsorAddress = getSponsorAddress();
  if (!tronWeb || !sponsorAddress) throw new Error("Sponsor wallet not configured");

  const energyNeeded = MIN_ENERGY_FOR_USDT * txCount;

  const userResources    = await withRetry(() => tronWeb.trx.getAccountResources(userAddress));
  const userEnergy       = ((userResources as any).EnergyLimit || 0) - ((userResources as any).EnergyUsed || 0);
  if (userEnergy >= energyNeeded) {
    console.log(`[sponsor] User ${userAddress} has ${userEnergy} energy — skipping delegation`);
    return;
  }

  const sponsorResources = await withRetry(() => tronWeb.trx.getAccountResources(sponsorAddress));
  const sponsorEnergy    = ((sponsorResources as any).EnergyLimit || 0) - ((sponsorResources as any).EnergyUsed || 0);
  if (sponsorEnergy < energyNeeded) {
    throw new Error(`Sponsor energy insufficient (${sponsorEnergy} available, ${energyNeeded} needed)`);
  }

  const baseDelegateSun = Number(process.env.SPONSOR_DELEGATE_SUN ?? "32000000");
  const delegateSun     = baseDelegateSun * txCount;

  console.log(`[sponsor] Delegating ${delegateSun} sun ENERGY from ${sponsorAddress} to ${userAddress}`);

  const tx = await withRetry(() => (tronWeb.transactionBuilder as any).delegateResource(
    delegateSun, userAddress, "ENERGY", sponsorAddress, false,
  ));
  const pk       = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  // TronWeb's typings for transactionBuilder.delegateResource / trx.sign /
  // trx.sendRawTransaction are too narrow (they expect SignedTransaction<ContractParamter>
  // but the builder returns an `unknown` / loosely-typed object). Cast at the call
  // boundary — runtime shape is correct.
  const signedTx = await tronWeb.trx.sign(tx as any, pk);
  const result   = await withRetry(() => tronWeb.trx.sendRawTransaction(signedTx as any));

  if ((result as any).result !== true) throw new Error(`Delegation failed — ${decodeTronError(result)}`);
  console.log(`[sponsor] Delegation tx: ${(result as any).txid} — waiting 6 s…`);
  await new Promise((r) => setTimeout(r, 6_000));
}

/** Decode a TronGrid hex error message to a human-readable string. */
function decodeTronError(result: any): string {
  const code: string = result?.code ?? "";
  const msgHex: string = result?.message ?? "";
  let msg = "";
  try {
    msg = msgHex ? Buffer.from(msgHex, "hex").toString("utf8").replace(/\x00/g, "").trim() : "";
  } catch { /* ignore */ }
  return msg ? `${code}: ${msg}` : (code || JSON.stringify(result));
}

/**
 * Returns the user's currently-available energy (limit minus used, including
 * delegated energy). Used to verify that an energy rental actually delivered
 * before broadcasting a transaction that depends on it.
 */
export async function getUserAvailableEnergy(userAddress: string): Promise<number> {
  const tronWeb = getSponsorTronWeb() ?? new TronWeb({ fullHost: TRONGRID });
  const resources = await withRetry(() => tronWeb.trx.getAccountResources(userAddress));
  const limit = ((resources as any).EnergyLimit ?? 0) as number;
  const used  = ((resources as any).EnergyUsed  ?? 0) as number;
  return Math.max(0, limit - used);
}

export async function broadcastSignedTx(signedTx: object): Promise<{ txid: string }> {
  const tronWeb = getSponsorTronWeb() ?? new TronWeb({ fullHost: TRONGRID });
  // TronWeb's sendRawTransaction expects SignedTransaction<ContractParamter>, but
  // we accept any pre-signed tx object from the caller. Runtime shape is correct.
  const result  = await withRetry(() => tronWeb.trx.sendRawTransaction(signedTx as any));

  // TronGrid returns { result: true, txid } on success,
  // or { result: false, code: "TAPOS_ERROR", message: "<hex>" } on failure.
  // It can also return { code: "...", message: "..." } without a result field.
  const ok = (result as any).result === true;
  if (!ok) {
    const errMsg = decodeTronError(result);
    throw new Error(`Broadcast rejected by network — ${errMsg}`);
  }
  return { txid: (result as any).txid };
}

/**
 * Wait for a transaction's on-chain receipt and verify the contract executed
 * successfully. Without this check we'd report success even when the contract
 * reverted (e.g. OUT_OF_ENERGY) — the broadcast accepts the tx but execution
 * fails on-chain.
 *
 * Polls getTransactionInfo for up to ~timeoutMs. Returns once receipt.result
 * is set. Throws if the contract reverted.
 */
export async function confirmTxSuccess(
  txid: string,
  timeoutMs = 60_000,
): Promise<{ ok: true; energyUsed: number; netUsed: number }> {
  const tronWeb = getSponsorTronWeb() ?? new TronWeb({ fullHost: TRONGRID });
  const start   = Date.now();
  const pollMs  = 1_500;

  while (Date.now() - start < timeoutMs) {
    let info: any = null;
    try {
      info = await tronWeb.trx.getTransactionInfo(txid);
    } catch {
      // Network blip — keep polling
    }

    // Empty object = not yet indexed by TronGrid — keep polling
    if (info && info.id) {
      const receipt: any   = info.receipt ?? {};
      const energyUsed     = (receipt.energy_usage_total ?? receipt.energy_usage ?? 0) as number;
      const netUsed        = (receipt.net_usage ?? 0) as number;
      // receipt.result is "SUCCESS" / "OUT_OF_ENERGY" / "REVERT" / "OUT_OF_TIME" / etc.
      // info.result === "FAILED" is set when execution failed.
      const receiptResult: string | undefined = receipt.result;
      const txResult: string | undefined      = info.result;

      // Explicit failure — surface immediately
      if (txResult === "FAILED" || (receiptResult && receiptResult !== "SUCCESS")) {
        const reason = decodeContractRevertMessage(info) || receiptResult || "unknown";
        const err: any = new Error(`Transaction reverted on-chain: ${reason}`);
        err.txid = txid;
        err.receipt = receipt;
        throw err;
      }

      // Explicit success — only return when we have a finalized SUCCESS marker.
      // If receipt.result is missing/empty, keep polling — the tx is indexed
      // but execution status hasn't propagated yet.
      if (receiptResult === "SUCCESS") {
        return { ok: true, energyUsed, netUsed };
      }
      // else fall through and poll again
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  // Timed out waiting for indexer — don't claim failure, but flag as unconfirmed
  const err: any = new Error(`Transaction not confirmed within ${Math.round(timeoutMs / 1000)}s — check Tronscan for status`);
  err.txid = txid;
  err.unconfirmed = true;
  throw err;
}

/** Extract a human-readable revert reason from a getTransactionInfo response. */
function decodeContractRevertMessage(info: any): string | null {
  // Standard Solidity revert string lives in contractResult[0] as ABI-encoded bytes
  const cr: string | undefined = info?.contractResult?.[0];
  if (!cr) {
    // Fall back to resMessage from older nodes
    const rm: string | undefined = info?.resMessage;
    if (rm) {
      try {
        return Buffer.from(rm, "hex").toString("utf8").replace(/\x00/g, "").trim() || null;
      } catch { return null; }
    }
    return null;
  }
  try {
    // ABI revert: 0x08c379a0 + offset(32) + length(32) + string
    if (cr.startsWith("08c379a0")) {
      const lenHex = cr.slice(8 + 64, 8 + 128);
      const len    = parseInt(lenHex, 16);
      const strHex = cr.slice(8 + 128, 8 + 128 + len * 2);
      return Buffer.from(strHex, "hex").toString("utf8");
    }
  } catch { /* ignore */ }
  return null;
}
