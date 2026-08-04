/**
 * R9.2-P4C-MPGS-UNIT
 *
 * Fake-port unit tests for the Bank Alfalah MPGS gateway adapter
 * (p4c-bank-alfalah-mpgs-gateway.service.ts). No database, no network --
 * every fetch call is a local stub. Run with:
 *   npx tsx --test src/services/p4c-bank-alfalah-mpgs-gateway.service.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BankAlfalahMpgsGateway,
  MPGS_CURRENCY_SUPPORT,
  MpgsCurrencyNotSupportedError,
  MpgsNotConfiguredError,
  assertMpgsCurrencySupported,
  buildMpgsAuthHeader,
  matchRetrievedOrderToAttempt,
  type MpgsGatewayConfig,
  type RetrieveOrderResult,
  type StoredPaymentAttemptForVerification
} from "./p4c-bank-alfalah-mpgs-gateway.service";

const baseConfig: MpgsGatewayConfig = {
  enabled: true,
  baseUrl: "https://test-bankalfalah.gateway.mastercard.com",
  apiVersion: "74",
  merchantId: "REDACTEDMERCHANT",
  apiPassword: "REDACTEDPASSWORD",
  checkoutMode: "hosted_checkout"
};

function fakeFetchJson(status: number, body: unknown, headers?: Record<string, string>): typeof globalThis.fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      headers: new Headers(headers ?? {})
    }) as Response) as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// 2. Fail-closed configuration
// ---------------------------------------------------------------------------

test("gateway fails closed when disabled", async () => {
  const gw = new BankAlfalahMpgsGateway({ ...baseConfig, enabled: false }, fakeFetchJson(200, {}));
  await assert.rejects(
    () => gw.retrieveOrder("order-1"),
    (err: unknown) => err instanceof MpgsNotConfiguredError
  );
});

test("gateway fails closed when merchant id missing", async () => {
  const gw = new BankAlfalahMpgsGateway({ ...baseConfig, merchantId: "" }, fakeFetchJson(200, {}));
  await assert.rejects(
    () => gw.retrieveOrder("order-1"),
    (err: unknown) => err instanceof MpgsNotConfiguredError
  );
});

test("gateway fails closed when API password missing", async () => {
  const gw = new BankAlfalahMpgsGateway({ ...baseConfig, apiPassword: "" }, fakeFetchJson(200, {}));
  await assert.rejects(
    () => gw.retrieveOrder("order-1"),
    (err: unknown) => err instanceof MpgsNotConfiguredError
  );
});

test("gateway fails closed on invalid base URL", async () => {
  const gw = new BankAlfalahMpgsGateway({ ...baseConfig, baseUrl: "not-a-url" }, fakeFetchJson(200, {}));
  await assert.rejects(
    () => gw.retrieveOrder("order-1"),
    (err: unknown) => err instanceof MpgsNotConfiguredError
  );
});

// ---------------------------------------------------------------------------
// 3. API auth success/failure (mocked)
// ---------------------------------------------------------------------------

test("buildMpgsAuthHeader uses merchant.<id> username, never the operator id", () => {
  const header = buildMpgsAuthHeader({ merchantId: "MID123", apiPassword: "secretpass" });
  const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
  assert.equal(decoded, "merchant.MID123:secretpass");
});

test("retrieveOrder sends Authorization header and parses a PAID order", async () => {
  let capturedAuth = "";
  const fetchImpl: typeof globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    capturedAuth = String((init.headers as Record<string, string>).Authorization);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "order-42",
        merchant: baseConfig.merchantId,
        result: "SUCCESS",
        status: "CAPTURED",
        amount: 1500,
        currency: "PKR",
        transaction: [{ transaction: { id: "txn-ref-1" } }]
      })
    } as Response;
  }) as typeof globalThis.fetch;

  const gw = new BankAlfalahMpgsGateway(baseConfig, fetchImpl);
  const result = await gw.retrieveOrder("order-42");
  assert.equal(result.status, "PAID");
  assert.equal(result.amountMinor, 150000n);
  assert.equal(result.currency, "PKR");
  assert.equal(result.providerRef, "txn-ref-1");
  assert.ok(capturedAuth.startsWith("Basic "));
});

test("retrieveOrder surfaces an HTTP failure as a rejected promise (auth failure case)", async () => {
  const gw = new BankAlfalahMpgsGateway(baseConfig, fakeFetchJson(401, { error: "unauthorized" }));
  await assert.rejects(() => gw.retrieveOrder("order-1"), /status 401/);
});

// ---------------------------------------------------------------------------
// R9.2-P4D evidence-capture gap fix: a failed response's content-type,
// WWW-Authenticate, and correlation-id headers (never the auth header) are
// captured in the thrown error so the next real sandbox dispatch produces
// disambiguating evidence (see P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md §3.2).
// ---------------------------------------------------------------------------

test("retrieveOrder failure captures content-type/www-authenticate/correlation-id headers, never the auth header", async () => {
  const gw = new BankAlfalahMpgsGateway(
    baseConfig,
    fakeFetchJson(404, { error: "not found" }, {
      "content-type": "application/json",
      "www-authenticate": "Basic realm=test",
      "x-correlation-id": "corr-abc-123"
    })
  );
  await assert.rejects(() => gw.retrieveOrder("order-1"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /status 404/);
    assert.match(err.message, /content-type=application\/json/);
    assert.match(err.message, /www-authenticate=Basic realm=test/);
    assert.match(err.message, /correlation-id=corr-abc-123/);
    // The captured www-authenticate header text is allowed through verbatim (it is
    // never secret bank data), but the base64 Basic Auth *credential* token itself
    // (username:password) must never appear in the error message.
    assert.doesNotMatch(err.message, /Basic [A-Za-z0-9+/]{16,}={0,2}(?!\w)/);
    return true;
  });
});

test("initiateHostedCheckout failure captures headers with a graceful fallback when none are present", async () => {
  const gw = new BankAlfalahMpgsGateway(baseConfig, fakeFetchJson(404, { error: "not found" }));
  await assert.rejects(
    () =>
      gw.initiateHostedCheckout({
        orderId: "order-1",
        amountMinor: 150000n,
        currency: "PKR",
        returnUrl: "https://thannow.com/pay/return"
      }),
    /status 404 \(content-type=none www-authenticate=none correlation-id=none\)/
  );
});

// ---------------------------------------------------------------------------
// 4. Hosted Checkout creation (mocked)
// ---------------------------------------------------------------------------

test("initiateHostedCheckout returns session id and successIndicator on success", async () => {
  const fetchImpl = fakeFetchJson(200, { session: { id: "SESSION0001" }, successIndicator: "abc123" });
  const gw = new BankAlfalahMpgsGateway(baseConfig, fetchImpl);
  const result = await gw.initiateHostedCheckout({
    orderId: "order-1",
    amountMinor: 150000n,
    currency: "PKR",
    returnUrl: "https://thannow.com/pay/return"
  });
  assert.equal(result.sessionId, "SESSION0001");
  assert.equal(result.successIndicator, "abc123");
});

test("initiateHostedCheckout rejects USD (fail-closed, not yet confirmed)", async () => {
  const gw = new BankAlfalahMpgsGateway(baseConfig, fakeFetchJson(200, { session: { id: "x" }, successIndicator: "y" }));
  await assert.rejects(
    () =>
      gw.initiateHostedCheckout({
        orderId: "order-1",
        amountMinor: 15000n,
        currency: "USD",
        returnUrl: "https://thannow.com/pay/return"
      }),
    (err: unknown) => err instanceof MpgsCurrencyNotSupportedError
  );
});

test("initiateHostedCheckout throws on malformed gateway response", async () => {
  const gw = new BankAlfalahMpgsGateway(baseConfig, fakeFetchJson(200, {}));
  await assert.rejects(() =>
    gw.initiateHostedCheckout({
      orderId: "order-1",
      amountMinor: 150000n,
      currency: "PKR",
      returnUrl: "https://thannow.com/pay/return"
    })
  );
});

// ---------------------------------------------------------------------------
// 5. Retrieve Order paid/pending/failed/cancelled handling (mocked)
// ---------------------------------------------------------------------------

const statusCases: Array<{ result?: string; status?: string; expected: string }> = [
  { result: "SUCCESS", status: "CAPTURED", expected: "PAID" },
  { result: undefined, status: "PENDING", expected: "PENDING" },
  { result: "FAILURE", status: "FAILED", expected: "FAILED" },
  { result: undefined, status: "CANCELLED", expected: "CANCELLED" }
];

for (const c of statusCases) {
  test(`retrieveOrder maps gateway result="${c.result}" status="${c.status}" to ${c.expected}`, async () => {
    const gw = new BankAlfalahMpgsGateway(
      baseConfig,
      fakeFetchJson(200, {
        id: "order-1",
        merchant: baseConfig.merchantId,
        result: c.result,
        status: c.status,
        amount: 100,
        currency: "PKR",
        transaction: []
      })
    );
    const result = await gw.retrieveOrder("order-1");
    assert.equal(result.status, c.expected);
  });
}

// ---------------------------------------------------------------------------
// 6. Forged browser "success" return is rejected -- matching logic never
//    trusts a caller-asserted status; only a PAID retrieved order matches.
// ---------------------------------------------------------------------------

const baseAttempt: StoredPaymentAttemptForVerification = {
  fixedOrderId: "fo-1",
  paymentAttemptId: "pa-1",
  gatewayOrderId: "order-1",
  amountMinor: 150000n,
  currency: "PKR",
  provider: "bank_alfalah_mpgs"
};

const baseRetrieved: RetrieveOrderResult = {
  orderId: "order-1",
  merchantId: baseConfig.merchantId,
  status: "PAID",
  amountMinor: 150000n,
  currency: "PKR",
  providerRef: "txn-1",
  raw: {}
};

test("a PENDING retrieved order is rejected even though a browser return claims success", () => {
  const outcome = matchRetrievedOrderToAttempt(baseAttempt, { ...baseRetrieved, status: "PENDING" }, baseConfig.merchantId);
  assert.equal(outcome.matched, false);
});

// ---------------------------------------------------------------------------
// 7. Amount/currency/order/reference/merchant mismatch rejected
// ---------------------------------------------------------------------------

test("amount mismatch is rejected", () => {
  const outcome = matchRetrievedOrderToAttempt(baseAttempt, { ...baseRetrieved, amountMinor: 999n }, baseConfig.merchantId);
  assert.equal(outcome.matched, false);
});

test("currency mismatch is rejected", () => {
  const outcome = matchRetrievedOrderToAttempt(baseAttempt, { ...baseRetrieved, currency: "USD" }, baseConfig.merchantId);
  assert.equal(outcome.matched, false);
});

test("order id mismatch is rejected", () => {
  const outcome = matchRetrievedOrderToAttempt(baseAttempt, { ...baseRetrieved, orderId: "order-other" }, baseConfig.merchantId);
  assert.equal(outcome.matched, false);
});

test("merchant id mismatch is rejected", () => {
  const outcome = matchRetrievedOrderToAttempt(baseAttempt, baseRetrieved, "SOME-OTHER-MERCHANT");
  assert.equal(outcome.matched, false);
});

test("exact match produces normalized VerifiedPaymentEvidence", () => {
  const outcome = matchRetrievedOrderToAttempt(baseAttempt, baseRetrieved, baseConfig.merchantId);
  assert.equal(outcome.matched, true);
  if (outcome.matched) {
    assert.equal(outcome.evidence.fixedOrderId, "fo-1");
    assert.equal(outcome.evidence.paymentAttemptId, "pa-1");
    assert.equal(outcome.evidence.amountMinor, 150000n);
    assert.equal(outcome.evidence.currency, "PKR");
    assert.equal(outcome.evidence.providerRef, "txn-1");
  }
});

// ---------------------------------------------------------------------------
// 9/10. PKR enabled, USD fail-closed
// ---------------------------------------------------------------------------

test("PKR is enabled", () => {
  assert.equal(MPGS_CURRENCY_SUPPORT.PKR.enabled, true);
  assert.doesNotThrow(() => assertMpgsCurrencySupported("PKR"));
});

test("USD is fail-closed (rejected) pending confirmation", () => {
  assert.equal(MPGS_CURRENCY_SUPPORT.USD.enabled, false);
  assert.throws(() => assertMpgsCurrencySupported("USD"), MpgsCurrencyNotSupportedError);
});

// ---------------------------------------------------------------------------
// 11. No secrets in this file / its assertions
// ---------------------------------------------------------------------------

test("test fixtures use only placeholder credential values", () => {
  assert.match(baseConfig.merchantId, /^REDACTED/);
  assert.match(baseConfig.apiPassword, /^REDACTED/);
});
