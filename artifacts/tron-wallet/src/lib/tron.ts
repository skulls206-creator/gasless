import TronWeb from "tronweb";

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
