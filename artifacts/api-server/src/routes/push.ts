import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getTronGridHeaders } from "./tron.js";

const router: IRouter = Router();

const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"] ?? "";
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_EMAIL = process.env["VAPID_EMAIL"] ?? "mailto:admin@gasless.one";
const TRONGRID_API_URL = "https://api.trongrid.io";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** Fetch with retry on 429/5xx and exponential back-off */
async function tronFetchWithRetry(url: string, maxTries = 4): Promise<Response> {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const res = await fetch(url, { headers: getTronGridHeaders() });
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt < maxTries) await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
  throw new Error("TronGrid rate limit exceeded after retries");
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/push/vapid-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post("/push/subscribe", async (req, res) => {
  const { address, subscription } = req.body as {
    address: string;
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  };

  if (!address || !subscription?.endpoint || !subscription.keys) {
    return res.status(400).json({ error: "Missing address or subscription" });
  }

  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({
        address,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { address, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return res.status(500).json({ error: "Failed to save subscription" });
  }
});

router.post("/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body as { endpoint: string };
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
    return res.json({ ok: true });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return res.status(500).json({ error: "Failed to remove subscription" });
  }
});

// ── Transaction Poller ────────────────────────────────────────────────────────

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — remove it
      await db
        .delete(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
    }
    return false;
  }
}

async function pollTransactions() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  let subs: typeof pushSubscriptionsTable.$inferSelect[] = [];
  try {
    subs = await db.select().from(pushSubscriptionsTable);
  } catch {
    return;
  }

  for (const sub of subs) {
    // Stagger calls 500 ms apart so we don't burst the free-tier quota
    await new Promise((r) => setTimeout(r, 500));

    try {
      const res = await tronFetchWithRetry(
        `${TRONGRID_API_URL}/v1/accounts/${sub.address}/transactions/trc20?contract_address=${USDT_CONTRACT}&limit=5&only_confirmed=true`,
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      const txs: any[] = Array.isArray(json.data) ? json.data : [];
      if (txs.length === 0) continue;

      const latestTx = txs[0];
      const latestId: string = latestTx.transaction_id;

      // Skip if we've already seen this tx
      if (sub.lastSeenTx === latestId) continue;

      // Only notify for incoming transfers
      if (latestTx.to !== sub.address) {
        // Still update lastSeenTx so we don't re-check
        await db
          .update(pushSubscriptionsTable)
          .set({ lastSeenTx: latestId })
          .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
        continue;
      }

      const rawAmount = parseInt(latestTx.value ?? "0", 10);
      const amount = isNaN(rawAmount) ? "?" : (rawAmount / 1_000_000).toFixed(2);
      const from = latestTx.from
        ? `${latestTx.from.slice(0, 6)}…${latestTx.from.slice(-4)}`
        : "unknown";

      await sendPush(sub, {
        title: `+${amount} USDT received`,
        body: `From ${from} on TRON network`,
        url: "/history",
        amount,
        from,
      });

      await db
        .update(pushSubscriptionsTable)
        .set({ lastSeenTx: latestId })
        .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
    } catch (err) {
      console.error(`Poll error for ${sub.address}:`, err);
    }
  }
}

// Poll every 30 seconds
let pollerStarted = false;
export function startTransactionPoller() {
  if (pollerStarted) return;
  pollerStarted = true;
  setInterval(pollTransactions, 30_000);
  console.log("Transaction notification poller started (30s interval)");
}

export default router;
