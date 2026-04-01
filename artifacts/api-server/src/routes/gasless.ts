import { Router, type IRouter } from "express";
import { TronWeb } from "tronweb";
import {
  isSponsorConfigured,
  getSponsorStatus,
  stakeTRXForEnergy,
  delegateEnergyToUser,
  broadcastSignedTx,
} from "../lib/sponsor.js";

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

  try {
    let sponsored = false;

    if (isSponsorConfigured()) {
      try {
        await delegateEnergyToUser(userAddress, txCount);
        sponsored = true;
      } catch (delegateErr: any) {
        console.warn(`[gasless] Delegation skipped: ${delegateErr.message}`);
      }
    }

    const { txid } = await broadcastSignedTx(signedTx);

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
    const status = await getSponsorStatus();
    res.json(status);
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
