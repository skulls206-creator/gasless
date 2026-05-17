import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Trocador API proxy ────────────────────────────────────────────────────
// Trocador is an aggregated exchange browser supporting 26+ providers.
// Docs: https://trocador.app/en/docs/
// API key is optional for basic quotes (only needed for affiliate revenue).
// We proxy through the backend so the API key stays server-side.

const TROCADOR_API_BASE = "https://trocador.app/api";
const TROCADOR_API_KEY = process.env.TROCADOR_API_KEY ?? "";
const AFFILIATE_ID = "Gasless"; // affiliate name for revenue tracking

// ── Supported asset mapping (frontend key → Trocador ticker) ─────────────

const ASSET_TO_TROCADOR: Record<string, { ticker: string; network?: string }> = {
  BTC: { ticker: "BTC" },
  XMR: { ticker: "XMR" },
  USDT_ETH: { ticker: "USDT", network: "eth" },
  USDT_BASE: { ticker: "USDT", network: "base" },
  USDT_TRON: { ticker: "USDT", network: "trx" },
  USDC_ETH: { ticker: "USDC", network: "eth" },
  USDC_BASE: { ticker: "USDC", network: "base" },
  USDC_TRON: { ticker: "USDC", network: "trx" },
};

// ── POST /swap/quote — fetch a quote from Trocador ───────────────────────

router.post("/swap/quote", async (req, res) => {
  const { from, amount, toAddress } = req.body as {
    from: string;
    amount: string;
    toAddress: string;
  };

  if (!from || !amount || !toAddress) {
    return res.status(400).json({ error: "from, amount, and toAddress are required" });
  }

  const fromAsset = ASSET_TO_TROCADOR[from];
  if (!fromAsset) {
    return res.status(400).json({ error: `Unsupported asset: ${from}` });
  }

  try {
    const params = new URLSearchParams({
      from: fromAsset.ticker,
      to: "USDT",
      amount,
      network: fromAsset.network ?? "",
      to_network: "trx",
      amount_type: "from",
    });

    if (TROCADOR_API_KEY) {
      params.set("api_key", TROCADOR_API_KEY);
    }

    const resp = await fetch(`${TROCADOR_API_BASE}/info?${params.toString()}`, {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`[swap/quote] Trocador ${resp.status}: ${text}`);
      // Return no routes rather than error — swapkit may still work
      return res.json({ routes: [] });
    }

    const data = await resp.json();

    // Trocador returns array of provider quotes
    const routes = (Array.isArray(data) ? data : [data]).map((r: any) => ({
      provider: r.provider || "Trocador",
      estimatedOutput: parseFloat(r.amount_to || "0"),
      fee: parseFloat(r.fee || "0"),
      speed: r.estimated_time || "~5-15 min",
      rateType: r.rate_type === "fixed" ? "fixed" : "float",
      minAmount: parseFloat(r.min || "0"),
      maxAmount: parseFloat(r.max || "0"),
    })).filter((r: any) => r.estimatedOutput > 0);

    return res.json({ routes });
  } catch (err) {
    console.error("[swap/quote] error:", err);
    return res.json({ routes: [] }); // graceful fallback
  }
});

// ── POST /swap/create — create a swap order on Trocador ─────────────────

router.post("/swap/create", async (req, res) => {
  const { from, amount, toAddress, route } = req.body as {
    from: string;
    amount: string;
    toAddress: string;
    route: Record<string, unknown>;
  };

  if (!from || !amount || !toAddress) {
    return res.status(400).json({ error: "from, amount, and toAddress are required" });
  }

  const fromAsset = ASSET_TO_TROCADOR[from];
  if (!fromAsset) {
    return res.status(400).json({ error: `Unsupported asset: ${from}` });
  }

  try {
    const body: Record<string, string> = {
      from: fromAsset.ticker,
      to: "USDT",
      amount,
      address: toAddress,
      network: fromAsset.network ?? "",
      to_network: "trx",
    };

    if (TROCADOR_API_KEY) {
      body["api_key"] = TROCADOR_API_KEY;
    }

    if (route?.provider && typeof route.provider === "string") {
      body["provider"] = route.provider;
    }

    const resp = await fetch(`${TROCADOR_API_BASE}/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`[swap/create] Trocador ${resp.status}: ${text}`);
      return res.status(502).json({ error: "Exchange provider refused the order" });
    }

    const data = (await resp.json()) as Record<string, unknown>;
    return res.json({
      orderId: (data.id ?? data.trade_id ?? null) as string | null,
      depositAddress: (data.payin_address ?? data.deposit_address ?? null) as string | null,
      status: (data.status as string) ?? "pending",
      expiresAt: (data.expires_at as string) ?? null,
      rate: (data.rate as string) ?? null,
    });
  } catch (err) {
    console.error("[swap/create] error:", err);
    return res.status(502).json({ error: "Failed to create swap order" });
  }
});

// ── GET /swap/status/:orderId — check order status ──────────────────────

router.get("/swap/status/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const params = new URLSearchParams({ id: orderId });
    if (TROCADOR_API_KEY) params.set("api_key", TROCADOR_API_KEY);

    const resp = await fetch(`${TROCADOR_API_BASE}/status?${params.toString()}`, {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      return res.status(502).json({ error: "Failed to fetch order status" });
    }

    const data = (await resp.json()) as Record<string, unknown>;
    return res.json({
      status: (data.status as string) ?? "unknown",
      txId: (data.txid ?? data.transaction_id ?? null) as string | null,
      explorerUrl: (data.explorer_url as string) ?? null,
      progress: (Array.isArray(data.progress) ? data.progress : []) as string[],
    });
  } catch (err) {
    console.error("[swap/status] error:", err);
    return res.status(502).json({ error: "Failed to check order status" });
  }
});

export default router;
