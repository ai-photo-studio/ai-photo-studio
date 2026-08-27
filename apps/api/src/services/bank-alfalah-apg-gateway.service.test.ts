import assert from "node:assert/strict";
import test from "node:test";
import {
  BankAlfalahApgConfigurationError,
  BankAlfalahApgGateway,
  BankAlfalahApgProtocolError,
  type ApgRequestHashInput,
  type BankAlfalahApgConfig
} from "./bank-alfalah-apg-gateway.service";
import type { VerifiedPaymentEvidence } from "./p4a-payment-verified-execution-queue.service";

const baseConfig: BankAlfalahApgConfig = {
  enabled: true,
  baseUrl: "https://sandbox.bankalfalah.com",
  merchantId: "TEST-MERCHANT",
  storeId: "TEST-STORE",
  merchantHash: "TEST-MERCHANT-HASH",
  username: "TEST-USERNAME",
  password: "TEST-PASSWORD",
  aesKey: "0123456789abcdef",
  aesIv: "fedcba9876543210",
  returnUrl: "https://api.thannow.com/api/payments/bank-alfalah/return"
};

const hash = ({ endpoint }: { endpoint: string }) => `fixture-${endpoint}`;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("APG is disabled by default and never falls back to MPGS", () => {
  assert.throws(() => new BankAlfalahApgGateway({ ...baseConfig, enabled: false }).buildHandshakePayload({ orderId: "FO-1" }), BankAlfalahApgConfigurationError);
});

test("missing credentials and malformed configuration fail closed", () => {
  assert.throws(() => new BankAlfalahApgGateway({ ...baseConfig, merchantId: "" }, undefined, hash).buildHandshakePayload({ orderId: "FO-1" }), /merchantId/);
  assert.throws(() => new BankAlfalahApgGateway({ ...baseConfig, baseUrl: "http://sandbox.bankalfalah.com" }, undefined, hash).buildHandshakePayload({ orderId: "FO-1" }), /HTTPS/);
  assert.throws(() => new BankAlfalahApgGateway({ ...baseConfig, aesKey: "", aesIv: "" }).buildHandshakePayload({ orderId: "FO-1" }), /aesKey is not configured/);
});

test("handshake and transaction payloads use API channel 1002 and server-owned values", () => {
  const gateway = new BankAlfalahApgGateway(baseConfig, undefined, hash);
  const handshake = gateway.buildHandshakePayload({ orderId: "FO-SERVER-1" });
  assert.equal(handshake.HS_ChannelId, "1002");
  assert.equal(handshake.HS_TransactionReferenceNumber, "FO-SERVER-1");
  assert.equal(handshake.HS_ReturnURL, baseConfig.returnUrl);
  assert.equal(handshake.HS_RequestHash, "fixture-handshake");

  const transaction = gateway.buildTransactionPayload({ orderId: "FO-SERVER-1", amountMinor: 125000n, currency: "PKR", authToken: "fixture-auth", transactionTypeId: "3" });
  assert.equal(transaction.TransactionAmount, "1250.00");
  assert.equal(transaction.TransactionReferenceNumber, "FO-SERVER-1");
  assert.equal(transaction.RequestHash, "fixture-transaction");
  assert.throws(() => gateway.buildTransactionPayload({ orderId: "FO-SERVER-1", amountMinor: 0n, currency: "PKR", authToken: "fixture-auth", transactionTypeId: "3" }), /positive/);
});

test("redirection handshake follows the portal channel 1001 form contract", () => {
  const calls: ApgRequestHashInput[] = [];
  const gateway = new BankAlfalahApgGateway(baseConfig, undefined, (input) => {
    calls.push(input);
    return "fixture-redirection";
  });
  const payload = gateway.buildRedirectionHandshakePayload({ orderId: "FO-REDIRECT-1" });
  assert.deepEqual(Object.keys(payload), ["HS_MerchantId", "HS_StoreId", "HS_ChannelId", "HS_MerchantHash", "HS_MerchantUsername", "HS_MerchantPassword", "HS_IsRedirectionRequest", "HS_ReturnURL", "HS_RequestHash", "HS_IsBIN", "HS_TransactionReferenceNumber", "handshake"]);
  assert.equal(payload.HS_ChannelId, "1001");
  assert.equal(payload.HS_IsRedirectionRequest, "0");
  assert.equal(payload.HS_IsBIN, "0");
  assert.equal(payload.HS_RequestHash, "fixture-redirection");
  assert.equal(calls[0]?.endpoint, "redirection-handshake");
});

test("malformed handshake responses and non-PAID statuses are rejected", async () => {
  const malformed = new BankAlfalahApgGateway(baseConfig, async () => response({ success: true }), hash);
  await assert.rejects(() => malformed.initiateHandshake({ orderId: "FO-1" }), /AuthToken/);

  const unpaid = new BankAlfalahApgGateway(baseConfig, async () => response({ ResponseCode: "00", Description: "Success", MerchantId: "TEST-MERCHANT", StoreId: "TEST-STORE", TransactionReferenceNumber: "FO-1", TransactionId: "TX-1", TransactionAmount: "1250.00", Currency: "PKR", TransactionStatus: "Pending" }), hash);
  await assert.rejects(() => unpaid.getOrderStatus("FO-1", 125000n, "PKR"), BankAlfalahApgProtocolError);
});

test("verified sandbox handshake returns an SSO redirect built from server-owned order data", async () => {
  let requestBody: Record<string, string> | undefined;
  const gateway = new BankAlfalahApgGateway(baseConfig, async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, string>;
    return response({ success: true, AuthToken: "fixture-auth", ReturnURL: baseConfig.returnUrl });
  }, hash);
  const handshake = await gateway.initiateHandshake({ orderId: "FO-SANDBOX-1" });
  const redirect = gateway.buildSsoRedirect(handshake.authToken, "FO-SANDBOX-1", "3", 125000n, "PKR");
  assert.equal(requestBody?.HS_TransactionReferenceNumber, "FO-SANDBOX-1");
  assert.equal(redirect.fields.TransactionReferenceNumber, "FO-SANDBOX-1");
  assert.equal(redirect.fields.TransactionAmount, "1250.00");
  assert.equal(redirect.fields.Currency, "PKR");
  assert.equal(redirect.fields.AuthToken, "fixture-auth");
});

test("HS1001 customer handshake is form-encoded, recursively extracts AuthToken, and never uses API 1002", async () => {
  let requestUrl = "";
  let requestBody = "";
  const gateway = new BankAlfalahApgGateway(baseConfig, async (url, init) => {
    requestUrl = String(url);
    requestBody = String(init?.body);
    return response({ success: true, data: { AuthToken: "fixture-auth", ReturnURL: baseConfig.returnUrl } });
  }, hash);
  const result = await gateway.initiateRedirectionHandshake({ orderId: "FO-1001-1" });
  assert.equal(requestUrl, "https://sandbox.bankalfalah.com/HS/HS/HS");
  assert.match(requestBody, /HS_ChannelId=1001/);
  assert.match(requestBody, /HS_IsRedirectionRequest=0/);
  assert.match(requestBody, /HS_IsBIN=0/);
  assert.match(requestBody, /HS_RequestHash=fixture-redirection-handshake/);
  assert.equal(result.authToken, "fixture-auth");
  assert.equal(result.returnUrl, baseConfig.returnUrl);
});

test("documented PAID OrderStatus is verified before evidence is emitted", async () => {
  let applied: VerifiedPaymentEvidence | undefined;
  const gateway = new BankAlfalahApgGateway(baseConfig, async (url, init) => {
    assert.equal(init?.method, "GET");
    assert.match(String(url), /\/HS\/api\/IPN\/OrderStatus\/TEST-MERCHANT\/TEST-STORE\/FO-1$/);
    return response({ ResponseCode: "00", Description: "Success", MerchantId: "TEST-MERCHANT", StoreId: "TEST-STORE", TransactionReferenceNumber: "FO-1", TransactionId: "TX-1", TransactionAmount: "1250.00", Currency: "PKR", TransactionStatus: "Paid" });
  }, hash);
  const result = await gateway.verifyAndApplyOrderStatus({ orderId: "FO-1", fixedOrderId: "fixed-1", paymentAttemptId: "attempt-1", amountMinor: 125000n, currency: "PKR" }, async (evidence) => {
    applied = evidence;
    return { outcome: "APPLIED" };
  });
  assert.equal(result.outcome, "APPLIED");
  assert.equal(applied?.provider, "bank_alfalah");
  assert.equal(applied?.providerRef, "TX-1");
  assert.equal(applied?.dedupeHash, "1e23a41bde19c175cba490e91bf3699e42aec0fc5c9b5ff9a7a04eabdb42f9c5");
});

test("SSO redirect contains no client-controlled merchant or amount fields", () => {
  const gateway = new BankAlfalahApgGateway(baseConfig, undefined, hash);
  const redirect = gateway.buildSsoRedirect("fixture-auth", "FO-1", "3", 125000n, "PKR");
  assert.equal(redirect.url, "https://sandbox.bankalfalah.com/SSO/SSO/SSO");
  assert.equal(redirect.fields.IsBIN, "0");
  assert.equal(redirect.fields.ChannelId, "1001");
  assert.equal(redirect.fields.MerchantId, "TEST-MERCHANT");
  assert.equal(redirect.fields.TransactionAmount, "1250.00");
});
