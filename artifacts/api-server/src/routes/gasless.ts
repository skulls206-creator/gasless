import { Router, type IRouter } from "express";
import { TronWeb } from "tronweb";
import {
  isSponsorConfigured,
  getSponsorStatus,
  stakeTRXForEnergy,
  topUpUserTRX,
  delegateEnergyToUser,
  broadcastSignedTx,
  confirmTxSuccess,
  getUserAvailableEnergy,
  type SponsorStatus,
} from "../lib/sponsor.js";
import { isRentalConfigured, rentEnergyForUser, getRentalBalance } from "../lib/energyRent.js";

// USDT (TRC-20) contract address on TRON mainnet
const USDT_CONTRACT_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13c"; // without leading 41

const FEE_AMOUNT = 1; // USDT

function getFeeRecipient(): string | null {
  return process.env.FEE_RECIPIENT_ADDRESS || process.env.SPONSOR_ADDRESS || null;
}

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return next(); // No secret set → open (dev/initial setup mode)
  const provided = req.headers["x-admin-secret"] || req.query.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

/**
 * Validate a signed TRON transaction object:
 *  1. Must be a TriggerSmartContract call (TRC-20 transfer)
 *  2. Must target the USDT contract
 *  3. owner_address (hex) must match the claimed userAddress (base58)
 *
 * Returns null if valid, or an error string if invalid.
 */
function validateSignedTx(signedTx: any, userAddress: string): string | null {
  try {
    const contracts = signedTx?.raw_data?.contract;
    if (!Array.isArray(contracts) || contracts.length === 0) {
      return "Invalid transaction structure: missing contract array";
    }

    const contract = contracts[0];

    // Must be a smart-contract call (covers TRC-20 transfers)
    if (contract.type !== "TriggerSmartContract") {
      return `Rejected: only TRC-20 smart contract calls are allowed (got ${contract.type})`;
    }

    const value = contract?.parameter?.value;
    if (!value) {
      return "Invalid transaction: missing parameter value";
    }

    // Contract address must be USDT
    const contractAddrHex: string = (value.contract_address ?? "").toLowerCase().replace(/^41/, "");
    if (contractAddrHex !== USDT_CONTRACT_HEX) {
      return `Rejected: transaction targets an unsupported contract (${value.contract_address})`;
    }

    // owner_address must match the supplied userAddress
    // TronWeb stores addresses as hex "41..." internally
    const ownerHex: string = (value.owner_address ?? "").toLowerCase().replace(/^41/, "");
    if (!ownerHex) {
      return "Invalid transaction: missing owner_address";
    }

    // Convert the claimed base58 userAddress to its raw hex for comparison
    let claimedHex: string;
    try {
      const full = TronWeb.address.toHex(userAddress); // returns "41..."
      claimedHex = full.toLowerCase().replace(/^41/, "");
    } catch {
      return "Invalid userAddress: not a valid TRON base58 address";
    }

    if (ownerHex !== claimedHex) {
      return "Rejected: transaction owner does not match userAddress";
    }

    // Must have at least one signature
    if (!Array.isArray(signedTx.signature) || signedTx.signature.length === 0) {
      return "Transaction is not signed";
    }

    return null; // all good
  } catch (err: any) {
    return `Validation error: ${err?.message ?? String(err)}`;
  }
}

// ── Public endpoints ───────────────────────────────────────────────────────

/**
 * Minimal public endpoint — no sensitive data exposed.
 * Returns whether sponsorship is active and an estimated sends-remaining count
 * so the Send page can show the right UX without requiring admin auth.
 */
router.get("/sponsor-info", async (_req, res): Promise<void> => {
  try {
    const configured = isSponsorConfigured();
    if (!configured) {
      res.json({ configured: false, active: false });
      return;
    }

    const [status, rental] = await Promise.all([
      getSponsorStatus(),
      isRentalConfigured() ? getRentalBalance() : Promise.resolve(null),
    ]);

    // Narrow to the full status shape to read staked-energy fields
    const fullStatus = "estimatedSendsRemaining" in status
      ? (status as Extract<SponsorStatus, { estimatedSendsRemaining: number }>)
      : null;

    // Staked energy sends (from own delegated pool)
    const stakedSends    = fullStatus?.estimatedSendsRemaining ?? 0;
    // Rental capacity sends
    const rentalSends    = rental?.estimatedSendsRemaining ?? 0;
    const totalEstimated = stakedSends + rentalSends;

    // Sponsor is "active" if it has staked energy OR if rental is configured
    // (rental can source energy on-demand as long as the sponsor has TRX)
    const hasStakedEnergy = (fullStatus?.availableEnergy ?? 0) > 0;
    const rentalReady     = isRentalConfigured() && (rental?.trxBalance ?? 0) > 0;
    const active = hasStakedEnergy || rentalReady;

    res.json({
      configured: true,
      active,
      estimatedSendsRemaining: totalEstimated > 0 ? totalEstimated : null,
    });
  } catch {
    res.json({ configured: false, active: false });
  }
});

/**
 * Proxy TRX/USD price from CoinGecko (free tier, no API key required).
 * Cached for 60 s to avoid hammering the public endpoint.
 */
let trxPriceCache: { usd: number; fetchedAt: number } | null = null;
const TRX_PRICE_TTL_MS = 60_000;

router.get("/trx-price", async (_req, res): Promise<void> => {
  try {
    const now = Date.now();
    if (trxPriceCache && now - trxPriceCache.fetchedAt < TRX_PRICE_TTL_MS) {
      res.json({ usd: trxPriceCache.usd });
      return;
    }

    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000) },
    );

    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    const data = await response.json() as { tron?: { usd?: number } };
    const usd = data?.tron?.usd;
    if (typeof usd !== "number" || usd <= 0) throw new Error("Invalid price response");

    trxPriceCache = { usd, fetchedAt: now };
    res.json({ usd });
  } catch (err: any) {
    console.warn("[trx-price] fetch failed:", err.message);
    // Fall back to cache if available, even if stale
    if (trxPriceCache) {
      res.json({ usd: trxPriceCache.usd, stale: true });
      return;
    }
    res.status(503).json({ error: "TRX price unavailable" });
  }
});

router.get("/config", (_req, res): void => {
  const feeRecipient = getFeeRecipient();
  res.json({
    feeAmount: FEE_AMOUNT,
    feeRecipient: feeRecipient ?? null,
    feesEnabled: !!feeRecipient,
  });
});

router.post("/gasless-send", async (req, res): Promise<void> => {
  const { signedTx, signedFeeTx, userAddress } = req.body;

  // ── Basic shape checks ──────────────────────────────────────────────────
  if (!signedTx || typeof signedTx !== "object" || Array.isArray(signedTx)) {
    res.status(400).json({ error: "signedTx (object) is required" });
    return;
  }

  if (!userAddress || typeof userAddress !== "string" || !userAddress.startsWith("T") || userAddress.length < 30) {
    res.status(400).json({ error: "userAddress must be a valid TRON base58 address" });
    return;
  }

  // ── Verify the main transaction belongs to the claimed user ─────────────
  const txValidationError = validateSignedTx(signedTx, userAddress);
  if (txValidationError) {
    console.warn(`[gasless] Rejected send from ${userAddress}: ${txValidationError}`);
    res.status(400).json({ error: txValidationError });
    return;
  }

  // ── Validate fee transaction if present ─────────────────────────────────
  const hasFee = signedFeeTx && typeof signedFeeTx === "object" && !Array.isArray(signedFeeTx);
  if (hasFee) {
    const feeValidationError = validateSignedTx(signedFeeTx, userAddress);
    if (feeValidationError) {
      console.warn(`[gasless] Rejected fee tx from ${userAddress}: ${feeValidationError}`);
      res.status(400).json({ error: `Fee transaction invalid: ${feeValidationError}` });
      return;
    }
  }

  const txCount = hasFee ? 2 : 1;
  // Per-tx budget: 130k covers USDT transfer + SSTORE penalty (TIP-491) for
  // first-time recipients with TronWeb's safety headroom.
  const energyNeeded = 130_000 * txCount;

  try {
    let sponsored = false;

    if (isSponsorConfigured()) {
      let energyOk = false;

      // Priority 1 — on-demand energy rental (external provider, scales without staking)
      if (isRentalConfigured()) {
        try {
          const rental = await rentEnergyForUser(userAddress, energyNeeded);
          console.log(
            `[gasless] Energy rented via ${rental.provider}: ${rental.energyDelegated} energy claimed` +
            ` (cost: ${rental.costTrx} TRX${rental.ref ? ", ref: " + rental.ref : ""})`,
          );

          // Verify the energy actually arrived on-chain. Providers sometimes
          // deliver less than ordered (or with delay). Without this check, an
          // under-delivered rental would still cause OUT_OF_ENERGY revert.
          const delivered = await getUserAvailableEnergy(userAddress);
          if (delivered >= energyNeeded) {
            console.log(`[gasless] Rental delivery verified: ${delivered} energy available on-chain`);
            energyOk  = true;
            sponsored = true;
          } else {
            console.warn(
              `[gasless] Rental under-delivered: only ${delivered} of ${energyNeeded} energy ` +
              `available on-chain — falling back to staked delegation`,
            );
          }
        } catch (rentErr: any) {
          console.warn(`[gasless] Energy rental failed: ${rentErr.message} — trying staked delegation`);
        }
      }

      // Priority 2 — delegate from sponsor's own staked energy pool (free if stake is available)
      if (!energyOk) {
        try {
          await delegateEnergyToUser(userAddress, txCount);
          energyOk  = true;
          sponsored = true;
          console.log("[gasless] Energy delegation from staked pool succeeded");
        } catch (delegateErr: any) {
          console.log(`[gasless] Staked delegation unavailable: ${delegateErr.message}`);
        }
      }

      // Priority 3 — TRX top-up: send TRX so the user can cover the fee themselves
      if (!energyOk) {
        try {
          const topUp = await topUpUserTRX(userAddress);
          if (topUp.topped) {
            console.log(`[gasless] TRX top-up: ${topUp.amountTRX} TRX sent to ${userAddress} (tx: ${topUp.txid})`);
            sponsored = true;
          }
        } catch (topUpErr: any) {
          console.warn(`[gasless] TRX top-up skipped: ${topUpErr.message}`);
        }
      }
    }

    const { txid } = await broadcastSignedTx(signedTx);
    console.log(`[gasless] Broadcasted main tx: ${txid} — waiting for on-chain confirmation`);

    // Verify the contract executed successfully BEFORE charging the service
    // fee. Without this, an OUT_OF_ENERGY revert would still get billed and
    // the user would see a false "Sent" screen.
    try {
      const receipt = await confirmTxSuccess(txid);
      console.log(`[gasless] Tx ${txid} confirmed (energy: ${receipt.energyUsed}, net: ${receipt.netUsed})`);
    } catch (confirmErr: any) {
      // Surface the failure with the txid so the UI can link to Tronscan
      console.error(`[gasless] Tx ${txid} did NOT succeed: ${confirmErr.message}`);
      res.status(502).json({
        error: confirmErr.message || "Transaction reverted on-chain",
        txid,
        unconfirmed: !!confirmErr.unconfirmed,
        sponsored,
      });
      return;
    }

    // Main tx succeeded — now broadcast the $1 service fee transfer.
    let feeTxid: string | undefined;
    if (hasFee) {
      try {
        const feeResult = await broadcastSignedTx(signedFeeTx);
        feeTxid = feeResult.txid;
      } catch (feeErr: any) {
        console.warn(`[gasless] Fee broadcast failed: ${feeErr.message}`);
      }
    }

    res.json({ txid, feeTxid, sponsored });
  } catch (err: any) {
    console.error("[gasless-send] error:", err);
    res.status(500).json({ error: err.message || "Transaction failed" });
  }
});

// ── Admin endpoints (protected) ────────────────────────────────────────────

router.get("/admin/status", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const [status, rental] = await Promise.all([
      getSponsorStatus(),
      getRentalBalance(),
    ]);
    res.json({ ...status, rental: rental ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/stake", requireAdmin, async (req, res): Promise<void> => {
  const { amountTRX } = req.body;
  const amount = parseFloat(amountTRX);

  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "amountTRX must be a positive number" });
    return;
  }

  try {
    const result = await stakeTRXForEnergy(amount);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
