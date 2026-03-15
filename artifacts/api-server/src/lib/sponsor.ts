import { TronWeb } from "tronweb";

const TRONGRID = "https://api.trongrid.io";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const MIN_ENERGY_FOR_USDT = 65_000;

function normalizePk(pk: string): string {
  return pk.startsWith("0x") || pk.startsWith("0X") ? pk.slice(2) : pk;
}

function getSponsorTronWeb(): InstanceType<typeof TronWeb> | null {
  const rawPk = process.env.SPONSOR_PRIVATE_KEY;
  if (!rawPk) return null;
  const pk = normalizePk(rawPk.trim());
  return new TronWeb({ fullHost: TRONGRID, privateKey: pk });
}

function getSponsorAddress(): string | null {
  return process.env.SPONSOR_ADDRESS || null;
}

export function isSponsorConfigured(): boolean {
  return !!(process.env.SPONSOR_PRIVATE_KEY && process.env.SPONSOR_ADDRESS);
}

export async function getSponsorStatus() {
  const tronWeb = getSponsorTronWeb();
  const address = getSponsorAddress();

  if (!tronWeb || !address) {
    return { configured: false };
  }

  try {
    const [account, resources] = await Promise.all([
      tronWeb.trx.getAccount(address),
      tronWeb.trx.getAccountResources(address),
    ]);

    const trxBalance = ((account as any).balance || 0) / 1_000_000;
    const energyLimit = (resources as any).EnergyLimit || 0;
    const energyUsed = (resources as any).EnergyUsed || 0;
    const availableEnergy = energyLimit - energyUsed;
    const bwFree = (resources as any).freeNetLimit || 0;
    const bwFreeUsed = (resources as any).freeNetUsed || 0;
    const bwStaked = (resources as any).NetLimit || 0;
    const bwStakedUsed = (resources as any).NetUsed || 0;
    const availableBandwidth = bwFree - bwFreeUsed + bwStaked - bwStakedUsed;

    return {
      configured: true,
      address,
      trxBalance,
      energyLimit,
      energyUsed,
      availableEnergy,
      availableBandwidth,
      estimatedSendsRemaining: Math.floor(availableEnergy / MIN_ENERGY_FOR_USDT),
    };
  } catch (err: any) {
    return { configured: true, address, error: err.message };
  }
}

export async function stakeTRXForEnergy(amountTRX: number): Promise<{ txid: string }> {
  const tronWeb = getSponsorTronWeb();
  if (!tronWeb) throw new Error("Sponsor wallet not configured");

  const amountSun = Math.floor(amountTRX * 1_000_000);
  const tx = await (tronWeb.transactionBuilder as any).freezeBalanceV2(
    amountSun,
    "ENERGY",
  );

  const pk = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  const signedTx = await tronWeb.trx.sign(tx, pk);
  const result = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result) {
    throw new Error(`Stake failed: ${JSON.stringify(result)}`);
  }

  return { txid: (result as any).txid };
}

export async function delegateEnergyToUser(userAddress: string, txCount = 1): Promise<void> {
  const tronWeb = getSponsorTronWeb();
  const sponsorAddress = getSponsorAddress();

  if (!tronWeb || !sponsorAddress) {
    throw new Error("Sponsor wallet not configured");
  }

  const energyNeeded = MIN_ENERGY_FOR_USDT * txCount;

  const userResources = await tronWeb.trx.getAccountResources(userAddress);
  const userEnergy =
    ((userResources as any).EnergyLimit || 0) - ((userResources as any).EnergyUsed || 0);

  if (userEnergy >= energyNeeded) {
    console.log(`[sponsor] User ${userAddress} has ${userEnergy} energy — skipping delegation`);
    return;
  }

  const sponsorResources = await tronWeb.trx.getAccountResources(sponsorAddress);
  const sponsorEnergy =
    ((sponsorResources as any).EnergyLimit || 0) - ((sponsorResources as any).EnergyUsed || 0);

  if (sponsorEnergy < energyNeeded) {
    throw new Error(
      `Sponsor has insufficient energy (${sponsorEnergy}). Please stake more TRX via POST /api/admin/stake`,
    );
  }

  const baseDelegateSun = Number(process.env.SPONSOR_DELEGATE_SUN ?? "32000000");
  const delegateSun = baseDelegateSun * txCount;

  console.log(
    `[sponsor] Delegating ${delegateSun} sun of ENERGY from ${sponsorAddress} to ${userAddress} (covering ${txCount} tx)`,
  );

  const tx = await (tronWeb.transactionBuilder as any).delegateResource(
    delegateSun,
    userAddress,
    "ENERGY",
    sponsorAddress,
    false,
  );

  const pk = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  const signedTx = await tronWeb.trx.sign(tx, pk);
  const result = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result) {
    throw new Error(`Delegation failed: ${JSON.stringify(result)}`);
  }

  console.log(`[sponsor] Delegation tx: ${(result as any).txid} — waiting for confirmation…`);
  await new Promise((r) => setTimeout(r, 6000));
}

export async function broadcastSignedTx(signedTx: object): Promise<{ txid: string }> {
  const tronWeb = getSponsorTronWeb() ?? new TronWeb({ fullHost: TRONGRID });
  const result = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result && !(result as any).txid) {
    throw new Error(`Broadcast failed: ${JSON.stringify(result)}`);
  }

  return { txid: (result as any).txid };
}
