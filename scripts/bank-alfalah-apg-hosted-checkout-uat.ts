// R9.3-APG-FULL-UAT-20260827
//
// Submits ONE sandbox payment through the Bank-hosted checkout page reached
// via HS1001 -> AuthToken -> SSO redirect, using the form contract proven
// by bank-alfalah-apg-hosted-checkout-recon.ts (PaymentTypeId 1/2/3, field
// names AlfaWalletNumber/AccountNumber/CardNumber/CVV/ExpiryMonth/
// ExpiryYear/CardTypeId, OTP fields alfaSMSOTP/alfaEmailOTP/alfalahOTP).
// Mode is selected by APG_UAT_MODE=wallet|account|card|all.
//
// Sanitized output only: HTTP status/redirect target/response markers and
// any Bank-issued transaction reference. NEVER logs merchant credentials,
// AES keys, RequestHash, AuthToken, the CSRF/base64 hidden tokens, or any
// Bank sandbox test instrument value (wallet/account/card/CVV/OTP).
import { encryptApgRequestHash } from "../apps/api/src/services/bank-alfalah-request-hash";
import { parseApgResponse } from "../apps/api/src/services/bank-alfalah-response-parser";

function extractSetCookies(response: Response): string[] {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}
function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([n, v]) => `${n}=${v}`).join("; ");
}
function mergeCookies(jar: Map<string, string>, setCookies: string[]): void {
  for (const raw of setCookies) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function hiddenValue(html: string, name: string): string {
  const m = html.match(new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"));
  return m?.[1] ?? "";
}

const MODE = (process.env.APG_UAT_MODE || "wallet") as "wallet" | "account" | "card" | "all";

async function main(): Promise<void> {
  const env = process.env;
  const required = [
    "BANK_ALFALAH_APG_MERCHANT_ID", "BANK_ALFALAH_APG_STORE_ID", "BANK_ALFALAH_APG_MERCHANT_HASH",
    "BANK_ALFALAH_APG_USERNAME", "BANK_ALFALAH_APG_PASSWORD", "BANK_ALFALAH_APG_AES_KEY", "BANK_ALFALAH_APG_AES_IV",
    "BANK_ALFALAH_APG_BASE_URL", "BANK_ALFALAH_APG_RETURN_URL"
  ] as const;
  for (const name of required) if (!env[name]) throw new Error(`BANK_APG_SECRET_MISSING:${name}`);
  const key = env.BANK_ALFALAH_APG_AES_KEY!;
  const iv = env.BANK_ALFALAH_APG_AES_IV!;
  const cookieJar = new Map<string, string>();
  const orderId = `THN-SBX-UAT-${MODE.toUpperCase()}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  console.log(`UAT_MODE=${MODE}`);
  console.log(`UAT_ORDER_ID=${orderId}`);

  // 1. HS1001 (Channel 1001, IsRedirectionRequest=0 -- Bank-confirmed).
  const hsFields = [
    ["HS_MerchantId", env.BANK_ALFALAH_APG_MERCHANT_ID!], ["HS_StoreId", env.BANK_ALFALAH_APG_STORE_ID!],
    ["HS_ChannelId", "1001"], ["HS_MerchantHash", env.BANK_ALFALAH_APG_MERCHANT_HASH!],
    ["HS_MerchantUsername", env.BANK_ALFALAH_APG_USERNAME!], ["HS_MerchantPassword", env.BANK_ALFALAH_APG_PASSWORD!],
    ["HS_IsRedirectionRequest", "0"], ["HS_ReturnURL", env.BANK_ALFALAH_APG_RETURN_URL!], ["HS_RequestHash", ""],
    ["HS_IsBIN", "0"], ["HS_TransactionReferenceNumber", orderId], ["handshake", ""]
  ] as const;
  const hsHash = encryptApgRequestHash(hsFields, key, iv);
  const hsForm = new URLSearchParams(hsFields.filter(([n]) => n !== "handshake").map(([n, v]) => [n, n === "HS_RequestHash" ? hsHash : v]));
  const hsResponse = await fetch(`${env.BANK_ALFALAH_APG_BASE_URL}/HS/HS/HS`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json,text/html" }, body: hsForm
  });
  mergeCookies(cookieJar, extractSetCookies(hsResponse));
  const { body: hsBody } = parseApgResponse(await hsResponse.text());
  const authToken = hsBody.AuthToken ?? hsBody.authToken;
  console.log(`HS1001_HTTP_STATUS=${hsResponse.status}`);
  console.log(`HS1001_AUTH_TOKEN_PRESENT=${Boolean(authToken)}`);
  if (typeof authToken !== "string" || !authToken) { console.log("UAT_STOPPED=NO_AUTH_TOKEN"); process.exitCode = 1; return; }

  // 2. SSO redirect.
  const ssoFieldOrder = ["MerchantId", "StoreId", "ChannelId", "MerchantHash", "MerchantUsername", "MerchantPassword", "ReturnURL", "Currency", "IsBIN", "RequestHash", "AuthToken", "TransactionTypeId", "TransactionReferenceNumber", "TransactionAmount", "run"];
  const ssoValues: Record<string, string> = {
    AuthToken: String(authToken), RequestHash: "", ChannelId: "1001", Currency: env.BANK_ALFALAH_APG_SSO_CURRENCY || "PKR",
    IsBIN: "0", ReturnURL: env.BANK_ALFALAH_APG_RETURN_URL!, MerchantId: env.BANK_ALFALAH_APG_MERCHANT_ID!,
    StoreId: env.BANK_ALFALAH_APG_STORE_ID!, MerchantHash: env.BANK_ALFALAH_APG_MERCHANT_HASH!,
    MerchantUsername: env.BANK_ALFALAH_APG_USERNAME!, MerchantPassword: env.BANK_ALFALAH_APG_PASSWORD!,
    TransactionTypeId: env.BANK_ALFALAH_APG_SSO_TRANSACTION_TYPE_ID || "3", TransactionReferenceNumber: orderId,
    TransactionAmount: env.BANK_ALFALAH_APG_SSO_AMOUNT || "1", run: ""
  };
  const ssoRequestHash = encryptApgRequestHash(ssoFieldOrder.map((n) => [n, ssoValues[n] ?? ""] as const), key, iv);
  ssoValues.RequestHash = ssoRequestHash;
  const ssoForm = new URLSearchParams(Object.entries(ssoValues).filter(([n]) => n !== "run"));
  const ssoResponse = await fetch(`${env.BANK_ALFALAH_APG_BASE_URL}/SSO/SSO/SSO`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html,application/xhtml+xml", cookie: cookieHeader(cookieJar) },
    body: ssoForm
  });
  mergeCookies(cookieJar, extractSetCookies(ssoResponse));
  const location = ssoResponse.headers.get("location");
  console.log(`SSO_HTTP_STATUS=${ssoResponse.status}`);
  if (!location) { console.log("UAT_STOPPED=NO_SSO_REDIRECT"); process.exitCode = 1; return; }

  // 3. GET hosted page, extract CSRF/base64 hidden tokens (never logged).
  const hostedUrl = new URL(location, env.BANK_ALFALAH_APG_BASE_URL);
  const hostedGet = await fetch(hostedUrl, { method: "GET", headers: { accept: "text/html", cookie: cookieHeader(cookieJar) } });
  mergeCookies(cookieJar, extractSetCookies(hostedGet));
  const hostedHtml = await hostedGet.text();
  const verificationToken = hiddenValue(hostedHtml, "__RequestVerificationToken");
  const base64Token = hiddenValue(hostedHtml, "base64");
  console.log(`HOSTED_PAGE_HTTP_STATUS=${hostedGet.status}`);
  console.log(`HOSTED_PAGE_TOKENS_CAPTURED=${Boolean(verificationToken) && Boolean(base64Token)}`);
  if (!verificationToken) { console.log("UAT_STOPPED=NO_CSRF_TOKEN"); process.exitCode = 1; return; }

  // 4. Build mode-specific payment payload from GitHub-secret sandbox instruments only.
  const paymentTypeId = MODE === "wallet" ? "1" : MODE === "account" ? "2" : MODE === "card" ? "3" : "";
  const payload: Record<string, string> = {
    __RequestVerificationToken: verificationToken,
    base64: base64Token,
    PaymentTypeId: paymentTypeId,
    CustomerName: "ThanNow Sandbox UAT"
  };
  if (MODE === "wallet" || MODE === "all") {
    payload.AlfaWalletNumber = env.APG_SANDBOX_ALFA_WALLET || "";
    payload.alfaCountry = "164";
    payload.alfaMobileNumber = env.APG_SANDBOX_ALFA_WALLET || "";
    payload.alfaEmailAddress = "sandbox-uat@thannow.com";
    payload.alfaSMSOTP = env.APG_SANDBOX_SMS_OTP || "";
    payload.alfaEmailOTP = env.APG_SANDBOX_EMAIL_OTP || "";
  }
  if (MODE === "account" || MODE === "all") {
    payload.AccountNumber = env.APG_SANDBOX_ALFALAH_ACCOUNT || "";
    payload.alfalahCountry = "164";
    payload.alfalahMobileNumber = env.APG_SANDBOX_ALFALAH_ACCOUNT || "";
    payload.alfalahEmailAddress = "sandbox-uat@thannow.com";
    payload.alfalahOTP = env.APG_SANDBOX_SMS_OTP || "";
  }
  if (MODE === "card" || MODE === "all") {
    payload.CardNumber = env.APG_SANDBOX_CARD_NUMBER || "";
    payload.CVV = env.APG_SANDBOX_CARD_CVV || "";
    const [expMonth, expYear] = (env.APG_SANDBOX_CARD_EXPIRY || "").split("/");
    payload.ExpiryMonth = expMonth || "";
    payload.ExpiryYear = expYear || "";
    payload.CardTypeId = "2"; // Mastercard -- test PAN 5440... is a Mastercard BIN per SELECT_OPTIONS[CardTypeId]
    payload.cardCountry = "164";
    payload.cardMobileNumber = env.APG_SANDBOX_ALFA_WALLET || "";
    payload.cardEmailAddress = "sandbox-uat@thannow.com";
  }

  const submitResponse = await fetch(hostedUrl, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html,application/xhtml+xml", cookie: cookieHeader(cookieJar) },
    body: new URLSearchParams(payload)
  });
  mergeCookies(cookieJar, extractSetCookies(submitResponse));
  const submitLocation = submitResponse.headers.get("location");
  const submitHtml = submitLocation ? "" : await submitResponse.text();
  console.log(`SUBMIT_HTTP_STATUS=${submitResponse.status}`);
  console.log(`SUBMIT_REDIRECT_PRESENT=${Boolean(submitLocation)}`);
  if (submitLocation) {
    const target = new URL(submitLocation, hostedUrl);
    console.log(`SUBMIT_REDIRECT_HOST=${target.host}`);
    console.log(`SUBMIT_REDIRECT_PATH=${target.pathname}`);
    console.log(`SUBMIT_REDIRECT_QUERY_KEYS=${[...target.searchParams.keys()].join(",") || "ABSENT"}`);
  } else {
    const titleMatch = submitHtml.match(/<title>([^<]*)<\/title>/i);
    console.log(`SUBMIT_RESPONSE_TITLE=${(titleMatch?.[1] ?? "ABSENT").replace(/[^\x20-\x7e]/g, "").slice(0, 120)}`);
    console.log(`SUBMIT_RESPONSE_LENGTH=${Buffer.byteLength(submitHtml, "utf8")}`);
    const errorMatch = submitHtml.match(/(?:error|invalid|declin\w*|fail\w*)[^<]{0,160}/i);
    console.log(`SUBMIT_ERROR_MARKER=${errorMatch ? errorMatch[0].replace(/[^\x20-\x7e]/g, "").trim() : "ABSENT"}`);
    const txnMatch = submitHtml.match(/(?:TransactionId|TxnId|Transaction Reference)[^0-9A-Za-z]{0,5}([A-Za-z0-9-]{4,40})/i);
    console.log(`SUBMIT_TRANSACTION_ID=${txnMatch ? txnMatch[1] : "ABSENT"}`);
  }

  // 5. Bank-side OrderStatus (authoritative check -- never trust the redirect alone).
  const statusResponse = await fetch(
    `${env.BANK_ALFALAH_APG_BASE_URL}/HS/api/IPN/OrderStatus/${encodeURIComponent(env.BANK_ALFALAH_APG_MERCHANT_ID!)}/${encodeURIComponent(env.BANK_ALFALAH_APG_STORE_ID!)}/${encodeURIComponent(orderId)}`,
    { method: "GET", headers: { accept: "application/json" } }
  );
  const statusBody = await statusResponse.json().catch(() => null) as Record<string, unknown> | null;
  console.log(`ORDERSTATUS_HTTP_STATUS=${statusResponse.status}`);
  console.log(`ORDERSTATUS_RESPONSE_CODE=${String(statusBody?.ResponseCode ?? "ABSENT")}`);
  console.log(`ORDERSTATUS_TRANSACTION_STATUS=${String(statusBody?.TransactionStatus ?? "ABSENT")}`);
  console.log(`ORDERSTATUS_TRANSACTION_ID=${String(statusBody?.TransactionId ?? "ABSENT")}`);
}

void main();
