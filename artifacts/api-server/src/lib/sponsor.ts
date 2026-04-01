import { TronWeb } from "tronweb";

const TRONGRID = "https://api.trongrid.io";

const MIN_ENERGY_FOR_USDT = 65_000;
const TRX_TOPUP_AMOUNT_SUN = 2_000_000;   // 2 TRX sent to user
const TRX_TOPUP_THRESHOLD_SUN = 1_000_000; // top-up if user < 1 TRX
const TRX_SPONSOR_RESERVE_SUN = 5_000_000; // always keep 5 TRX in sponsor wallet

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

  if (!tronWeb || !address) return { configured: false };

  try {
    const [account, resources] = await Promise.all([
      tronWeb.trx.getAccount(address),
      tronWeb.trx.getAccountResources(address),
    ]);

    const trxBalance      = ((account as any).balance || 0) / 1_000_000;
    const energyLimit     = (resources as any).EnergyLimit || 0;
    const energyUsed      = (resources as any).EnergyUsed  || 0;
    const availableEnergy = energyLimit - energyUsed;
    const bwFree          = (resources as any).freeNetLimit  || 0;
    const bwFreeUsed      = (resources as any).freeNetUsed   || 0;
    const bwStaked        = (resources as any).NetLimit      || 0;
    const bwStakedUsed    = (resources as any).NetUsed       || 0;
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
  const tx = await (tronWeb.transactionBuilder as any).freezeBalanceV2(amountSun, "ENERGY");
  const pk = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  const signedTx = await tronWeb.trx.sign(tx, pk);
  const result = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result) throw new Error(`Stake failed: ${JSON.stringify(result)}`);
  return { txid: (result as any).txid };
}

/**
 * Top-up a user's TRX balance so they can pay the network fee for a USDT
 * transfer.  Only transfers if the user's balance is below the threshold.
 * The ~$0.05–0.12 cost is covered by the $1 service fee collected per send.
 */
export async function topUpUserTRX(
  userAddress: string,
): Promise<{ topped: boolean; amountTRX?: number; txid?: string }> {
  const tronWeb       = getSponsorTronWeb();
  const sponsorAddress = getSponsorAddress();
  if (!tronWeb || !sponsorAddress) throw new Error("Sponsor wallet not configured");

  // Check user TRX balance
  const userAccount   = await tronWeb.trx.getAccount(userAddress);
  const userBalanceSun: number = (userAccount as any).balance ?? 0;

  if (userBalanceSun >= TRX_TOPUP_THRESHOLD_SUN) {
    console.log(`[sponsor] User ${userAddress} has ${userBalanceSun / 1e6} TRX — no top-up needed`);
    return { topped: false };
  }

  // Check sponsor has enough TRX to spare
  const sponsorAccount   = await tronWeb.trx.getAccount(sponsorAddress);
  const sponsorBalanceSun: number = (sponsorAccount as any).balance ?? 0;

  if (sponsorBalanceSun < TRX_TOPUP_AMOUNT_SUN + TRX_SPONSOR_RESERVE_SUN) {
    throw new Error(
      `Sponsor TRX low (${(sponsorBalanceSun / 1e6).toFixed(2)} TRX). ` +
      "Please top up the sponsor wallet.",
    );
  }

  console.log(
    `[sponsor] Topping up ${TRX_TOPUP_AMOUNT_SUN / 1e6} TRX to ${userAddress} ` +
    `(user had ${userBalanceSun / 1e6} TRX)`,
  );

  const tx       = await tronWeb.transactionBuilder.sendTrx(userAddress, TRX_TOPUP_AMOUNT_SUN, sponsorAddress);
  const pk       = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  const signedTx = await tronWeb.trx.sign(tx, pk);
  const result   = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result && !(result as any).txid) {
    throw new Error(`TRX top-up failed: ${JSON.stringify(result)}`);
  }

  const txid = (result as any).txid as string;
  console.log(`[sponsor] TRX top-up tx: ${txid} — waiting 3 s…`);
  await new Promise((r) => setTimeout(r, 3_000));

  return { topped: true, amountTRX: TRX_TOPUP_AMOUNT_SUN / 1e6, txid };
}

/** Legacy energy delegation — still used if sponsor has high energy staked. */
export async function delegateEnergyToUser(userAddress: string, txCount = 1): Promise<void> {
  const tronWeb        = getSponsorTronWeb();
  const sponsorAddress = getSponsorAddress();
  if (!tronWeb || !sponsorAddress) throw new Error("Sponsor wallet not configured");

  const energyNeeded = MIN_ENERGY_FOR_USDT * txCount;

  const userResources    = await tronWeb.trx.getAccountResources(userAddress);
  const userEnergy       = ((userResources as any).EnergyLimit || 0) - ((userResources as any).EnergyUsed || 0);
  if (userEnergy >= energyNeeded) {
    console.log(`[sponsor] User ${userAddress} has ${userEnergy} energy — skipping delegation`);
    return;
  }

  const sponsorResources = await tronWeb.trx.getAccountResources(sponsorAddress);
  const sponsorEnergy    = ((sponsorResources as any).EnergyLimit || 0) - ((sponsorResources as any).EnergyUsed || 0);
  if (sponsorEnergy < energyNeeded) {
    throw new Error(`Sponsor energy insufficient (${sponsorEnergy} available, ${energyNeeded} needed)`);
  }

  const baseDelegateSun = Number(process.env.SPONSOR_DELEGATE_SUN ?? "32000000");
  const delegateSun     = baseDelegateSun * txCount;

  console.log(`[sponsor] Delegating ${delegateSun} sun ENERGY from ${sponsorAddress} to ${userAddress}`);

  const tx = await (tronWeb.transactionBuilder as any).delegateResource(
    delegateSun, userAddress, "ENERGY", sponsorAddress, false,
  );
  const pk       = normalizePk(process.env.SPONSOR_PRIVATE_KEY!.trim());
  const signedTx = await tronWeb.trx.sign(tx, pk);
  const result   = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result) throw new Error(`Delegation failed: ${JSON.stringify(result)}`);
  console.log(`[sponsor] Delegation tx: ${(result as any).txid} — waiting 6 s…`);
  await new Promise((r) => setTimeout(r, 6_000));
}

export async function broadcastSignedTx(signedTx: object): Promise<{ txid: string }> {
  const tronWeb = getSponsorTronWeb() ?? new TronWeb({ fullHost: TRONGRID });
  const result  = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!(result as any).result && !(result as any).txid) {
    throw new Error(`Broadcast failed: ${JSON.stringify(result)}`);
  }
  return { txid: (result as any).txid };
}
