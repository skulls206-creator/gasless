import { TronWeb } from "tronweb";

const FROM = process.env.GASLESS_TEST_WALLET_ADDRESS;
const PK   = process.env.GASLESS_TEST_WALLET_PRIVATE.replace(/^0x/, "");
const TO   = "TJHVwn4ebkrQ6yyZ81dEyEHVJeUZVsFNJc";
const AMT  = 0.50;
const FEE  = 1.00; // $1 service fee → fee recipient (same address in this test)

async function buildSignedTransfer(toAddr, amount) {
  const buildRes = await fetch("http://localhost:80/api/tron/build-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromAddress: FROM, toAddress: toAddr, amount }),
  });
  const buildJson = await buildRes.json();
  if (!buildJson.transaction) throw new Error("Build failed: " + JSON.stringify(buildJson));

  // Sign locally — TronWeb doesn't need a fullHost for offline signing
  const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io", privateKey: PK });
  return await tronWeb.trx.sign(buildJson.transaction, PK);
}

console.log("→ Building main transfer:", FROM, "→", TO, AMT, "USDT");
const signedTx = await buildSignedTransfer(TO, AMT);
console.log("→ Signed main txid:", signedTx.txID);

console.log("→ Building $1 fee transfer:", FROM, "→", TO, FEE, "USDT (fee recipient)");
const signedFeeTx = await buildSignedTransfer(TO, FEE);
console.log("→ Signed fee txid:", signedFeeTx.txID);

console.log("→ Submitting to /api/gasless-send …");
const resp = await fetch("http://localhost:80/api/gasless-send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ signedTx, signedFeeTx, userAddress: FROM }),
});
const status = resp.status;
const body = await resp.json();
console.log("\n=== RESULT ===");
console.log("HTTP:", status);
console.log(JSON.stringify(body, null, 2));
