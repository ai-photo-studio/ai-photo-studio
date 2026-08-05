/**
 * R9.2-P4C/P4D-SANDBOX-SMOKE
 *
 * Bounded, owner-authorized Bank Alfalah Mastercard Gateway (MPGS) SANDBOX
 * smoke test. For PKR, then (only if PKR authentication succeeds) for USD,
 * performs exactly two network calls each against the configured sandbox
 * origin:
 *
 *   1. Hosted Checkout initialization (POST .../merchant/{merchantId}/session,
 *      R9.2-MPGS-ACTUAL-APP-E2E-corrected shape per the bank's own v100 doc)
 *      for a synthetic, unique, non-customer test order -- NO card data is
 *      ever entered or submitted, so this can never capture a payment.
 *   2. Retrieve Order v74/V100 (GET .../order/{orderId}) on the same order
 *      id, to prove the authenticated status-inquiry call works end to end.
 *
 * This script NEVER prints a secret value (merchant id, API password,
 * operator id). It prints only: HTTP status codes, booleans, string
 * lengths (never contents), the gateway-reported order status enum, and
 * non-secret response headers (content-type, www-authenticate,
 * correlation/request id). It makes NO Replicate/R2/worker call and writes
 * NOTHING to any database.
 *
 * Per R9.2-P4D task rule: if the exact configured Merchant ID is rejected
 * specifically because of identifier length or merchant recognition, this
 * script stops (exit 3) rather than guessing a truncated/derived id. USD is
 * only attempted after PKR authentication succeeds (task rule: "repeat for
 * USD only after PKR authentication succeeds").
 *
 * Exit codes:
 *   0  -- PKR (and, if attempted, USD) both completed with structurally valid responses
 *   1  -- required config/secrets missing (fail-closed, before any network call)
 *   2  -- a network call was attempted but the gateway rejected it (auth/HTTP failure), not a length/recognition issue
 *   3  -- PKR was rejected specifically for merchant-id length/recognition -- USD was never attempted; see stdout for the exact Bank Alfalah follow-up question
 *
 * Usage:
 *   BANK_ALFALAH_MPGS_ENABLED=true \
 *   BANK_ALFALAH_MPGS_BASE_URL=https://test-bankalfalah.gateway.mastercard.com \
 *   BANK_ALFALAH_MPGS_API_VERSION=100 \
 *   BANK_ALFALAH_MPGS_MERCHANT_ID=<merchant id> \
 *   BANK_ALFALAH_MPGS_API_PASSWORD=<api password> \
 *   BANK_ALFALAH_MPGS_MERCHANT_NAME=<merchant display name, 1-40 chars> \
 *   npx tsx src/scripts/p4c-bank-alfalah-mpgs-sandbox-smoke.ts
 */
import { randomUUID } from "node:crypto";
import {
  BankAlfalahMpgsGateway,
  type MpgsGatewayConfig
} from "../services/p4c-bank-alfalah-mpgs-gateway.service";
import type { FixedOrderCurrency } from "../domain/fixedOrder/fixedOrderGuards";

// The sandbox test gateway origin is hardcoded here as a hard ceiling: even
// if an env var were ever set to something else, this script refuses to
// contact any host other than the known Mastercard Gateway sandbox origin.
const PINNED_SANDBOX_ORIGIN = "https://test-bankalfalah.gateway.mastercard.com";

function redactedPresence(name: string, value: string | undefined): boolean {
  const present = typeof value === "string" && value.trim().length > 0;
  console.log(`  ${name}: ${present ? "present" : "MISSING"}`);
  return present;
}

/** Heuristic: does this failure look like a merchant-id length/recognition
 * rejection (structural 404 on the merchant-scoped path) as opposed to a
 * credential/auth rejection (401/403)? Never inspects the merchant id value
 * itself -- only the HTTP status the gateway returned. */
function looksLikeMerchantIdLengthOrRecognitionRejection(message: string): boolean {
  return message.includes("status 404");
}

async function runCurrencyLeg(
  gateway: BankAlfalahMpgsGateway,
  currency: FixedOrderCurrency,
  apiVersion: string
): Promise<{ ok: true } | { ok: false; code: 2 | 3 }> {
  const orderId = `p4d-sandbox-smoke-${currency.toLowerCase()}-${randomUUID()}`;
  console.log(`\n[${currency}] synthetic non-customer test order id: ${orderId} (no card data, no capture)`);
  console.log(`[${currency}] api version=${apiVersion} apiOperation=INITIATE_CHECKOUT`);

  console.log(`[${currency}] [1/2] Hosted Checkout initialization...`);
  try {
    const initResult = await gateway.initiateHostedCheckout({
      orderId,
      amountMinor: 10000n, // 100.00 major units, sandbox-only, never captured
      currency,
      returnUrl: "https://example.com/p4d-sandbox-smoke-return"
    });
    console.log(
      `  accepted: sessionId present=${Boolean(initResult.sessionId)} (length=${initResult.sessionId.length})`
    );
    console.log(
      `  successIndicator present=${Boolean(initResult.successIndicator)} (length=${initResult.successIndicator.length})`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`  FAILED: ${message}`);
    if (currency === "PKR" && looksLikeMerchantIdLengthOrRecognitionRejection(message)) {
      return { ok: false, code: 3 };
    }
    return { ok: false, code: 2 };
  }

  console.log(`[${currency}] [2/2] Retrieve Order (authenticated status inquiry)...`);
  try {
    const retrieved = await gateway.retrieveOrder(orderId);
    console.log(`  accepted: orderId matches=${retrieved.orderId === orderId}`);
    console.log(`  status=${retrieved.status}`);
    console.log(`  currency=${retrieved.currency}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`  FAILED: ${message}`);
    if (currency === "PKR" && looksLikeMerchantIdLengthOrRecognitionRejection(message)) {
      return { ok: false, code: 3 };
    }
    return { ok: false, code: 2 };
  }

  return { ok: true };
}

async function main(): Promise<number> {
  console.log("R9.2-P4D Bank Alfalah MPGS sandbox smoke test (auth verification)");
  console.log(`pinned sandbox origin: ${PINNED_SANDBOX_ORIGIN}`);
  console.log("required secrets (presence and length only, never values):");

  const merchantId = process.env.BANK_ALFALAH_MPGS_MERCHANT_ID;
  const apiPassword = process.env.BANK_ALFALAH_MPGS_API_PASSWORD;
  const operatorId = process.env.BANK_ALFALAH_MPGS_OPERATOR_ID;
  // Not a secret (a display name, per the bank's own v100 doc field
  // interaction.merchant.name), but treated with the same presence-only
  // logging discipline as the rest of this script for consistency.
  const merchantName = process.env.BANK_ALFALAH_MPGS_MERCHANT_NAME;

  const hasMerchantId = redactedPresence("BANK_ALFALAH_MPGS_MERCHANT_ID", merchantId);
  const hasApiPassword = redactedPresence("BANK_ALFALAH_MPGS_API_PASSWORD", apiPassword);
  const hasMerchantName = redactedPresence(
    "BANK_ALFALAH_MPGS_MERCHANT_NAME (required by bank v100 doc: interaction.merchant.name)",
    merchantName
  );
  redactedPresence("BANK_ALFALAH_MPGS_OPERATOR_ID (portal metadata only, not used for auth)", operatorId);
  if (hasMerchantId) {
    console.log(`  BANK_ALFALAH_MPGS_MERCHANT_ID length=${(merchantId as string).trim().length} (value never printed)`);
  }

  if (!hasMerchantId || !hasApiPassword || !hasMerchantName) {
    console.error("FAIL-CLOSED: required secret/config value(s) missing. No network call attempted.");
    return 1;
  }

  const baseUrlOverride = (process.env.BANK_ALFALAH_MPGS_BASE_URL || "").trim();
  if (baseUrlOverride && baseUrlOverride !== PINNED_SANDBOX_ORIGIN) {
    console.error(
      `FAIL-CLOSED: BANK_ALFALAH_MPGS_BASE_URL does not match the pinned sandbox origin. Refusing to contact any other host.`
    );
    return 1;
  }

  // Never truncate, pad, or derive the configured Merchant ID -- use it
  // exactly as configured, whatever its length.
  const exactMerchantId = (merchantId as string).trim();
  const apiVersion = (process.env.BANK_ALFALAH_MPGS_API_VERSION || "100").trim();

  const config: MpgsGatewayConfig = {
    enabled: true,
    baseUrl: PINNED_SANDBOX_ORIGIN,
    apiVersion,
    merchantId: exactMerchantId,
    apiPassword: apiPassword as string,
    merchantName: (merchantName as string).trim(),
    checkoutMode: "hosted_checkout"
  };

  const gateway = new BankAlfalahMpgsGateway(config);

  const pkrResult = await runCurrencyLeg(gateway, "PKR", apiVersion);
  if (!pkrResult.ok) {
    if (pkrResult.code === 3) {
      console.error(
        "\nSTOP: PKR was rejected in a shape consistent with a merchant-id length/recognition issue " +
          "(structural 404 on the merchant-scoped path), not a 401/403 credential rejection. Per task rule, " +
          "this script does NOT guess a truncated/derived Merchant ID against the live sandbox."
      );
      console.error("\nExact Bank Alfalah follow-up needed:");
      console.error(
        "  \"Our MPGS sandbox merchant profile has a bank-issued 15-character Merchant ID, but the Hosted " +
          "Checkout / Retrieve Order REST calls using merchant.<15-character-ID> as the Basic Auth username and " +
          "the same ID in the /merchant/{merchantId}/ URL path segment are rejected with an HTTP 404 under API " +
          "V100. Generic MPGS documentation states merchantId may be up to 12 characters. Is there a SEPARATE, " +
          "shorter (<=12 character) gateway Merchant ID -- distinct from the 15-character ID -- that must be " +
          "used in the URL path and the merchant.<merchantId> Basic Auth username instead of the 15-character " +
          "ID? If so, please supply that exact gateway Merchant ID.\""
      );
      return 3;
    }
    return 2;
  }

  console.log("\nPKR authentication verified. Proceeding to USD (bank-confirmed: same credentials, same sandbox profile).");
  const usdResult = await runCurrencyLeg(gateway, "USD", apiVersion);
  if (!usdResult.ok) {
    return usdResult.code;
  }

  console.log(
    "\nRESULT: sandbox smoke PASSED for PKR and USD (auth accepted, Hosted Checkout initialized, Retrieve Order authenticated)."
  );
  console.log("No card data, no capture, no Replicate/R2/worker call was made.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`UNEXPECTED ERROR: ${error instanceof Error ? error.message : "unknown"}`);
    process.exit(2);
  });
