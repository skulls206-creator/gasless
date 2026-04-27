import { Router, type IRouter } from "express";
import { TronWeb } from "tronweb";

const TRONGRID_API_URL = "https://api.trongrid.io";
const USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export function getTronGridHeaders(): Record<string, string> {
  const apiKey = process.env.TRONGRID_API_KEY;
  return apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
}

function getBackendTronWeb() {
  return new TronWeb({ fullHost: TRONGRID_API_URL, headers: getTronGridHeaders() });
}

/**
 * Retry a TronGrid fetch up to `maxTries` times on 429 / 5xx,
 * with exponential back-off (1 s → 2 s → 4 s).
 */
async function tronFetchWithRetry(
  url: string,
  init: RequestInit = {},
  maxTries = 4,
): Promise<Response> {
  const headers = { ...getTronGridHeaders(), ...(init.headers as Record<string, string> ?? {}) };
  let delay = 1000;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const res = await fetch(url, { ...init, headers });
    if (res.status !== 429 && res.status < 500) return res;
    lastErr = new Error(`TronGrid ${res.status}`);
    if (attempt < maxTries) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw lastErr;
}

/**
 * Wrap a TronWeb call so that if TronGrid 429s we retry with back-off.
 */
async function withTronRetry<T>(fn: () => Promise<T>, maxTries = 4): Promise<T> {
  let delay = 1000;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      const is429 = msg.includes("429") || msg.includes("Too Many");
      if (!is429 || attempt >= maxTries) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw lastErr;
}

const router: IRouter = Router();

function encodeAddressToAbi(hexAddress: string): string {
  const withoutPrefix = hexAddress.startsWith("41")
    ? hexAddress.slice(2)
    : hexAddress.replace(/^0x/, "");
  return withoutPrefix.padStart(64, "0");
}

function base58ToHex(address: string): string | null {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt(0);
  for (const c of address) {
    const idx = chars.indexOf(c);
    if (idx < 0) return null;
    n = n * 58n + BigInt(idx);
  }
  const hex = n.toString(16).padStart(50, "0");
  return hex.slice(0, 42);
}

router.get("/tron/balance/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || address.length < 30) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    const hexAddress = base58ToHex(address);
    if (!hexAddress) return res.status(400).json({ error: "Could not decode address" });

    const parameter = encodeAddressToAbi(hexAddress);

    const response = await tronFetchWithRetry(`${TRONGRID_API_URL}/wallet/triggerconstantcontract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_address: address,
        contract_address: USDT_CONTRACT_ADDRESS,
        function_selector: "balanceOf(address)",
        parameter,
        visible: true,
      }),
    });

    const json: any = await response.json();
    const hex: string = json?.constant_result?.[0];

    if (!hex) {
      console.error("TronGrid balance error for", address, JSON.stringify(json).slice(0, 200));
      return res.json({ balance: 0 });
    }

    const balanceSun = parseInt(hex, 16);
    const balance = isNaN(balanceSun) ? 0 : balanceSun / 1_000_000;
    return res.json({ balance });
  } catch (err) {
    console.error("Balance proxy error:", err);
    return res.json({ balance: 0 });
  }
});

// Build an unsigned USDT transfer transaction server-side so the browser
// never calls TronGrid directly (avoids per-IP rate limits and 401s from
// empty/missing API keys).
router.post("/tron/build-transfer", async (req, res) => {
  const { fromAddress, toAddress, amount } = req.body as {
    fromAddress: string;
    toAddress: string;
    amount: number;
  };

  if (!fromAddress || !toAddress || !amount || amount <= 0) {
    return res.status(400).json({ error: "fromAddress, toAddress, and amount are required" });
  }

  try {
    const tronWeb = getBackendTronWeb();
    const amountInSun = Math.floor(amount * 1_000_000).toString();

    const result: any = await withTronRetry(() =>
      (tronWeb.transactionBuilder as any).triggerSmartContract(
        USDT_CONTRACT_ADDRESS,
        "transfer(address,uint256)",
        { feeLimit: 150_000_000, expiration: 600_000 },  // 10-minute window (default is 60s)
        [
          { type: "address", value: toAddress },
          { type: "uint256", value: amountInSun },
        ],
        tronWeb.address.toHex(fromAddress),
      ),
    );

    if (!result?.transaction) {
      return res.status(500).json({ error: "Failed to build transaction", detail: result });
    }

    return res.json({ transaction: result.transaction });
  } catch (err: any) {
    console.error("[build-transfer] error:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Failed to build transaction" });
  }
});

// ── Account resources proxy ────────────────────────────────────────────────
// Uses /wallet/getaccountresource (not /v1/accounts) so that delegated-in
// energy is included in EnergyLimit, not just the user's own staked energy.
router.get("/tron/resources/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || address.length < 30) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    const response = await tronFetchWithRetry(
      `${TRONGRID_API_URL}/wallet/getaccountresource`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, visible: true }),
      },
    );
    const data: any = await response.json();

    const freeNetLimit = data.freeNetLimit ?? 600;
    const freeNetUsed = data.freeNetUsed ?? 0;
    const NetLimit = data.NetLimit ?? 0;
    const NetUsed = data.NetUsed ?? 0;
    const EnergyLimit = data.EnergyLimit ?? 0;
    const EnergyUsed = data.EnergyUsed ?? 0;
    const availableBandwidth = (freeNetLimit - freeNetUsed) + (NetLimit - NetUsed);
    const availableEnergy = EnergyLimit - EnergyUsed;

    return res.json({
      freeNetLimit, freeNetUsed, NetLimit, NetUsed,
      EnergyLimit, EnergyUsed,
      availableBandwidth,
      availableEnergy,
      isSufficientForTRC20: availableBandwidth >= 300 && availableEnergy >= 13_000,
    });
  } catch (err: any) {
    console.error("[resources] error:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Failed to fetch resources" });
  }
});

// ── TRC-20 transaction history proxy ───────────────────────────────────────
router.get("/tron/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const { fingerprint, limit = "50" } = req.query as { fingerprint?: string; limit?: string };

  if (!address || address.length < 30) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    let url =
      `${TRONGRID_API_URL}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
      `?contract_address=${USDT_CONTRACT_ADDRESS}&limit=${Number(limit) || 50}&only_confirmed=true`;
    if (fingerprint) url += `&fingerprint=${encodeURIComponent(fingerprint)}`;

    const response = await tronFetchWithRetry(url);
    const json: any = await response.json();

    return res.json({
      data: Array.isArray(json.data) ? json.data : [],
      meta: json.meta ?? {},
    });
  } catch (err: any) {
    console.error("[transactions] error:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Failed to fetch transactions" });
  }
});

export default router;
