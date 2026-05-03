import { TronWeb } from "tronweb";
const HEADERS = process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : {};
const tw = new TronWeb({ fullHost: "https://api.trongrid.io", headers: HEADERS, privateKey: process.env.SPONSOR_PRIVATE_KEY.replace(/^0x/,"") });

const USER = process.env.GASLESS_TEST_WALLET_ADDRESS;
const SPONSOR = process.env.SPONSOR_ADDRESS;

// User account
const uAcct = await fetch("https://api.trongrid.io/wallet/getaccount", {
  method: "POST", headers: {...HEADERS, "Content-Type":"application/json"}, body: JSON.stringify({address:USER, visible:true})
}).then(r=>r.json());
console.log("USER ACCOUNT:");
console.log("  TRX:", (uAcct.balance||0)/1e6);
console.log("  account_resource:", JSON.stringify(uAcct.account_resource||{}));
console.log("  delegated_frozenV2_balance_for_bandwidth:", uAcct.delegated_frozenV2_balance_for_bandwidth);
console.log("  acquired_delegated_frozenV2_balance_for_bandwidth:", uAcct.acquired_delegated_frozenV2_balance_for_bandwidth);

const uRes = await fetch("https://api.trongrid.io/wallet/getaccountresource", {
  method: "POST", headers: {...HEADERS, "Content-Type":"application/json"}, body: JSON.stringify({address:USER, visible:true})
}).then(r=>r.json());
console.log("USER RESOURCE:");
console.log(" ", JSON.stringify(uRes));

// Build a real tx and measure bytes
const amountSun = "500000";
const result = await tw.transactionBuilder.triggerSmartContract(
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "transfer(address,uint256)",
  { feeLimit: 150_000_000, expiration: 600_000 },
  [{ type: "address", value: SPONSOR }, { type: "uint256", value: amountSun }],
  tw.address.toHex(USER),
);
const signed = await tw.trx.sign(result.transaction, process.env.GASLESS_TEST_WALLET_PRIVATE.replace(/^0x/,""));
console.log("\nTX SIZE: raw_data_hex bytes =", signed.raw_data_hex.length / 2);
console.log("Total signed tx serialized ~", JSON.stringify(signed).length, "bytes (JSON, but bandwidth uses protobuf)");

// Also test direct broadcast bypassing our backend to see exact error
console.log("\n--- DIRECT BROADCAST TEST ---");
const br = await tw.trx.sendRawTransaction(signed);
console.log(JSON.stringify(br, null, 2));
