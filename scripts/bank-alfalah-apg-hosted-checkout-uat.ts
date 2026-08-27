// R9.3-APG-FULL-UAT-20260827
//
// Runs ONE Bank Alfalah sandbox Page Redirection journey in a real Chromium
// session. Sensitive values are read only from the process environment and
// are never printed, persisted, screenshotted, traced, or attached.
import { chromium, type Locator, type Page } from "playwright";
import { encryptApgRequestHash } from "../apps/api/src/services/bank-alfalah-request-hash";
import { parseApgResponse } from "../apps/api/src/services/bank-alfalah-response-parser";

type UatMode = "wallet" | "account" | "card" | "all";

const MODE = (process.env.APG_UAT_MODE || "wallet") as UatMode;
const PAYMENT_TYPE: Record<UatMode, string> = { wallet: "1", account: "2", card: "3", all: "" };

function setCookies(response: Response): string[] {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookieJar(jar: Map<string, string>, response: Response): void {
  for (const raw of setCookies(response)) {
    const pair = raw.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function browserCookies(responses: Array<{ response: Response; url: string }>): Array<{
  name: string; value: string; domain: string; path: string; secure: boolean;
}> {
  const cookies = new Map<string, { name: string; value: string; domain: string; path: string; secure: boolean }>();
  for (const { response, url } of responses) {
    for (const raw of setCookies(response)) {
      const parts = raw.split(";").map((part) => part.trim());
      const separator = parts[0].indexOf("=");
      if (separator <= 0) continue;
      const attributes = new Map(parts.slice(1).map((part) => {
        const index = part.indexOf("=");
        return index < 0 ? [part.toLowerCase(), ""] : [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
      }));
      const cookie = {
        name: parts[0].slice(0, separator),
        value: parts[0].slice(separator + 1),
        domain: attributes.get("domain") || new URL(url).hostname,
        path: attributes.get("path") || "/",
        secure: attributes.has("secure") || new URL(url).protocol === "https:"
      };
      cookies.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie);
    }
  }
  return [...cookies.values()];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function sanitizeRuntimeText(input: string): string {
  let output = input;
  for (const value of Object.values(process.env)) {
    if (value && value.length >= 4) output = output.split(value).join("[REDACTED]");
  }
  return output
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{7,}\b/g, "[NUMBER]")
    .replace(/[\r\n]+/g, " ");
}

function findValue(body: Record<string, unknown>, name: string): string {
  const wanted = name.toLowerCase();
  const queue: unknown[] = [body];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (key.toLowerCase() === wanted) return text(value);
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return "";
}

async function fillVisible(locator: Locator, value: string): Promise<boolean> {
  if (!value || await locator.count() === 0 || !await locator.first().isVisible()) return false;
  await locator.first().fill(value);
  return true;
}

async function selectVisible(locator: Locator, value: string): Promise<boolean> {
  if (await locator.count() === 0 || !await locator.first().isVisible()) return false;
  const select = locator.first();
  if (await select.inputValue() === value) return true;
  await select.evaluate((element: HTMLSelectElement, selectedValue: string) => {
    element.value = selectedValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await select.page().waitForTimeout(1_000);
  return true;
}

async function fetchWithNetworkRetry(url: string, init: RequestInit, attempts = 3): Promise<{ response: Response; calls: number }> {
  let lastError: unknown;
  for (let call = 1; call <= attempts; call += 1) {
    try {
      return { response: await fetch(url, init), calls: call };
    } catch (error) {
      lastError = error;
      if (call < attempts) await new Promise((resolve) => setTimeout(resolve, 1_000 * call));
    }
  }
  throw lastError;
}

async function fillPaymentStage(page: Page, env: NodeJS.ProcessEnv, paymentMode: Exclude<UatMode, "all">): Promise<void> {
  const sandboxMobile = `+92${env.APG_SANDBOX_ALFA_WALLET!.slice(-10)}`;
  if (paymentMode === "wallet") {
    await fillVisible(page.locator('[name="AlfaWalletNumber"]'), env.APG_SANDBOX_ALFA_WALLET!);
    await selectVisible(page.locator('[name="alfaCountry"]'), "164");
    await fillVisible(page.locator('[name="alfaMobileNumber"]'), sandboxMobile);
    await fillVisible(page.locator('[name="alfaEmailAddress"]'), "sandbox-uat@thannow.com");
  } else if (paymentMode === "account") {
    await fillVisible(page.locator('[name="AccountNumber"]'), env.APG_SANDBOX_ALFALAH_ACCOUNT!);
    await selectVisible(page.locator('[name="alfalahCountry"]'), "164");
    await fillVisible(page.locator('[name="alfalahMobileNumber"]'), sandboxMobile);
    await fillVisible(page.locator('[name="alfalahEmailAddress"]'), "sandbox-uat@thannow.com");
  } else {
    const [expiryMonth, expiryYear] = env.APG_SANDBOX_CARD_EXPIRY!.split("/");
    await fillVisible(page.locator('[name="CardNumber"]'), env.APG_SANDBOX_CARD_NUMBER!);
    await fillVisible(page.locator('[name="CVV"]'), env.APG_SANDBOX_CARD_CVV!);
    await fillVisible(page.locator('[name="ExpiryMonth"]'), expiryMonth);
    await fillVisible(page.locator('[name="ExpiryYear"]'), expiryYear);
    await selectVisible(page.locator('[name="CardTypeId"]'), "2");
    await selectVisible(page.locator('[name="cardCountry"]'), "164");
    await fillVisible(page.locator('[name="cardMobileNumber"]'), sandboxMobile);
    await fillVisible(page.locator('[name="cardEmailAddress"]'), "sandbox-uat@thannow.com");
  }

  await fillVisible(page.locator('[name="alfaSMSOTP"]'), env.APG_SANDBOX_SMS_OTP!);
  await fillVisible(page.locator('[name="alfaEmailOTP"]'), env.APG_SANDBOX_EMAIL_OTP!);
  await fillVisible(page.locator('[name="alfalahOTP"]'), env.APG_SANDBOX_SMS_OTP!);

  const otpInputs = page.locator('input[name]');
  for (let index = 0; index < await otpInputs.count(); index += 1) {
    const input = otpInputs.nth(index);
    if (!await input.isVisible()) continue;
    const name = (await input.getAttribute("name") || "").toLowerCase();
    if (name.includes("otac")) await input.fill(env.APG_SANDBOX_SMS_OTAC!);
    else if (name.includes("email") && name.includes("otp")) await input.fill(env.APG_SANDBOX_EMAIL_OTP!);
    else if (name.includes("otp")) await input.fill(env.APG_SANDBOX_SMS_OTP!);
  }
}

async function visibleContract(page: Page): Promise<string> {
  return page.locator('input[name],select[name],button,input[type="submit"]').evaluateAll((elements) => elements
    .filter((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    })
    .map((element) => {
      const field = element as HTMLInputElement;
      const name = field.name || "unnamed";
      const onclick = element.getAttribute("onclick") || "";
      const handler = onclick.match(/[A-Za-z_$][\w$]*(?=\s*\()/)?.[0] || (onclick ? "inline" : "bound");
      const label = element.tagName === "BUTTON" || field.type === "submit" || field.type === "button"
        ? `${element.tagName.toLowerCase()}-${field.type || "button"}#${element.id || "unnamed"}@${handler}:${(field.value || element.textContent || "button").trim().replace(/\s+/g, " ").slice(0, 40)}`
        : element.tagName.toLowerCase();
      return `${name}:${label}`;
    })
    .sort()
    .join(","));
}

async function invalidFieldNames(page: Page): Promise<string> {
  return page.locator('input:invalid[name],select:invalid[name]').evaluateAll((elements) => elements
    .filter((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    })
    .map((element) => (element as HTMLInputElement).name)
    .sort()
    .join(","));
}

async function visibleErrorText(page: Page): Promise<string> {
  const raw = await page.locator('.validation-summary-errors,.field-validation-error,.alert,.toast,.swal2-html-container,[class*="error" i],[class*="validation" i]').evaluateAll((elements) => elements
    .filter((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    })
    .map((element) => (element.textContent || "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" | "));
  return sanitizeRuntimeText(raw).replace(/[^\x20-\x7e]/g, "").slice(0, 200);
}

async function paymentPageMarker(page: Page): Promise<string> {
  const bodyText = await page.locator("body").innerText();
  const marker = bodyText.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /invalid|required|error|fail|please|mobile|email|wallet|account|card/i.test(line))
    .slice(-8)
    .join(" | ");
  return sanitizeRuntimeText(marker).replace(/[^\x20-\x7e]/g, "").slice(0, 300);
}

async function advancePayment(page: Page): Promise<boolean> {
  const candidates = page.locator('button:visible,input[type="submit"]:visible,input[type="button"]:visible');
  const preferred = /pay|proceed|submit|verify|confirm|next|generate|send/i;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    const label = `${await candidate.textContent() || ""} ${await candidate.getAttribute("value") || ""}`;
    if (!preferred.test(label)) continue;
    await candidate.click();
    return true;
  }
  const form = page.locator("form").first();
  if (await form.count() === 0) return false;
  await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
  return true;
}

async function main(): Promise<void> {
  if (!Object.hasOwn(PAYMENT_TYPE, MODE)) throw new Error(`INVALID_APG_UAT_MODE:${MODE}`);
  const env = process.env;
  const required = [
    "BANK_ALFALAH_APG_MERCHANT_ID", "BANK_ALFALAH_APG_STORE_ID", "BANK_ALFALAH_APG_MERCHANT_HASH",
    "BANK_ALFALAH_APG_USERNAME", "BANK_ALFALAH_APG_PASSWORD", "BANK_ALFALAH_APG_AES_KEY", "BANK_ALFALAH_APG_AES_IV",
    "BANK_ALFALAH_APG_BASE_URL", "BANK_ALFALAH_APG_RETURN_URL", "APG_SANDBOX_ALFA_WALLET",
    "APG_SANDBOX_ALFALAH_ACCOUNT", "APG_SANDBOX_CARD_NUMBER", "APG_SANDBOX_CARD_EXPIRY",
    "APG_SANDBOX_CARD_CVV", "APG_SANDBOX_SMS_OTP", "APG_SANDBOX_EMAIL_OTP", "APG_SANDBOX_SMS_OTAC"
  ] as const;
  for (const name of required) if (!env[name]) throw new Error(`BANK_APG_SECRET_MISSING:${name}`);
  if (new URL(env.BANK_ALFALAH_APG_BASE_URL!).hostname !== "sandbox.bankalfalah.com") throw new Error("SANDBOX_HOST_REQUIRED");
  if (env.BANK_ALFALAH_PROVIDER && env.BANK_ALFALAH_PROVIDER !== "none") throw new Error("PRODUCTION_PROVIDER_MUST_REMAIN_NONE");
  if (env.BANK_ALFALAH_APG_ENABLED === "true" || env.BANK_ALFALAH_MPGS_ENABLED === "true") throw new Error("PRODUCTION_PAYMENT_FLAGS_MUST_REMAIN_OFF");

  const orderId = `THN-SBX-UAT-${MODE.toUpperCase()}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const amount = env.BANK_ALFALAH_APG_SSO_AMOUNT || "1";
  const currency = env.BANK_ALFALAH_APG_SSO_CURRENCY || "PKR";
  const effectivePaymentMode: Exclude<UatMode, "all"> = MODE === "all" ? "card" : MODE;
  console.log(`UAT_MODE=${MODE}`);
  console.log(`UAT_ORDER_ID=${orderId}`);
  console.log(`UAT_AMOUNT=${amount} ${currency}`);

  const browser = await chromium.launch({
    headless: env.APG_UAT_HEADED !== "true",
    channel: env.APG_UAT_HEADED === "true" ? "chrome" : undefined
  });
  try {
    const context = await browser.newContext({ acceptDownloads: false });
    const key = env.BANK_ALFALAH_APG_AES_KEY!;
    const iv = env.BANK_ALFALAH_APG_AES_IV!;
    const hsFields = [
      ["HS_MerchantId", env.BANK_ALFALAH_APG_MERCHANT_ID!], ["HS_StoreId", env.BANK_ALFALAH_APG_STORE_ID!],
      ["HS_ChannelId", "1001"], ["HS_MerchantHash", env.BANK_ALFALAH_APG_MERCHANT_HASH!],
      ["HS_MerchantUsername", env.BANK_ALFALAH_APG_USERNAME!], ["HS_MerchantPassword", env.BANK_ALFALAH_APG_PASSWORD!],
      ["HS_IsRedirectionRequest", "0"], ["HS_ReturnURL", env.BANK_ALFALAH_APG_RETURN_URL!], ["HS_RequestHash", ""],
      ["HS_IsBIN", "0"], ["HS_TransactionReferenceNumber", orderId], ["handshake", ""]
    ] as const;
    const hsHash = encryptApgRequestHash(hsFields, key, iv);
    const cookieJar = new Map<string, string>();
    const hsUrl = `${env.BANK_ALFALAH_APG_BASE_URL}/HS/HS/HS`;
    const hsResponse = await fetch(hsUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json,text/html" },
      body: new URLSearchParams(hsFields.filter(([name]) => name !== "handshake").map(([name, value]) => [name, name === "HS_RequestHash" ? hsHash : value]))
    });
    mergeCookieJar(cookieJar, hsResponse);
    const { body: hsBody } = parseApgResponse(await hsResponse.text());
    const authToken = hsBody.AuthToken ?? hsBody.authToken;
    console.log(`HS1001_HTTP_STATUS=${hsResponse.status}`);
    console.log(`HS1001_AUTH_TOKEN_PRESENT=${Boolean(authToken)}`);
    if (typeof authToken !== "string" || !authToken) throw new Error("UAT_STOPPED:NO_AUTH_TOKEN");

    const ssoFieldOrder = ["MerchantId", "StoreId", "ChannelId", "MerchantHash", "MerchantUsername", "MerchantPassword", "ReturnURL", "Currency", "IsBIN", "RequestHash", "AuthToken", "TransactionTypeId", "TransactionReferenceNumber", "TransactionAmount", "run"];
    const ssoValues: Record<string, string> = {
      AuthToken: authToken, RequestHash: "", ChannelId: "1001", Currency: currency, IsBIN: "0",
      ReturnURL: env.BANK_ALFALAH_APG_RETURN_URL!, MerchantId: env.BANK_ALFALAH_APG_MERCHANT_ID!,
      StoreId: env.BANK_ALFALAH_APG_STORE_ID!, MerchantHash: env.BANK_ALFALAH_APG_MERCHANT_HASH!,
      MerchantUsername: env.BANK_ALFALAH_APG_USERNAME!, MerchantPassword: env.BANK_ALFALAH_APG_PASSWORD!,
      TransactionTypeId: PAYMENT_TYPE[MODE], TransactionReferenceNumber: orderId, TransactionAmount: amount, run: ""
    };
    ssoValues.RequestHash = encryptApgRequestHash(ssoFieldOrder.map((name) => [name, ssoValues[name] ?? ""] as const), key, iv);

    const ssoUrl = `${env.BANK_ALFALAH_APG_BASE_URL}/SSO/SSO/SSO`;
    const ssoResponse = await fetch(ssoUrl, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html,application/xhtml+xml", cookie: cookieHeader(cookieJar) },
      body: new URLSearchParams(Object.entries(ssoValues).filter(([name]) => name !== "run"))
    });
    mergeCookieJar(cookieJar, ssoResponse);
    const hostedLocation = ssoResponse.headers.get("location");
    console.log(`SSO_HTTP_STATUS=${ssoResponse.status}`);
    if (!hostedLocation) throw new Error("UAT_STOPPED:NO_SSO_REDIRECT");
    await context.addCookies(browserCookies([
      { response: hsResponse, url: hsUrl },
      { response: ssoResponse, url: ssoUrl }
    ]));

    const page = await context.newPage();
    const bankPosts: string[] = [];
    page.on("response", (response) => {
      if (response.request().method() !== "POST") return;
      const responseUrl = new URL(response.url());
      if (!responseUrl.hostname.endsWith("bankalfalah.com")) return;
      bankPosts.push(`${response.status()}:${responseUrl.pathname}`);
    });
    await page.goto(new URL(hostedLocation, ssoUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForURL(/bankalfalah\.com\/Payments\/Payments\/Create/i, { timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    console.log(`SSO_HOSTED_PAGE_REACHED=${/merchants\.bankalfalah\.com$/i.test(new URL(page.url()).hostname)}`);
    console.log(`HOSTED_PAGE_HTTP_TITLE=${(await page.title()).replace(/[^\x20-\x7e]/g, "").slice(0, 80)}`);
    const challengePresent = await page.locator('[name="answer"]').count() > 0;
    console.log(`HOSTED_PAGE_CHALLENGE_PRESENT=${challengePresent}`);
    if (challengePresent) throw new Error("BANK_HOSTED_PAGE_BROWSER_CHALLENGE");

    const paymentType = page.locator('[name="PaymentTypeId"]');
    if (MODE === "all") console.log(`ALL_MODES_SELECTOR_PRESENT=${await paymentType.count() > 0 && await paymentType.first().isVisible()}`);
    if (await paymentType.count() > 0 && await paymentType.first().isVisible()) {
      await paymentType.first().selectOption(PAYMENT_TYPE[effectivePaymentMode]);
      await page.waitForTimeout(1_500);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    }

    let previousSignature = "";
    for (let stage = 1; stage <= 4; stage += 1) {
      if (new URL(page.url()).hostname === new URL(env.BANK_ALFALAH_APG_RETURN_URL!).hostname) break;
      await fillPaymentStage(page, env, effectivePaymentMode);
      const contract = await visibleContract(page);
      console.log(`PAYMENT_STAGE_${stage}_VISIBLE_CONTROLS=${contract || "ABSENT"}`);
      const invalidFields = await invalidFieldNames(page);
      console.log(`PAYMENT_STAGE_${stage}_INVALID_FIELDS=${invalidFields || "ABSENT"}`);
      if (!contract) break;
      const signature = `${page.url()}|${contract}`;
      if (signature === previousSignature) break;
      previousSignature = signature;
      const advanced = await advancePayment(page);
      if (!advanced) break;
      await page.waitForTimeout(3_000);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      console.log(`PAYMENT_STAGE_${stage}_BANK_POSTS=${bankPosts.join(",") || "ABSENT"}`);
      const errorText = await visibleErrorText(page);
      console.log(`PAYMENT_STAGE_${stage}_ERROR_TEXT=${errorText || "ABSENT"}`);
      console.log(`PAYMENT_STAGE_${stage}_PAGE_MARKER=${await paymentPageMarker(page) || "ABSENT"}`);
      if (/transaction (?:failed|successful)|payment (?:failed|successful)/i.test(errorText)) break;
    }

    const finalUrl = new URL(page.url());
    console.log(`RETURN_REACHED=${finalUrl.hostname === new URL(env.BANK_ALFALAH_APG_RETURN_URL!).hostname}`);
    console.log(`RETURN_HOST=${finalUrl.host}`);
    console.log(`RETURN_PATH=${finalUrl.pathname}`);
    console.log(`RETURN_QUERY_PRESENT=${finalUrl.search.length > 0}`);
    console.log(`PAYMENT_FINAL_TITLE=${(await page.title()).replace(/[^\x20-\x7e]/g, "").slice(0, 100) || "ABSENT"}`);

    const statusResult = await fetchWithNetworkRetry(`${env.BANK_ALFALAH_APG_BASE_URL}/HS/api/IPN/OrderStatus/${encodeURIComponent(env.BANK_ALFALAH_APG_MERCHANT_ID!)}/${encodeURIComponent(env.BANK_ALFALAH_APG_STORE_ID!)}/${encodeURIComponent(orderId)}`, {
      headers: { accept: "application/json" }
    });
    const statusResponse = statusResult.response;
    const parsed = parseApgResponse(await statusResponse.text()).body;
    const responseCode = findValue(parsed, "ResponseCode");
    const transactionStatus = findValue(parsed, "TransactionStatus");
    const transactionId = findValue(parsed, "TransactionId");
    const statusAmount = findValue(parsed, "TransactionAmount");
    const statusCurrency = findValue(parsed, "Currency");
    console.log(`ORDERSTATUS_HTTP_STATUS=${statusResponse.status}`);
    console.log(`ORDERSTATUS_NETWORK_CALLS=${statusResult.calls}`);
    console.log(`ORDERSTATUS_RESPONSE_CODE=${responseCode || "ABSENT"}`);
    console.log(`ORDERSTATUS_TRANSACTION_STATUS=${transactionStatus || "ABSENT"}`);
    console.log(`ORDERSTATUS_TRANSACTION_ID=${transactionId || "ABSENT"}`);
    console.log(`ORDERSTATUS_MERCHANT_MATCH=${findValue(parsed, "MerchantId") === env.BANK_ALFALAH_APG_MERCHANT_ID}`);
    console.log(`ORDERSTATUS_STORE_MATCH=${findValue(parsed, "StoreId") === env.BANK_ALFALAH_APG_STORE_ID}`);
    console.log(`ORDERSTATUS_ORDER_MATCH=${findValue(parsed, "TransactionReferenceNumber") === orderId}`);
    console.log(`ORDERSTATUS_AMOUNT=${statusAmount || "ABSENT"}`);
    console.log(`ORDERSTATUS_CURRENCY=${statusCurrency || "ABSENT"}`);
    const paid = responseCode === "00" && transactionStatus.toUpperCase() === "PAID";
    console.log(`ORDERSTATUS_PAID=${paid}`);
    console.log(`UAT_FINAL_STATUS=${paid ? "PAID" : "FAILED"}`);
    if (!paid) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  const message = sanitizeRuntimeText(error instanceof Error ? error.message : String(error)).slice(0, 160);
  console.error(`UAT_ERROR=${message}`);
  process.exitCode = 1;
});
