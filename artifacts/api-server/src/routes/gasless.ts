import { Router, type IRouter } from "express";
import {
  isSponsorConfigured,
  getSponsorStatus,
  stakeTRXForEnergy,
  delegateEnergyToUser,
  broadcastSignedTx,
} from "../lib/sponsor.js";

const router: IRouter = Router();

router.post("/gasless-send", async (req, res): Promise<void> => {
  const { signedTx, userAddress } = req.body;

  if (!signedTx || typeof signedTx !== "object") {
    res.status(400).json({ error: "signedTx (object) is required" });
    return;
  }

  if (!userAddress || typeof userAddress !== "string") {
    res.status(400).json({ error: "userAddress (string) is required" });
    return;
  }

  try {
    let sponsored = false;

    if (isSponsorConfigured()) {
      try {
        await delegateEnergyToUser(userAddress);
        sponsored = true;
      } catch (delegateErr: any) {
        console.warn(`[gasless] Delegation skipped: ${delegateErr.message}`);
      }
    }

    const { txid } = await broadcastSignedTx(signedTx);

    res.json({ txid, sponsored });
  } catch (err: any) {
    console.error("[gasless-send] error:", err);
    res.status(500).json({ error: err.message || "Transaction failed" });
  }
});

router.get("/admin/status", async (_req, res): Promise<void> => {
  try {
    const status = await getSponsorStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/stake", async (req, res): Promise<void> => {
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
