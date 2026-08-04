/**
 * R9.2-P4C-SANDBOX-SMOKE
 *
 * Bounded, owner-authorized Bank Alfalah Mastercard Gateway (MPGS) SANDBOX
 * smoke test. Performs exactly two network calls against the configured
 * sandbox origin:
 *
 *   1. Hosted Checkout initialization (PUT .../order/{orderId}/checkout) for
 *      a synthetic test order -- NO card data is ever entered or submitted,
 *      so this can never capture a payment.
 *   2. Retrieve Order v74 (GET .../order/{orderId}) on the same order id, to
 *      prove the authenticated status-inquiry call works end to end.
 *
 * This script NEVER prints a secret value (merchant id, API password,
 * operator id). It prints only: HTTP status codes, booleans, string
 * lengths/prefixes, and the gateway-reported order status enum. It makes NO
 * Replicate/R2/worker call and writes NOTHING to any database.
 *
 * Exit codes:
 *   0  -- both calls completed and returned structurally valid responses
 *   1  -- required config/secrets missing (fail-closed, before any network call)
 *   2  -- a network call was attempted but the gateway rejected it (auth/HTTP failure)
 *
 * Usage:
 *   BANK_ALFALAH_MPGS_ENABLED=true \
 *   BANK_ALFALAH_MPGS_BASE_URL=https://test-bankalfalah.gateway.mastercard.com \
 *   BANK_ALFALAH_MPGS_MERCHANT_ID=<merchant id> \
 *   BANK_ALFALAH_MPGS_API_PASSWORD=<api password> \
 *   npx tsx src/scripts/p4c-bank-alfalah-mpgs-sandbox-smoke.ts
 */
import { randomUUID } from "node:crypto";
import {
  BankAlfalahMpgsGateway,
  type MpgsGatewayConfig
} from "../services/p4c-bank-alfalah-mpgs-gateway.service";

// The sandbox test gateway origin is hardcoded here as a hard ceiling: even
// if an env var were ever set to something else, this script refuses to
// contact any host other than the known Mastercard Gateway sandbox origin.
const PINNED_SANDBOX_ORIGIN = "https://test-bankalfalah.gateway.mastercard.com";

function redactedPresence(name: string, value: string | undefined): boolean {
  const present = typeof value === "string" && value.trim().length > 0;
  console.log(`  ${name}: ${present ? "present" : "MISSING"}`);
  return present;
}

async function main(): Promise<number> {
  console.log("R9.2-P4C Bank Alfalah MPGS sandbox smoke test");
  console.log(`pinned sandbox origin: ${PINNED_SANDBOX_ORIGIN}`);
  console.log("required secrets (presence only, never values):");

  const merchantId = process.env.BANK_ALFALAH_MPGS_MERCHANT_ID;
  const apiPassword = process.env.BANK_ALFALAH_MPGS_API_PASSWORD;
  const operatorId = process.env.BANK_ALFALAH_MPGS_OPERATOR_ID;

  const hasMerchantId = redactedPresence("BANK_ALFALAH_MPGS_MERCHANT_ID", merchantId);
  const hasApiPassword = redactedPresence("BANK_ALFALAH_MPGS_API_PASSWORD", apiPassword);
  redactedPresence("BANK_ALFALAH_MPGS_OPERATOR_ID (portal metadata only, not used for auth)", operatorId);

  if (!hasMerchantId || !hasApiPassword) {
    console.error("FAIL-CLOSED: required secret(s) missing. No network call attempted.");
    return 1;
  }

  const baseUrlOverride = (process.env.BANK_ALFALAH_MPGS_BASE_URL || "").trim();
  if (baseUrlOverride && baseUrlOverride !== PINNED_SANDBOX_ORIGIN) {
    console.error(
      `FAIL-CLOSED: BANK_ALFALAH_MPGS_BASE_URL does not match the pinned sandbox origin. Refusing to contact any other host.`
    );
    return 1;
  }

  const config: MpgsGatewayConfig = {
    enabled: true,
    baseUrl: PINNED_SANDBOX_ORIGIN,
    apiVersion: (process.env.BANK_ALFALAH_MPGS_API_VERSION || "74").trim(),
    merchantId: merchantId as string,
    apiPassword: apiPassword as string,
    checkoutMode: "hosted_checkout"
  };

  const gateway = new BankAlfalahMpgsGateway(config);
  const orderId = `p4c-sandbox-smoke-${randomUUID()}`;
  console.log(`synthetic test order id: ${orderId} (no card data, no capture)`);

  console.log("\n[1/2] Hosted Checkout initialization...");
  try {
    const initResult = await gateway.initiateHostedCheckout({
      orderId,
      amountMinor: 10000n, // PKR 100.00, sandbox-only, never captured
      currency: "PKR",
      returnUrl: "https://example.com/p4c-sandbox-smoke-return"
    });
    console.log(`  accepted: sessionId present=${Boolean(initResult.sessionId)} (length=${initResult.sessionId.length})`);
    console.log(
      `  successIndicator present=${Boolean(initResult.successIndicator)} (length=${initResult.successIndicator.length})`
    );
  } catch (error) {
    console.error(`  FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    return 2;
  }

  console.log("\n[2/2] Retrieve Order (authenticated status inquiry)...");
  try {
    const retrieved = await gateway.retrieveOrder(orderId);
    console.log(`  accepted: orderId matches=${retrieved.orderId === orderId}`);
    console.log(`  status=${retrieved.status}`);
    console.log(`  currency=${retrieved.currency}`);
  } catch (error) {
    console.error(`  FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    return 2;
  }

  console.log("\nRESULT: sandbox smoke PASSED (auth accepted, Hosted Checkout initialized, Retrieve Order authenticated).");
  console.log("No card data, no capture, no Replicate/R2/worker call was made.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`UNEXPECTED ERROR: ${error instanceof Error ? error.message : "unknown"}`);
    process.exit(2);
  });
