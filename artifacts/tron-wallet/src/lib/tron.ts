import { TronWeb } from "tronweb";

export const USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const TRONGRID_API_URL = "https://api.trongrid.io";

export function getTronWeb(privateKey?: string) {
  // No API key header — omitting it entirely lets TronGrid use the free tier.
  // Passing an empty string ("") causes a 401; absence of the header does not.
  const config: any = { fullHost: TRONGRID_API_URL };
  if (privateKey) config.privateKey = privateKey;
  return new TronWeb(config);
}

// Encode a base58 address into a zero-padded 32-byte ABI parameter string
function encodeAddressParam(tronWeb: InstanceType<typeof TronWeb>, address: string): string {
  const hexWithPrefix: string = tronWeb.address.toHex(address); // 41...
  const hexWithout41 = hexWithPrefix.slice(2); // strip leading '41'
  return hexWithout41.padStart(64, "0");
}

/**
 * Query USDT balance via our backend proxy.
 * Avoids TronGrid per-IP rate limits that cause silent 0-balance on mobile.
 */
export async function getUSDTBalance(address: string): Promise<number> {
  try {
    const res = await fetch(`/api/tron/balance/${address}`);
    if (!res.ok) return 0;
    const json = await res.json();
    return typeof json.balance === "number" ? json.balance : 0;
  } catch (err) {
    console.error("getUSDTBalance failed:", err);
    return 0;
  }
}

export async function validateAddress(address: string): Promise<boolean> {
  const tronWeb = getTronWeb();
  return tronWeb.isAddress(address);
}

// Derive address from a private key string
export function getAddressFromPrivateKey(privateKey: string): string | null {
  try {
    const tronWeb = getTronWeb(privateKey);
    return tronWeb.defaultAddress.base58 || null;
  } catch (err) {
    console.error("Invalid private key format", err);
    return null;
  }
}

/**
 * Build and sign a USDT TRC-20 transfer transaction.
 *
 * Building is done server-side (/api/tron/build-transfer) so the browser
 * never calls TronGrid directly — prevents 401s from missing/empty API keys
 * and avoids per-IP rate limits on mobile.
 *
 * Signing happens locally in the browser; the private key is never sent
 * anywhere.
 */
export async function buildAndSignUSDTTransfer(
  privateKey: string,
  fromAddress: string,
  toAddress: string,
  amount: number,
): Promise<object> {
  // Step 1 — ask the backend to build the raw unsigned transaction
  const buildRes = await fetch("/api/tron/build-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromAddress, toAddress, amount }),
  });

  if (!buildRes.ok) {
    const err = await buildRes.json().catch(() => ({}));
    throw new Error(err?.error ?? `Build failed (${buildRes.status})`);
  }

  const { transaction } = await buildRes.json();

  // Step 2 — sign locally; no network call
  const tronWeb = getTronWeb(privateKey);
  const signedTx = await tronWeb.trx.sign(transaction, privateKey);
  return signedTx;
}
