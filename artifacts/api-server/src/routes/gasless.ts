import { Router, type IRouter } from "express";
import {
  isSponsorConfigured,
  getSponsorStatus,
  stakeTRXForEnergy,
  delegateEnergyToUser,
  broadcastSignedTx,
} from "../lib/sponsor.js";

const FEE_AMOUNT = 1; // USDT

function getFeeRecipient(): string | null {
  return process.env.FEE_RECIPIENT_ADDRESS || process.env.SPONSOR_ADDRESS || null;
}

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return next(); // No secret set → open (dev/initial setup)
  const provided =
    req.headers["x-admin-secret"] ||
    req.query.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

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

  if (!signedTx || typeof signedTx !== "object") {
    res.status(400).json({ error: "signedTx (object) is required" });
    return;
  }

  if (!userAddress || typeof userAddress !== "string") {
    res.status(400).json({ error: "userAddress (string) is required" });
    return;
  }

  const hasFee = signedFeeTx && typeof signedFeeTx === "object";
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
