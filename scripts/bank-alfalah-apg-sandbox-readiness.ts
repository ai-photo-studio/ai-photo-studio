import { randomUUID } from "node:crypto";
import { encryptApgRequestHash } from "../apps/api/src/services/bank-alfalah-request-hash";

async function main(): Promise<void> {
const env = process.env;
const required = [
  "BANK_ALFALAH_APG_MERCHANT_ID",
  "BANK_ALFALAH_APG_STORE_ID",
  "BANK_ALFALAH_APG_MERCHANT_HASH",
  "BANK_ALFALAH_APG_USERNAME",
  "BANK_ALFALAH_APG_PASSWORD",
  "BANK_ALFALAH_APG_AES_KEY",
  "BANK_ALFALAH_APG_AES_IV"
] as const;

for (const name of required) {
  if (!env[name]) throw new Error(`BANK_APG_SECRET_MISSING:${name}`);
}

const key = env.BANK_ALFALAH_APG_AES_KEY;
const iv = env.BANK_ALFALAH_APG_AES_IV;
if (Buffer.byteLength(key, "utf8") !== 16) throw new Error("BANK_APG_AES_SECRET_INVALID:KEY");
if (Buffer.byteLength(iv, "utf8") !== 16) throw new Error("BANK_APG_AES_SECRET_INVALID:IV");

console.log("RUNNER_IMPORT=PASS");
console.log("AES_KEY_PRESENT=PASS");
console.log("AES_KEY_LENGTH_VALID=PASS");
console.log("AES_IV_PRESENT=PASS");
console.log("AES_IV_LENGTH_VALID=PASS");

const orderId = `THN-SBX-HS-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const fields = [
  ["HS_ChannelId", "1002"],
  ["HS_MerchantId", env.BANK_ALFALAH_APG_MERCHANT_ID],
  ["HS_StoreId", env.BANK_ALFALAH_APG_STORE_ID],
  ["HS_ReturnURL", env.BANK_ALFALAH_APG_RETURN_URL],
  ["HS_MerchantHash", env.BANK_ALFALAH_APG_MERCHANT_HASH],
  ["HS_MerchantUsername", env.BANK_ALFALAH_APG_USERNAME],
  ["HS_MerchantPassword", env.BANK_ALFALAH_APG_PASSWORD],
  ["HS_TransactionReferenceNumber", orderId]
] as const;
const requestHash = encryptApgRequestHash(fields, key, iv);
console.log("REQUESTHASH_GENERATION=PASS");

if (env.APG_READINESS_DRY_RUN === "true") {
  console.log("HS_SKIPPED=DRY_RUN");
  process.exit(0);
}

const response = await fetch(`${env.BANK_ALFALAH_APG_BASE_URL}/HS/api/HSAPI/HSAPI`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    HS_ChannelId: fields[0][1],
    HS_MerchantId: fields[1][1],
    HS_StoreId: fields[2][1],
    HS_ReturnURL: fields[3][1],
    HS_MerchantHash: fields[4][1],
    HS_MerchantUsername: fields[5][1],
    HS_MerchantPassword: fields[6][1],
    HS_TransactionReferenceNumber: fields[7][1],
    HS_RequestHash: requestHash
  })
});
const body = await response.json().catch(() => ({})) as Record<string, unknown>;
const success = body.success === true || body.success === "true";
const resultCode = body.ResponseCode ?? body.ResultCode ?? body.responseCode ?? "ABSENT";
console.log(`HS_HTTP_STATUS=${response.status}`);
console.log(`HS_SUCCESS=${success}`);
console.log(`HS_RESULT_CODE=${String(resultCode).replace(/[^A-Za-z0-9_.-]/g, "") || "ABSENT"}`);
console.log(`AUTH_TOKEN_PRESENT=${Boolean(body.AuthToken)}`);
if (response.status !== 200 || !success || !body.AuthToken) process.exitCode = 1;
}

void main();
