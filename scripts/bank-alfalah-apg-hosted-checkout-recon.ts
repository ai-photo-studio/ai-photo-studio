// R9.3-APG-FULL-UAT-20260827
//
// Read-only reconnaissance of the Bank Alfalah APG hosted checkout page
// reached via HS1001 -> AuthToken -> SSO redirect. This script NEVER
// submits payment-mode selection, wallet/account/card data, or OTP -- it
// only follows the SSO redirect (maintaining the session cookie the Bank
// sets) and reports the hosted page's FORM CONTRACT (field names/types
// only, never values) so a real submission can be built against a proven
// contract instead of a guess. This is the same "discover, don't invent"
// discipline used for the rest of the APG integration.
//
// Sanitized output only: HTTP status/headers/form field names. Never logs
// merchant credentials, AES keys, RequestHash, AuthToken, or any Bank
// sandbox test instrument value.
import { encryptApgRequestHash } from "../apps/api/src/services/bank-alfalah-request-hash";
import { parseApgResponse } from "../apps/api/src/services/bank-alfalah-response-parser";

function extractSetCookies(response: Response): string[] {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeader(cookieJar: Map<string, string>): string {
  return Array.from(cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function mergeCookies(cookieJar: Map<string, string>, setCookies: string[]): void {
  for (const raw of setCookies) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

/** Sanitized form-contract extraction: field NAMES/TYPES only, never values. */
function extractFormContract(html: string): string {
  const forms = [...html.matchAll(/<form\b[^>]*>/gi)];
  const lines: string[] = [];
  forms.forEach((formMatch, i) => {
    const actionMatch = formMatch[0].match(/action=["']([^"']*)["']/i);
    const methodMatch = formMatch[0].match(/method=["']([^"']*)["']/i);
    lines.push(`FORM[${i}] action=${actionMatch?.[1] ?? "ABSENT"} method=${(methodMatch?.[1] ?? "GET").toUpperCase()}`);
  });
  const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => {
    const name = m[0].match(/name=["']([^"']*)["']/i)?.[1] ?? "ABSENT";
    const type = m[0].match(/type=["']([^"']*)["']/i)?.[1] ?? "text";
    return `${name}:${type}`;
  });
  const selects = [...html.matchAll(/<select\b[^>]*name=["']([^"']*)["'][^>]*>/gi)].map((m) => `${m[1]}:select`);
  const buttons = [...html.matchAll(/<button\b[^>]*name=["']([^"']*)["'][^>]*>/gi)].map((m) => `${m[1]}:button`);
  lines.push(`INPUT_FIELDS=${[...new Set([...inputs, ...selects, ...buttons])].sort().join(",") || "ABSENT"}`);

  // Select-element OPTION values are UI mode codes (e.g. payment-type
  // 1/2/3), not customer/financial data -- safe to print in full.
  for (const selectMatch of html.matchAll(/<select\b[^>]*name=["']([^"']*)["'][^>]*>([\s\S]*?)<\/select>/gi)) {
    const [, name, inner] = selectMatch;
    const options = [...inner.matchAll(/<option\b[^>]*value=["']([^"']*)["'][^>]*>([^<]*)</gi)]
      .map(([, value, text]) => `${value}=${text.trim().replace(/[^\x20-\x7e]/g, "").slice(0, 40)}`);
    lines.push(`SELECT_OPTIONS[${name}]=${options.join("|") || "ABSENT"}`);
  }
  return lines.join("\n");
}

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
  const orderId = `THN-SBX-RECON-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

  // 1. HS1001 handshake (Channel 1001, IsRedirectionRequest=0 -- Bank-confirmed).
  const hsFields = [
    ["HS_MerchantId", env.BANK_ALFALAH_APG_MERCHANT_ID!],
    ["HS_StoreId", env.BANK_ALFALAH_APG_STORE_ID!],
    ["HS_ChannelId", "1001"],
    ["HS_MerchantHash", env.BANK_ALFALAH_APG_MERCHANT_HASH!],
    ["HS_MerchantUsername", env.BANK_ALFALAH_APG_USERNAME!],
    ["HS_MerchantPassword", env.BANK_ALFALAH_APG_PASSWORD!],
    ["HS_IsRedirectionRequest", "0"],
    ["HS_ReturnURL", env.BANK_ALFALAH_APG_RETURN_URL!],
    ["HS_RequestHash", ""],
    ["HS_IsBIN", "0"],
    ["HS_TransactionReferenceNumber", orderId],
    ["handshake", ""]
  ] as const;
  const hsHash = encryptApgRequestHash(hsFields, key, iv);
  const hsForm = new URLSearchParams(hsFields.filter(([n]) => n !== "handshake").map(([n, v]) => [n, n === "HS_RequestHash" ? hsHash : v]));
  const hsResponse = await fetch(`${env.BANK_ALFALAH_APG_BASE_URL}/HS/HS/HS`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json,text/html" },
    body: hsForm
  });
  mergeCookies(cookieJar, extractSetCookies(hsResponse));
  const { body: hsBody } = parseApgResponse(await hsResponse.text());
  const authToken = hsBody.AuthToken ?? hsBody.authToken;
  console.log(`HS1001_HTTP_STATUS=${hsResponse.status}`);
  console.log(`HS1001_AUTH_TOKEN_PRESENT=${Boolean(authToken)}`);
  if (typeof authToken !== "string" || !authToken) { console.log("RECON_STOPPED=NO_AUTH_TOKEN"); process.exitCode = 1; return; }

  // 2. SSO redirect (server-owned order/amount only -- PKR 1 recon amount).
  const ssoFieldOrder = ["MerchantId", "StoreId", "ChannelId", "MerchantHash", "MerchantUsername", "MerchantPassword", "ReturnURL", "Currency", "IsBIN", "RequestHash", "AuthToken", "TransactionTypeId", "TransactionReferenceNumber", "TransactionAmount", "run"];
  const ssoValues: Record<string, string> = {
    AuthToken: String(authToken), RequestHash: "", ChannelId: "1001", Currency: env.BANK_ALFALAH_APG_SSO_CURRENCY || "PKR",
    IsBIN: "0", ReturnURL: env.BANK_ALFALAH_APG_RETURN_URL!, MerchantId: env.BANK_ALFALAH_APG_MERCHANT_ID!,
    StoreId: env.BANK_ALFALAH_APG_STORE_ID!, MerchantHash: env.BANK_ALFALAH_APG_MERCHANT_HASH!,
    MerchantUsername: env.BANK_ALFALAH_APG_USERNAME!, MerchantPassword: env.BANK_ALFALAH_APG_PASSWORD!,
    TransactionTypeId: env.BANK_ALFALAH_APG_SSO_TRANSACTION_TYPE_ID || "3", TransactionReferenceNumber: orderId,
    TransactionAmount: env.BANK_ALFALAH_APG_SSO_AMOUNT || "1", run: ""
  };
  const ssoHashFields = ssoFieldOrder.map((name) => [name, ssoValues[name] ?? ""] as const);
  const ssoRequestHash = encryptApgRequestHash(ssoHashFields, key, iv);
  ssoValues.RequestHash = ssoRequestHash;
  const ssoForm = new URLSearchParams(Object.entries(ssoValues).filter(([n]) => n !== "run"));
  const ssoResponse = await fetch(`${env.BANK_ALFALAH_APG_BASE_URL}/SSO/SSO/SSO`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html,application/xhtml+xml", cookie: cookieHeader(cookieJar) },
    body: ssoForm
  });
  mergeCookies(cookieJar, extractSetCookies(ssoResponse));
  const location = ssoResponse.headers.get("location");
  console.log(`SSO_HTTP_STATUS=${ssoResponse.status}`);
  console.log(`SSO_REDIRECT_PRESENT=${Boolean(location)}`);
  if (!location) { console.log("RECON_STOPPED=NO_REDIRECT"); process.exitCode = 1; return; }

  // 3. Follow redirect (session cookie only) -- READ the hosted page, submit nothing.
  const hostedUrl = new URL(location, env.BANK_ALFALAH_APG_BASE_URL);
  console.log(`HOSTED_PAGE_HOST=${hostedUrl.host}`);
  console.log(`HOSTED_PAGE_PATH=${hostedUrl.pathname}`);
  const hostedResponse = await fetch(hostedUrl, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html,application/xhtml+xml", cookie: cookieHeader(cookieJar) }
  });
  mergeCookies(cookieJar, extractSetCookies(hostedResponse));
  console.log(`HOSTED_PAGE_HTTP_STATUS=${hostedResponse.status}`);
  const finalLocation = hostedResponse.headers.get("location");
  if (finalLocation) {
    console.log(`HOSTED_PAGE_FURTHER_REDIRECT=${new URL(finalLocation, hostedUrl).host}${new URL(finalLocation, hostedUrl).pathname}`);
    process.exitCode = 0;
    return;
  }
  const html = await hostedResponse.text();
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  console.log(`HOSTED_PAGE_TITLE=${(titleMatch?.[1] ?? "ABSENT").replace(/[^\x20-\x7e]/g, "").slice(0, 120)}`);
  console.log(`HOSTED_PAGE_LENGTH=${Buffer.byteLength(html, "utf8")}`);
  console.log("--- SANITIZED FORM CONTRACT (field names/types only, no values) ---");
  console.log(extractFormContract(html));
}

void main();
