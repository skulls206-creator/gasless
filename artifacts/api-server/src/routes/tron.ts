import { Router, type IRouter } from "express";

const TRONGRID_API_URL = "https://api.trongrid.io";
const USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

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

    const response = await fetch(`${TRONGRID_API_URL}/wallet/triggerconstantcontract`, {
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

export default router;
