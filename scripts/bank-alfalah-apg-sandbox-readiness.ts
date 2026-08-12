import { randomUUID } from "node:crypto";
import { encryptApgRequestHash } from "../apps/api/src/services/bank-alfalah-request-hash";
import { parseApgResponse, sanitizeApgMessage } from "../apps/api/src/services/bank-alfalah-response-parser";

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
const contentType = response.headers.get("content-type") ?? "ABSENT";
const responseText = await response.text();
const { body, bodyType, depth } = parseApgResponse(responseText);
const topLevelKeys = Object.keys(body).sort();
const nestedKeys = Object.entries(body)
  .filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
  .flatMap(([name, value]) => Object.keys(value as Record<string, unknown>).map((keyName) => `${name}.${keyName}`))
  .sort();
const successValue = body.success ?? body.Success ?? body.isSuccess ?? body.IsSuccess;
const success = successValue === true || successValue === "true";
const resultCode = body.ResponseCode ?? body.ResultCode ?? body.responseCode ?? body.resultCode ?? body.Code ?? body.code ?? "ABSENT";
const authToken = body.AuthToken ?? body.authToken;
console.log(`HS_HTTP_STATUS=${response.status}`);
console.log(`HS_RESPONSE_CONTENT_TYPE=${contentType.split(";", 1)[0]}`);
console.log(`HS_RESPONSE_BODY_TYPE=${bodyType}`);
console.log(`HS_RESPONSE_BODY_LENGTH=${Buffer.byteLength(responseText, "utf8")}`);
console.log(`HS_RESPONSE_PARSE_DEPTH=${depth}`);
console.log(`HS_RESPONSE_TOP_LEVEL_KEYS=${topLevelKeys.join(",") || "ABSENT"}`);
console.log(`HS_RESPONSE_NESTED_KEYS=${nestedKeys.join(",") || "ABSENT"}`);
console.log(`HS_SUCCESS=${success}`);
console.log(`HS_RESULT_CODE=${String(resultCode).replace(/[^A-Za-z0-9_.-]/g, "") || "ABSENT"}`);
console.log(`HS_ERROR_CODE=${String(body.ErrorCode ?? body.errorCode ?? body.Error ?? "ABSENT").replace(/[^A-Za-z0-9_.-]/g, "") || "ABSENT"}`);
console.log(`HS_ERROR_MESSAGE_SANITIZED=${sanitizeApgMessage(body.ErrorMessage ?? body.errorMessage ?? body.Message ?? body.message)}`);
console.log(`AUTH_TOKEN_PRESENT=${Boolean(authToken)}`);
if (response.status !== 200 || !success || !authToken) process.exitCode = 1;
if (response.status !== 200 || !success || !authToken) return;

const ssoFields = [
  ["AuthToken", String(authToken)],
  ["RequestHash", ""],
  ["ChannelId", "1002"],
  ["Currency", env.BANK_ALFALAH_APG_SSO_CURRENCY || "PKR"],
  ["ReturnURL", env.BANK_ALFALAH_APG_RETURN_URL],
  ["MerchantId", env.BANK_ALFALAH_APG_MERCHANT_ID],
  ["StoreId", env.BANK_ALFALAH_APG_STORE_ID],
  ["MerchantHash", env.BANK_ALFALAH_APG_MERCHANT_HASH],
  ["MerchantUsername", env.BANK_ALFALAH_APG_USERNAME],
  ["MerchantPassword", env.BANK_ALFALAH_APG_PASSWORD],
  ["TransactionTypeId", env.BANK_ALFALAH_APG_SSO_TRANSACTION_TYPE_ID || "3"],
  ["TransactionReferenceNumber", orderId],
  ["TransactionAmount", env.BANK_ALFALAH_APG_SSO_AMOUNT || "1"]
] as const;
const ssoHashFields = [
  "MerchantId", "StoreId", "ChannelId", "MerchantHash", "MerchantUsername", "MerchantPassword",
  "ReturnURL", "Currency", "AuthToken", "TransactionTypeId", "TransactionReferenceNumber", "TransactionAmount"
].map((name) => [name, ssoFields.find(([field]) => field === name)?.[1] || ""] as const);
const ssoRequestHash = encryptApgRequestHash(ssoHashFields, key, iv);
const ssoForm = new URLSearchParams(ssoFields.map(([name, value]) => [name, name === "RequestHash" ? ssoRequestHash : value]));
const ssoResponse = await fetch(`${env.BANK_ALFALAH_APG_BASE_URL}/SSO/SSO/SSO`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html,application/xhtml+xml" },
  body: ssoForm
});
const location = ssoResponse.headers.get("location");
const ssoText = await ssoResponse.text();
let redirectHost = "ABSENT";
let redirectPath = "ABSENT";
if (location) {
  try {
    const parsedLocation = new URL(location, env.BANK_ALFALAH_APG_BASE_URL);
    redirectHost = parsedLocation.host;
    redirectPath = parsedLocation.pathname;
  } catch { /* sanitized metadata remains absent */ }
}
console.log(`SSO_HTTP_STATUS=${ssoResponse.status}`);
console.log(`SSO_CONTENT_TYPE=${(ssoResponse.headers.get("content-type") || "ABSENT").split(";", 1)[0]}`);
console.log(`SSO_RESPONSE_TYPE=${/html/i.test(ssoResponse.headers.get("content-type") || "") ? "html" : "text"}`);
console.log(`SSO_RESPONSE_LENGTH=${Buffer.byteLength(ssoText, "utf8")}`);
console.log(`SSO_REDIRECT_PRESENT=${Boolean(location)}`);
console.log(`SSO_REDIRECT_HOST=${redirectHost}`);
console.log(`SSO_REDIRECT_PATH=${redirectPath}`);
console.log(`SSO_CHECKOUT_MARKER_PRESENT=${/(payment|checkout|otp|alfalah)/i.test(ssoText)}`);
}

void main();
