import { TronWeb } from "tronweb";

export const USDT_CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const TRONGRID_API_URL = "https://api.trongrid.io";

export function getTronWeb(privateKey?: string) {
  // Use public TronGrid endpoints. For a production app at scale, an API key is recommended.
  const config: any = {
    fullHost: TRONGRID_API_URL,
    headers: { "TRON-PRO-API-KEY": "" },
  };
  
  if (privateKey) {
    config.privateKey = privateKey;
  }
  
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
 * The private key signs locally — it is never sent to the server.
 * Returns the signed tx object to be submitted to /api/gasless-send.
 */
export async function buildAndSignUSDTTransfer(
  privateKey: string,
  fromAddress: string,
  toAddress: string,
  amount: number,
): Promise<object> {
  const tronWeb = getTronWeb(privateKey);
  const amountInSun = Math.floor(amount * 1_000_000).toString();

  const { transaction } = await (tronWeb.transactionBuilder as any).triggerSmartContract(
    USDT_CONTRACT_ADDRESS,
    "transfer(address,uint256)",
    { feeLimit: 150_000_000 },
    [
      { type: "address", value: toAddress },
      { type: "uint256", value: amountInSun },
    ],
    tronWeb.address.toHex(fromAddress),
  );

  const signedTx = await tronWeb.trx.sign(transaction, privateKey);
  return signedTx;
}
