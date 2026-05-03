import { TronWeb } from "tronweb";

const SPONSOR_PRIVATE_KEY = process.env.SPONSOR_PRIVATE_KEY.replace(/^0x/i, "");
const SPONSOR = process.env.SPONSOR_ADDRESS;
const USER = process.env.GASLESS_TEST_WALLET_ADDRESS;
const HEADERS = process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : {};

const tw = new TronWeb({ fullHost: "https://api.trongrid.io", headers: HEADERS, privateKey: SPONSOR_PRIVATE_KEY });

async function broadcast(tx) {
  const signed = await tw.trx.sign(tx, SPONSOR_PRIVATE_KEY);
  const res = await tw.trx.sendRawTransaction(signed);
  if (!res.result && !res.txid) throw new Error("Broadcast failed: " + JSON.stringify(res));
  return res.txid || res.transaction?.txID;
}

console.log(`Sponsor: ${SPONSOR}`);
console.log(`User:    ${USER}`);

// Step 1: Check sponsor's existing BANDWIDTH stake
const r = await fetch("https://api.trongrid.io/wallet/getaccountresource", {
  method: "POST", headers: { "Content-Type": "application/json", ...HEADERS },
  body: JSON.stringify({ address: SPONSOR, visible: true }),
}).then(r => r.json());
const sponsorNetLimit = (r.NetLimit || 0);
console.log(`Sponsor current NetLimit (bandwidth from stake): ${sponsorNetLimit}`);

// Step 2: If sponsor has < 1500 bandwidth-from-stake, freeze 5 TRX for bandwidth
const STAKE_AMOUNT_SUN = 5_000_000;
if (sponsorNetLimit < 1500) {
  console.log(`→ Freezing 5 TRX for BANDWIDTH on sponsor…`);
  const freezeTx = await tw.transactionBuilder.freezeBalanceV2(STAKE_AMOUNT_SUN, "BANDWIDTH", SPONSOR);
  const freezeTxid = await broadcast(freezeTx);
  console.log(`  freeze txid: ${freezeTxid}`);
  console.log(`  waiting 5s for confirmation…`);
  await new Promise(r => setTimeout(r, 5000));
} else {
  console.log(`→ Sponsor already has enough bandwidth stake`);
}

// Step 3: Delegate ALL of the 5 TRX bandwidth to the user (lock=false so we can undelegate later)
console.log(`→ Delegating ${STAKE_AMOUNT_SUN/1e6} TRX of BANDWIDTH from sponsor → user…`);
const delegateTx = await tw.transactionBuilder.delegateResource(STAKE_AMOUNT_SUN, USER, "BANDWIDTH", SPONSOR, false);
const delegateTxid = await broadcast(delegateTx);
console.log(`  delegate txid: ${delegateTxid}`);
console.log(`  waiting 5s for confirmation…`);
await new Promise(r => setTimeout(r, 5000));

// Step 4: Verify user's bandwidth went up
const r2 = await fetch("https://api.trongrid.io/wallet/getaccountresource", {
  method: "POST", headers: { "Content-Type": "application/json", ...HEADERS },
  body: JSON.stringify({ address: USER, visible: true }),
}).then(r => r.json());
console.log(`User now has: NetLimit=${r2.NetLimit||0}, NetUsed=${r2.NetUsed||0}, freeNet=${(r2.freeNetLimit||0)-(r2.freeNetUsed||0)}, energy=${(r2.EnergyLimit||0)-(r2.EnergyUsed||0)}`);
