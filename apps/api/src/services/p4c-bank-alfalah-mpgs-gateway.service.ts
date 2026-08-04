// R9.2-P4C-MPGS-SUPERSEDE-LEGACY-APG
//
// Bank Alfalah Mastercard Gateway (MPGS) sandbox adapter. This module is the
// ONLY place in this repository permitted to carry Bank Alfalah protocol
// knowledge (REST auth shape, Hosted Checkout initiation, Retrieve Order
// v74). The legacy "Alfa APG v1.1" protocol (sandbox.bankalfalah.com /
// payments.bankalfalah.com, /HS/ endpoints, Store ID / Key1 / Key2, AES/CBC
// request signing) is RETIRED and must never be reintroduced -- see
// docs/payments/bank-alfalah-mastercard/ and
// p4c-bank-alfalah-legacy-apg-retired.test.ts.
//
// ---------------------------------------------------------------------------
// TRUST BOUNDARY
// ---------------------------------------------------------------------------
// Like `p4a-payment-verified-execution-queue.service.ts`, this module is
// deliberately NOT registered on any Express router and NOT imported by any
// controller in this packet -- wiring a live HTTP return/webhook route is a
// separate, later, owner-authorized action. What exists here is a
// self-contained, fully testable gateway client plus a verification
// orchestrator that:
//   * initiates Hosted Checkout from immutable FixedOrder/PaymentAttempt
//     values only (server owns orderId/amount/currency -- never client input),
//   * NEVER marks a payment paid from a browser return or a webhook payload
//     by itself,
//   * always performs an authenticated Retrieve Order v74 call against the
//     configured BANK_ALFALAH_MPGS_BASE_URL (never a URL taken from a
//     webhook payload) before accepting any paid transition,
//   * requires exact merchant/order/reference/amount/currency/status match
//     between the stored PaymentAttempt and the gateway response,
//   * only then calls the existing `applyVerifiedPaymentEvidence` (P4A)
//     transaction -- this module never touches Replicate, R2, or any worker.
//
// REST authentication: HTTP Basic, username = `merchant.<Merchant ID>`,
// password = API Password. `BANK_ALFALAH_MPGS_OPERATOR_ID` is portal-login
// metadata ONLY and is never used for REST auth. Neither value is ever
// logged, returned, or embedded in an error message.

import { createHash } from "node:crypto";
import {
  applyVerifiedPaymentEvidence,
  type PaymentEvidenceResult,
  type VerifiedPaymentEvidence
} from "./p4a-payment-verified-execution-queue.service";
import type { FixedOrderCurrency } from "../domain/fixedOrder/fixedOrderGuards";

// ---------------------------------------------------------------------------
// Currency gating -- PKR and USD are independently gated. A currency is only
// enabled once documentation (live-fetched) or a bounded sandbox capability
// test confirms it. See docs/payments/bank-alfalah-mastercard/ for the
// evidence source of each entry below.
// ---------------------------------------------------------------------------

export type MpgsCurrencyEvidence = "doc-confirmed-live-fetch" | "standard-pattern-fallback" | "sandbox-tested";

export interface MpgsCurrencySupport {
  enabled: boolean;
  evidence: MpgsCurrencyEvidence;
  reason: string;
}

export const MPGS_CURRENCY_SUPPORT: Readonly<Record<FixedOrderCurrency, MpgsCurrencySupport>> = {
  PKR: {
    enabled: true,
    evidence: "standard-pattern-fallback",
    reason:
      "PKR is Bank Alfalah's home-market settlement currency for this gateway and matches the PAKISTAN/PKR " +
      "market-currency pairing already enforced by validateMarketCurrencyPair; enabled on the well-established " +
      "MPGS REST v74 Hosted Checkout pattern (live doc fetch returned only a JS-rendered shell, see evidence doc)."
  },
  USD: {
    enabled: false,
    evidence: "standard-pattern-fallback",
    reason:
      "FAIL-CLOSED pending confirmation: no live-fetched Bank Alfalah MPGS documentation or bounded sandbox " +
      "capability test has confirmed USD settlement is actually enabled on this specific merchant sandbox " +
      "account. An API field accepting a currency code is not sufficient evidence. Rejected until the owner " +
      "runs a bounded sandbox test or supplies confirming documentation."
  }
};

export class MpgsCurrencyNotSupportedError extends Error {
  constructor(currency: string) {
    super(`Bank Alfalah MPGS: currency ${currency} is not enabled (fail-closed)`);
    this.name = "MpgsCurrencyNotSupportedError";
  }
}

export function assertMpgsCurrencySupported(currency: FixedOrderCurrency): void {
  const support = MPGS_CURRENCY_SUPPORT[currency];
  if (!support || !support.enabled) {
    throw new MpgsCurrencyNotSupportedError(currency);
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MpgsGatewayConfig {
  enabled: boolean;
  baseUrl: string;
  apiVersion: string;
  merchantId: string;
  apiPassword: string;
  checkoutMode: string;
}

export class MpgsNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MpgsNotConfiguredError";
  }
}

function assertConfigured(config: MpgsGatewayConfig): void {
  if (!config.enabled) {
    throw new MpgsNotConfiguredError("Bank Alfalah MPGS is disabled (BANK_ALFALAH_MPGS_ENABLED is not true)");
  }
  if (!config.merchantId) {
    throw new MpgsNotConfiguredError("Bank Alfalah MPGS merchant id is not configured");
  }
  if (!config.apiPassword) {
    throw new MpgsNotConfiguredError("Bank Alfalah MPGS API password is not configured");
  }
  try {
    void new URL(config.baseUrl);
  } catch {
    throw new MpgsNotConfiguredError("Bank Alfalah MPGS base URL is not a valid URL");
  }
}

/** REST Basic Auth header. username = `merchant.<Merchant ID>`, password = API Password. Never logs either value. */
export function buildMpgsAuthHeader(config: Pick<MpgsGatewayConfig, "merchantId" | "apiPassword">): string {
  const username = `merchant.${config.merchantId}`;
  const token = Buffer.from(`${username}:${config.apiPassword}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function restBaseUrl(config: MpgsGatewayConfig): string {
  return `${config.baseUrl.replace(/\/+$/, "")}/api/rest/version/${config.apiVersion}/merchant/${config.merchantId}`;
}

// ---------------------------------------------------------------------------
// Wire types (standard MPGS REST v74 Hosted Checkout / Retrieve Order shape)
// ---------------------------------------------------------------------------

export interface InitiateHostedCheckoutParams {
  /** Server-owned FixedOrder-derived order id. Never accept this from a client request body. */
  orderId: string;
  /** Server-owned immutable minor-unit amount from PaymentAttempt. */
  amountMinor: bigint;
  currency: FixedOrderCurrency;
  returnUrl: string;
}

export interface InitiateHostedCheckoutResult {
  sessionId: string;
  successIndicator: string;
  raw: unknown;
}

export type MpgsOrderStatus = "PAID" | "PENDING" | "FAILED" | "CANCELLED" | "UNKNOWN";

export interface RetrieveOrderResult {
  orderId: string;
  merchantId: string;
  status: MpgsOrderStatus;
  amountMinor: bigint;
  currency: FixedOrderCurrency;
  providerRef: string;
  raw: unknown;
}

type FetchLike = typeof globalThis.fetch;

function toMinorUnits(amount: number, currency: FixedOrderCurrency): bigint {
  // MPGS reports amount as a decimal major-unit number (e.g. 1500.00); both
  // PKR and USD are 2-decimal currencies for this gateway.
  void currency;
  return BigInt(Math.round(amount * 100));
}

function mapGatewayResultToStatus(result: string | undefined, orderStatus: string | undefined): MpgsOrderStatus {
  const normalizedResult = (result || "").toUpperCase();
  const normalizedOrderStatus = (orderStatus || "").toUpperCase();
  if (normalizedResult === "SUCCESS" && (normalizedOrderStatus === "CAPTURED" || normalizedOrderStatus === "PAID")) {
    return "PAID";
  }
  if (normalizedOrderStatus === "CANCELLED") return "CANCELLED";
  if (normalizedResult === "FAILURE" || normalizedOrderStatus === "FAILED") return "FAILED";
  if (normalizedOrderStatus === "PENDING" || normalizedOrderStatus === "" ) return "PENDING";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Gateway client
// ---------------------------------------------------------------------------

export class BankAlfalahMpgsGateway {
  private readonly config: MpgsGatewayConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: MpgsGatewayConfig, fetchImpl: FetchLike = globalThis.fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  /**
   * PUT .../order/{orderId}/checkout -- initiates Hosted Checkout. Amount,
   * currency, and order id all come from server-owned params (the caller
   * must derive them from FixedOrder/PaymentAttempt, never from a request
   * body) and currency must already have passed `assertMpgsCurrencySupported`.
   */
  async initiateHostedCheckout(params: InitiateHostedCheckoutParams): Promise<InitiateHostedCheckoutResult> {
    assertConfigured(this.config);
    assertMpgsCurrencySupported(params.currency);
    if (this.config.checkoutMode !== "hosted_checkout") {
      throw new MpgsNotConfiguredError(`unsupported checkout mode: ${this.config.checkoutMode}`);
    }

    const url = `${restBaseUrl(this.config)}/order/${encodeURIComponent(params.orderId)}/checkout`;
    const majorAmount = (Number(params.amountMinor) / 100).toFixed(2);

    const response = await this.fetchImpl(url, {
      method: "PUT",
      headers: {
        Authorization: buildMpgsAuthHeader(this.config),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiOperation: "INITIATE_CHECKOUT",
        checkoutMode: "WEBSITE",
        interaction: {
          operation: "PURCHASE",
          returnUrl: params.returnUrl
        },
        order: {
          id: params.orderId,
          amount: majorAmount,
          currency: params.currency
        }
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Bank Alfalah MPGS initiateHostedCheckout failed with status ${response.status}`);
    }
    const sessionId = (body as { session?: { id?: string } })?.session?.id;
    const successIndicator = (body as { successIndicator?: string })?.successIndicator;
    if (!sessionId || !successIndicator) {
      throw new Error("Bank Alfalah MPGS initiateHostedCheckout response missing session id or successIndicator");
    }
    return { sessionId, successIndicator, raw: body };
  }

  /**
   * GET .../order/{orderId} -- Retrieve Order v74. The ONLY status-inquiry
   * call this module makes; always targets the configured base URL with the
   * stored, validated order id -- never a URL taken from webhook content.
   */
  async retrieveOrder(orderId: string): Promise<RetrieveOrderResult> {
    assertConfigured(this.config);
    if (!orderId || typeof orderId !== "string") {
      throw new Error("retrieveOrder requires a non-empty orderId");
    }

    const url = `${restBaseUrl(this.config)}/order/${encodeURIComponent(orderId)}`;
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: buildMpgsAuthHeader(this.config) }
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      merchant?: string;
      status?: string;
      result?: string;
      amount?: number;
      currency?: string;
      transaction?: Array<{ transaction?: { id?: string } }>;
    };
    if (!response.ok) {
      throw new Error(`Bank Alfalah MPGS retrieveOrder failed with status ${response.status}`);
    }

    const currency = body.currency === "USD" || body.currency === "PKR" ? body.currency : "UNKNOWN";
    const providerRef =
      body.transaction && body.transaction.length > 0 && body.transaction[0].transaction?.id
        ? String(body.transaction[0].transaction.id)
        : String(body.id ?? orderId);

    return {
      orderId: String(body.id ?? orderId),
      merchantId: String(body.merchant ?? ""),
      status: mapGatewayResultToStatus(body.result, body.status),
      amountMinor: typeof body.amount === "number" ? toMinorUnits(body.amount, currency as FixedOrderCurrency) : 0n,
      currency: currency as FixedOrderCurrency,
      providerRef,
      raw: body
    };
  }
}

// ---------------------------------------------------------------------------
// Verification orchestrator
// ---------------------------------------------------------------------------

export interface StoredPaymentAttemptForVerification {
  fixedOrderId: string;
  paymentAttemptId: string;
  gatewayOrderId: string;
  amountMinor: bigint;
  currency: FixedOrderCurrency;
  provider: string;
}

export type MpgsVerificationOutcome =
  | { matched: true; evidence: VerifiedPaymentEvidence }
  | { matched: false; reason: string };

/**
 * Exact merchant/order/amount/currency/status match between the stored
 * attempt and the freshly retrieved gateway order. Returns matched=false on
 * ANY mismatch or non-paid status -- this is the only place a paid
 * transition can originate, and it never trusts the caller's belief about
 * what happened (browser return, webhook) -- only this comparison.
 */
export function matchRetrievedOrderToAttempt(
  attempt: StoredPaymentAttemptForVerification,
  retrieved: RetrieveOrderResult,
  merchantId: string
): MpgsVerificationOutcome {
  if (retrieved.status !== "PAID") {
    return { matched: false, reason: `gateway order status is ${retrieved.status}, not PAID` };
  }
  if (retrieved.merchantId !== merchantId) {
    return { matched: false, reason: "merchant id mismatch between configured merchant and gateway response" };
  }
  if (retrieved.orderId !== attempt.gatewayOrderId) {
    return { matched: false, reason: "order id mismatch between stored attempt and gateway response" };
  }
  if (retrieved.amountMinor !== attempt.amountMinor) {
    return { matched: false, reason: "amount mismatch between stored attempt and gateway response" };
  }
  if (retrieved.currency !== attempt.currency) {
    return { matched: false, reason: "currency mismatch between stored attempt and gateway response" };
  }

  const dedupeHash = createHash("sha256")
    .update(`bank_alfalah_mpgs:${retrieved.orderId}:${retrieved.providerRef}:${attempt.amountMinor.toString()}`)
    .digest("hex");

  return {
    matched: true,
    evidence: {
      fixedOrderId: attempt.fixedOrderId,
      paymentAttemptId: attempt.paymentAttemptId,
      provider: attempt.provider,
      providerEventId: dedupeHash,
      providerRef: retrieved.providerRef,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency,
      dedupeHash
    }
  };
}

/**
 * Full verify-then-apply flow used by BOTH the (not-yet-routed) browser
 * return handler and the (not-yet-routed) webhook trigger handler. Neither
 * caller may skip the Retrieve Order call: this function always performs it
 * itself and never accepts a caller-supplied "it was already verified"
 * shortcut. On a match, delegates to the existing, unmodified P4A
 * transaction (`applyVerifiedPaymentEvidence`) -- this function never calls
 * Replicate, R2, or any worker.
 */
export async function verifyMpgsPaymentByRetrieveOrder(
  gateway: BankAlfalahMpgsGateway,
  merchantId: string,
  attempt: StoredPaymentAttemptForVerification
): Promise<{ outcome: MpgsVerificationOutcome; applied?: PaymentEvidenceResult }> {
  const retrieved = await gateway.retrieveOrder(attempt.gatewayOrderId);
  const outcome = matchRetrievedOrderToAttempt(attempt, retrieved, merchantId);
  if (!outcome.matched) {
    return { outcome };
  }
  const applied = await applyVerifiedPaymentEvidence(outcome.evidence);
  return { outcome, applied };
}

/**
 * Browser return handler. Untrusted by design: the browser can claim
 * anything (including forging a "success" query string), so this function
 * ignores every field the browser supplied except the order id needed to
 * look up the stored attempt, and always re-verifies via Retrieve Order.
 * `resultCode`/`indicator` values from the query string are accepted only
 * as a UI hint (not passed through) and are never used to gate verification.
 */
export async function handleMpgsBrowserReturn(
  gateway: BankAlfalahMpgsGateway,
  merchantId: string,
  attempt: StoredPaymentAttemptForVerification
): Promise<{ outcome: MpgsVerificationOutcome; applied?: PaymentEvidenceResult }> {
  return verifyMpgsPaymentByRetrieveOrder(gateway, merchantId, attempt);
}

/**
 * Webhook trigger handler. The MPGS webhook payload is used ONLY to learn
 * which order id to re-check -- its content is never trusted for the
 * payment decision itself, matching the requirement that webhook
 * authenticity cannot be fully verified in this packet without a live
 * sandbox signing-secret test. Every status-inquiry request goes only to
 * the configured `BANK_ALFALAH_MPGS_BASE_URL` with the stored order id --
 * never a URL taken from the webhook payload.
 */
export async function handleMpgsWebhookTrigger(
  gateway: BankAlfalahMpgsGateway,
  merchantId: string,
  attempt: StoredPaymentAttemptForVerification
): Promise<{ outcome: MpgsVerificationOutcome; applied?: PaymentEvidenceResult }> {
  return verifyMpgsPaymentByRetrieveOrder(gateway, merchantId, attempt);
}
