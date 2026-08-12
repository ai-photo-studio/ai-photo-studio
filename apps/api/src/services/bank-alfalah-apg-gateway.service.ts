import { createHash } from "node:crypto";
import type { FixedOrderCurrency } from "../domain/fixedOrder/fixedOrderGuards";
import { encryptApgRequestHash, type OrderedApgField } from "./bank-alfalah-request-hash";
import {
  applyVerifiedPaymentEvidence,
  type PaymentEvidenceResult,
  type VerifiedPaymentEvidence
} from "./p4a-payment-verified-execution-queue.service";

/** APG API-channel contract from BAF/API/API.txt and Merchant Guide v1.1. */
export interface BankAlfalahApgConfig {
  enabled: boolean;
  baseUrl: string;
  merchantId: string;
  storeId: string;
  merchantHash: string;
  username: string;
  password: string;
  aesKey: string;
  aesIv: string;
  returnUrl: string;
}

export interface ApgHandshakeInput {
  orderId: string;
}

export interface ApgTransactionInput {
  orderId: string;
  amountMinor: bigint;
  currency: FixedOrderCurrency;
  authToken: string;
  transactionTypeId: string;
}

export interface ApgRequestHashInput {
  endpoint: "handshake" | "transaction" | "sso";
  payload: Record<string, string>;
}

export type ApgRequestHashGenerator = (input: ApgRequestHashInput) => string;

export interface ApgHandshakeResult {
  authToken: string;
  returnUrl: string;
}

export interface ApgSsoRedirect {
  url: string;
  fields: Record<string, string>;
}

export interface ApgOrderStatus {
  responseCode: string;
  description: string;
  merchantId: string;
  storeId: string;
  transactionReferenceNumber: string;
  transactionId: string;
  transactionAmountMinor: bigint;
  currency: FixedOrderCurrency;
  transactionStatus: string;
}

type FetchLike = typeof globalThis.fetch;
type ApplyEvidence = (evidence: VerifiedPaymentEvidence) => Promise<PaymentEvidenceResult>;

export class BankAlfalahApgConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankAlfalahApgConfigurationError";
  }
}

export class BankAlfalahApgProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankAlfalahApgProtocolError";
  }
}

const orderedFields = (payload: Record<string, string>, names: readonly string[]): OrderedApgField[] =>
  names.map((name) => [name, payload[name] ?? ""] as const);

const defaultRequestHashGenerator = (input: ApgRequestHashInput, config: BankAlfalahApgConfig): string => {
  const fieldOrder = input.endpoint === "handshake"
    ? ["HS_ChannelId", "HS_MerchantId", "HS_StoreId", "HS_ReturnURL", "HS_MerchantHash", "HS_MerchantUsername", "HS_MerchantPassword", "HS_TransactionReferenceNumber"]
    : ["MerchantId", "StoreId", "ChannelId", "MerchantHash", "MerchantUsername", "MerchantPassword", "ReturnURL", "Currency", "AuthToken", "TransactionTypeId", "TransactionReferenceNumber", "TransactionAmount", "MobileNumber"];
  return encryptApgRequestHash(orderedFields(input.payload, fieldOrder), config.aesKey, config.aesIv);
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertHttpsUrl(value: string, field: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new BankAlfalahApgConfigurationError(`${field} must be a valid URL`); }
  if (parsed.protocol !== "https:") throw new BankAlfalahApgConfigurationError(`${field} must use HTTPS`);
}

function assertConfigured(config: BankAlfalahApgConfig): void {
  if (!config.enabled) throw new BankAlfalahApgConfigurationError("Bank Alfalah APG is disabled");
  for (const [name, value] of Object.entries({
    merchantId: config.merchantId,
    storeId: config.storeId,
    merchantHash: config.merchantHash,
    username: config.username,
    password: config.password,
    aesKey: config.aesKey,
    aesIv: config.aesIv
  })) {
    if (!value) throw new BankAlfalahApgConfigurationError(`Bank Alfalah APG ${name} is not configured`);
  }
  assertHttpsUrl(config.baseUrl, "Bank Alfalah APG base URL");
  assertHttpsUrl(config.returnUrl, "Bank Alfalah APG return URL");
}

function amountMajor(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function amountMinor(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw new BankAlfalahApgProtocolError("APG status amount is missing");
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BankAlfalahApgProtocolError("APG status amount is malformed");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export class BankAlfalahApgGateway {
  private readonly hashGenerator: ApgRequestHashGenerator;

  constructor(
    private readonly config: BankAlfalahApgConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
    hashGenerator?: ApgRequestHashGenerator
  ) {
    this.hashGenerator = hashGenerator || ((input) => defaultRequestHashGenerator(input, this.config));
  }

  private async postJson<T>(path: string, payload: Record<string, string>): Promise<T> {
    const response = await this.fetchImpl(endpoint(this.config.baseUrl, path), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => null) as T | null;
    if (!response.ok) throw new BankAlfalahApgProtocolError(`APG ${path} failed with HTTP ${response.status}`);
    if (!body || typeof body !== "object") throw new BankAlfalahApgProtocolError(`APG ${path} returned malformed JSON`);
    return body;
  }

  buildHandshakePayload(input: ApgHandshakeInput): Record<string, string> {
    assertConfigured(this.config);
    if (!input.orderId) throw new BankAlfalahApgProtocolError("APG order ID is required");
    const payload: Record<string, string> = {
      HS_ChannelId: "1002",
      HS_MerchantId: this.config.merchantId,
      HS_StoreId: this.config.storeId,
      HS_ReturnURL: this.config.returnUrl,
      HS_MerchantHash: this.config.merchantHash,
      HS_MerchantUsername: this.config.username,
      HS_MerchantPassword: this.config.password,
      HS_TransactionReferenceNumber: input.orderId,
      HS_RequestHash: ""
    };
    assertHttpsUrl(payload.HS_ReturnURL, "HS_ReturnURL");
    payload.HS_RequestHash = this.hashGenerator({ endpoint: "handshake", payload: { ...payload } });
    return payload;
  }

  async initiateHandshake(input: ApgHandshakeInput): Promise<ApgHandshakeResult> {
    const payload = this.buildHandshakePayload(input);
    const response = await this.postJson<{ success?: boolean | string; AuthToken?: string; ReturnURL?: string; ErrorMessage?: string }>("/HS/api/HSAPI/HSAPI", payload);
    const successful = response.success === true || response.success === "true";
    if (!successful || !response.AuthToken) throw new BankAlfalahApgProtocolError(response.ErrorMessage || "APG handshake did not return AuthToken");
    return { authToken: response.AuthToken, returnUrl: response.ReturnURL || payload.HS_ReturnURL };
  }

  buildTransactionPayload(input: ApgTransactionInput): Record<string, string> {
    assertConfigured(this.config);
    if (!input.orderId || !input.authToken || !input.transactionTypeId) throw new BankAlfalahApgProtocolError("APG transaction identity is incomplete");
    if (input.amountMinor <= 0n) throw new BankAlfalahApgProtocolError("APG transaction amount must be positive");
    const payload: Record<string, string> = {
      ChannelId: "1002",
      MerchantId: this.config.merchantId,
      StoreId: this.config.storeId,
      MerchantHash: this.config.merchantHash,
      MerchantUsername: this.config.username,
      MerchantPassword: this.config.password,
      ReturnURL: this.config.returnUrl,
      Currency: input.currency,
      AuthToken: input.authToken,
      TransactionTypeId: input.transactionTypeId,
      TransactionReferenceNumber: input.orderId,
      TransactionAmount: amountMajor(input.amountMinor),
      RequestHash: ""
    };
    payload.RequestHash = this.hashGenerator({ endpoint: "transaction", payload: { ...payload } });
    return payload;
  }

  async createTransaction(input: ApgTransactionInput): Promise<Record<string, unknown>> {
    const payload = this.buildTransactionPayload(input);
    return this.postJson<Record<string, unknown>>("/HS/api/Tran/DoTran", payload);
  }

  buildSsoRedirect(authToken: string, orderId: string, transactionTypeId: string, amountMinorValue: bigint, currency: FixedOrderCurrency): ApgSsoRedirect {
    assertConfigured(this.config);
    if (!authToken || !orderId || !transactionTypeId) throw new BankAlfalahApgProtocolError("APG SSO identity is incomplete");
    const fields: Record<string, string> = {
      AuthToken: authToken,
      RequestHash: "",
      ChannelId: "1002",
      Currency: currency,
      ReturnURL: this.config.returnUrl,
      MerchantId: this.config.merchantId,
      StoreId: this.config.storeId,
      MerchantHash: this.config.merchantHash,
      MerchantUsername: this.config.username,
      MerchantPassword: this.config.password,
      TransactionTypeId: transactionTypeId,
      TransactionReferenceNumber: orderId,
      TransactionAmount: amountMajor(amountMinorValue)
    };
    fields.RequestHash = this.hashGenerator({ endpoint: "sso", payload: { ...fields } });
    return { url: endpoint(this.config.baseUrl, "/SSO/SSO/SSO"), fields };
  }

  async getOrderStatus(orderId: string, expectedAmountMinor: bigint, expectedCurrency: FixedOrderCurrency): Promise<ApgOrderStatus> {
    assertConfigured(this.config);
    if (!orderId) throw new BankAlfalahApgProtocolError("APG order ID is required");
    const response = await this.fetchImpl(endpoint(this.config.baseUrl, `/HS/api/IPN/OrderStatus/${encodeURIComponent(this.config.merchantId)}/${encodeURIComponent(this.config.storeId)}/${encodeURIComponent(orderId)}`), {
      method: "GET",
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !body) throw new BankAlfalahApgProtocolError(`APG OrderStatus failed with HTTP ${response.status}`);
    const result: ApgOrderStatus = {
      responseCode: String(body.ResponseCode ?? ""),
      description: String(body.Description ?? ""),
      merchantId: String(body.MerchantId ?? ""),
      storeId: String(body.StoreId ?? ""),
      transactionReferenceNumber: String(body.TransactionReferenceNumber ?? ""),
      transactionId: String(body.TransactionId ?? ""),
      transactionAmountMinor: amountMinor(body.TransactionAmount),
      currency: String(body.Currency ?? expectedCurrency) as FixedOrderCurrency,
      transactionStatus: String(body.TransactionStatus ?? "")
    };
    if (result.responseCode !== "00" || result.transactionStatus.toUpperCase() !== "PAID") throw new BankAlfalahApgProtocolError("APG OrderStatus is not a successful PAID result");
    if (result.merchantId !== this.config.merchantId || result.storeId !== this.config.storeId || result.transactionReferenceNumber !== orderId) throw new BankAlfalahApgProtocolError("APG OrderStatus identity mismatch");
    if (result.transactionAmountMinor !== expectedAmountMinor || result.currency !== expectedCurrency) throw new BankAlfalahApgProtocolError("APG OrderStatus amount or currency mismatch");
    return result;
  }

  async verifyAndApplyOrderStatus(input: {
    orderId: string;
    fixedOrderId: string;
    paymentAttemptId: string;
    amountMinor: bigint;
    currency: FixedOrderCurrency;
  }, applyEvidence: ApplyEvidence = applyVerifiedPaymentEvidence): Promise<PaymentEvidenceResult> {
    const status = await this.getOrderStatus(input.orderId, input.amountMinor, input.currency);
    const providerRef = status.transactionId || status.transactionReferenceNumber;
    return applyEvidence({
      fixedOrderId: input.fixedOrderId,
      paymentAttemptId: input.paymentAttemptId,
      provider: "bank_alfalah",
      providerEventId: `apg:${status.transactionReferenceNumber}:${status.transactionId}`,
      providerRef,
      amountMinor: status.transactionAmountMinor,
      currency: status.currency,
      dedupeHash: sha256(`bank_alfalah|${status.transactionReferenceNumber}|${status.transactionId}|${status.transactionAmountMinor}|${status.currency}`)
    });
  }
}
