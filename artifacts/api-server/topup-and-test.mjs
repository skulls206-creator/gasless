import { TronWeb } from "tronweb";
const HEADERS = process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : {};
const sponsor = new TronWeb({ fullHost: "https://api.trongrid.io", headers: HEADERS, privateKey: process.env.SPONSOR_PRIVATE_KEY.replace(/^0x/i,"") });
const USER = process.env.GASLESS_TEST_WALLET_ADDRESS;

console.log("→ Sending 2 TRX from sponsor to user…");
const tx = await sponsor.transactionBuilder.sendTrx(USER, 2_000_000, process.env.SPONSOR_ADDRESS);
const signed = await sponsor.trx.sign(tx, process.env.SPONSOR_PRIVATE_KEY.replace(/^0x/i,""));
const res = await sponsor.trx.sendRawTransaction(signed);
console.log("  topup txid:", res.txid);
console.log("  waiting 4s…");
await new Promise(r => setTimeout(r, 4000));

// Now attempt the user's USDT transfer directly via TronWeb (no backend)
const user = new TronWeb({ fullHost: "https://api.trongrid.io", headers: HEADERS, privateKey: process.env.GASLESS_TEST_WALLET_PRIVATE.replace(/^0x/i,"") });
console.log("\n→ Building & broadcasting USDT transfer 0.5 USDT user → sponsor…");
const r2 = await user.transactionBuilder.triggerSmartContract(
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "transfer(address,uint256)",
  { feeLimit: 150_000_000, expiration: 600_000 },
  [{ type: "address", value: process.env.SPONSOR_ADDRESS }, { type: "uint256", value: "500000" }],
  user.address.toHex(USER),
);
const signed2 = await user.trx.sign(r2.transaction, process.env.GASLESS_TEST_WALLET_PRIVATE.replace(/^0x/i,""));
const res2 = await user.trx.sendRawTransaction(signed2);
console.log("  broadcast result:", JSON.stringify(res2, null, 2));

if (res2.result || res2.txid) {
  console.log("\n  waiting 8s for confirmation…");
  await new Promise(r => setTimeout(r, 8000));
  const info = await user.trx.getTransactionInfo(res2.txid);
  console.log("  tx info:", JSON.stringify({
    txid: info.id,
    blockNumber: info.blockNumber,
    receipt: info.receipt,
    contractResult: info.contractResult,
    result: info.result,
  }, null, 2));
}
