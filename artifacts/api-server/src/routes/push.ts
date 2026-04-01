import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getTronGridHeaders } from "./tron.js";
import { getSponsorStatus, isSponsorConfigured } from "../lib/sponsor.js";

const router: IRouter = Router();

const VAPID_PUBLIC_KEY  = process.env["VAPID_PUBLIC_KEY"]  ?? "";
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_EMAIL       = process.env["VAPID_EMAIL"]       ?? "mailto:admin@gasless.one";
const TRONGRID_API_URL  = "https://api.trongrid.io";
const USDT_CONTRACT     = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// TRX threshold below which we fire a low-balance alert (default 5 TRX)
const LOW_TRX_THRESHOLD = parseFloat(process.env["SPONSOR_LOW_TRX_THRESHOLD"] ?? "5");

// Minimum gap between repeated alerts so we don't spam (1 hour)
const ALERT_COOLDOWN_MS = 60 * 60 * 1_000;
let lastAlertSentAt = 0;

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

function requireAdmin(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers["x-admin-secret"] || req.query.secret;
  if (provided !== secret) return res.status(401).json({ error: "Unauthorized" });
  return next();
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
        endpoint:  subscription.endpoint,
        p256dh:    subscription.keys.p256dh,
        auth:      subscription.keys.auth,
        isAdmin:   "false",
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

/**
 * Admin-only: subscribe the current device to sponsor low-balance alerts.
 * The subscription is stored with isAdmin="true" so the balance monitor
 * knows to include it.
 */
router.post("/push/admin-subscribe", requireAdmin, async (req, res) => {
  const { subscription } = req.body as {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  };

  if (!subscription?.endpoint || !subscription.keys) {
    return res.status(400).json({ error: "Missing subscription" });
  }

  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({
        address:  "admin",
        endpoint: subscription.endpoint,
        p256dh:   subscription.keys.p256dh,
        auth:     subscription.keys.auth,
        isAdmin:  "true",
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          address: "admin",
          p256dh:  subscription.keys.p256dh,
          auth:    subscription.keys.auth,
          isAdmin: "true",
        },
      });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Admin subscribe error:", err);
    return res.status(500).json({ error: "Failed to save admin subscription" });
  }
});

/** Check if the caller's push endpoint is currently registered as an admin subscription. */
router.post("/push/admin-status", requireAdmin, async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

  try {
    const [row] = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.endpoint, endpoint),
          eq(pushSubscriptionsTable.isAdmin, "true"),
        ),
      )
      .limit(1);

    return res.json({ subscribed: !!row });
  } catch (err) {
    return res.status(500).json({ error: "DB error" });
  }
});

// ── Push helper ───────────────────────────────────────────────────────────────

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
      await db
        .delete(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
    }
    return false;
  }
}

// ── Transaction Poller ────────────────────────────────────────────────────────

async function pollTransactions() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  let subs: typeof pushSubscriptionsTable.$inferSelect[] = [];
  try {
    subs = await db.select().from(pushSubscriptionsTable);
  } catch {
    return;
  }

  // Only process non-admin user subscriptions for tx notifications
  const userSubs = subs.filter((s) => s.isAdmin !== "true");

  for (const sub of userSubs) {
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

      if (sub.lastSeenTx === latestId) continue;

      if (latestTx.to !== sub.address) {
        await db
          .update(pushSubscriptionsTable)
          .set({ lastSeenTx: latestId })
          .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
        continue;
      }

      const rawAmount = parseInt(latestTx.value ?? "0", 10);
      const amount    = isNaN(rawAmount) ? "?" : (rawAmount / 1_000_000).toFixed(2);
      const from      = latestTx.from
        ? `${latestTx.from.slice(0, 6)}…${latestTx.from.slice(-4)}`
        : "unknown";

      await sendPush(sub, {
        title: `+${amount} USDT received`,
        body:  `From ${from} on TRON network`,
        url:   "/history",
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

// ── Sponsor Balance Monitor ───────────────────────────────────────────────────

async function pollSponsorBalance() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  if (!isSponsorConfigured()) return;

  try {
    const status = await getSponsorStatus() as any;
    if (!status.configured) return;

    const trxBalance: number = status.trxBalance ?? Infinity;
    const isCritical = trxBalance < LOW_TRX_THRESHOLD;

    if (!isCritical) return;

    // Respect cooldown — don't spam the admin
    const now = Date.now();
    if (now - lastAlertSentAt < ALERT_COOLDOWN_MS) return;

    let adminSubs: typeof pushSubscriptionsTable.$inferSelect[] = [];
    try {
      adminSubs = await db
        .select()
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.isAdmin, "true"));
    } catch {
      return;
    }

    if (adminSubs.length === 0) return;

    const trxRounded = trxBalance.toFixed(2);
    const address    = (status.address as string) ?? "sponsor wallet";
    const short      = `${address.slice(0, 6)}…${address.slice(-4)}`;

    console.warn(
      `[sponsor-monitor] TRX balance low: ${trxRounded} TRX — alerting ${adminSubs.length} admin(s)`,
    );

    for (const sub of adminSubs) {
      await sendPush(sub, {
        title: `⚠️ Sponsor wallet low: ${trxRounded} TRX`,
        body:  `${short} has only ${trxRounded} TRX left. Top up to keep Gasless running.`,
        url:   "/backup",
        type:  "sponsor-low-trx",
      });
    }

    lastAlertSentAt = now;
  } catch (err) {
    console.error("[sponsor-monitor] error:", err);
  }
}

// Poll every 30 seconds for transactions, every 30 minutes for sponsor balance
let pollerStarted = false;
export function startTransactionPoller() {
  if (pollerStarted) return;
  pollerStarted = true;
  setInterval(pollTransactions, 30_000);
  setInterval(pollSponsorBalance, 30 * 60 * 1_000);
  // Run an initial balance check shortly after startup
  setTimeout(pollSponsorBalance, 15_000);
  console.log("Transaction notification poller started (30s interval)");
  console.log(`Sponsor balance monitor started (30 min interval, alert threshold: ${LOW_TRX_THRESHOLD} TRX)`);
}

export default router;
