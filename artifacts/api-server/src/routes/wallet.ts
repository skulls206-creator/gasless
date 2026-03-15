import { Router, type IRouter } from "express";
import { db, walletBackupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/wallet/sync", async (req, res): Promise<void> => {
  const { accountHash, encryptedPk, address } = req.body;

  if (!accountHash || !encryptedPk || !address) {
    res.status(400).json({ error: "accountHash, encryptedPk, and address are required" });
    return;
  }

  if (typeof accountHash !== "string" || accountHash.length !== 64) {
    res.status(400).json({ error: "accountHash must be a 64-char hex SHA-256 string" });
    return;
  }

  await db
    .insert(walletBackupsTable)
    .values({ accountHash, encryptedPk, address })
    .onConflictDoUpdate({
      target: walletBackupsTable.accountHash,
      set: {
        encryptedPk,
        address,
        updatedAt: new Date(),
      },
    });

  res.json({ ok: true });
});

router.post("/wallet/recover", async (req, res): Promise<void> => {
  const { accountHash } = req.body;

  if (!accountHash || typeof accountHash !== "string" || accountHash.length !== 64) {
    res.status(400).json({ error: "accountHash must be a 64-char hex SHA-256 string" });
    return;
  }

  const [row] = await db
    .select()
    .from(walletBackupsTable)
    .where(eq(walletBackupsTable.accountHash, accountHash))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "No wallet found for this account number" });
    return;
  }

  res.json({ encryptedPk: row.encryptedPk, address: row.address });
});

export default router;
