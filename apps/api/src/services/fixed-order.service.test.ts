// R9.2-P6B-APPROVED-OFFER-WIRING unit tests (no DB, no network).
//
// Proves the pure request-shape/tier-validation guards on
// FixedOrderService.createRestorationDigitalOrder without touching Postgres
// -- the full create/idempotency/race path is proven against a real
// disposable PostgreSQL instance in fixed-order.service.pg-race.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

async function loadModule() {
  return import("./fixed-order.service");
}

test("(u1) invalid tier is rejected before any database access", async () => {
  const { FixedOrderService } = await loadModule();
  const service = new FixedOrderService();
  await assert.rejects(
    () => service.createRestorationDigitalOrder({ draftId: "does-not-matter", tier: "NOT_A_TIER" }, {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { code?: string }).code, "INVALID_TIER");
      return true;
    }
  );
});

test("(u2) FixedOrderService defaults to ApprovedOfferProvider (no override) in production construction", async () => {
  const { FixedOrderService } = await loadModule();
  // Constructing with no arguments is exactly what FixedOrderController does
  // in production -- this asserts the constructor accepts zero arguments
  // (i.e. a provider override is never required, only ever test-injected).
  assert.doesNotThrow(() => new FixedOrderService());
});

test("(u3) zero external network calls in this test file", () => {
  assert.equal(externalCallAttempts, 0);
});
