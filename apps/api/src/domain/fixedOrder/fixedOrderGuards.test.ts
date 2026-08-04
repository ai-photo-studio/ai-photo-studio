import {
  ALLOWED_FIXED_ORDER_TYPES,
  FixedOrderDomainError,
  assertAllowedOrderType,
  assertFirstRestorationExecutionEligible,
  assertFixedOrderMutationAllowed,
  assertSecondPaymentNotAllowed,
  computeReplicateExecutionIdempotencyKey,
  validateAddOnRelation,
  validateIntegerMinorAmount,
  validateMarketCurrencyPair,
  validateOneCallExecutionClaim
} from "./fixedOrderGuards";

function expectThrows(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    if (err instanceof FixedOrderDomainError) return;
    throw new Error(`${name}: expected FixedOrderDomainError, got ${(err as Error).message}`);
  }
  throw new Error(`${name}: expected to throw, but it did not`);
}

function expectOk(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    throw new Error(`${name}: expected no throw, got ${(err as Error).message}`);
  }
}

// 1. Pakistan order cannot use USD.
expectThrows("PK order with USD", () => validateMarketCurrencyPair("PAKISTAN", "USD"));

// 2. International order cannot use PKR.
expectThrows("INTL order with PKR", () => validateMarketCurrencyPair("INTERNATIONAL", "PKR"));

// Valid pairs are accepted.
expectOk("PK order with PKR", () => validateMarketCurrencyPair("PAKISTAN", "PKR"));
expectOk("INTL order with USD", () => validateMarketCurrencyPair("INTERNATIONAL", "USD"));

// 3. Negative, fractional, or unsafe minor-unit amounts are rejected.
expectThrows("negative amount", () => validateIntegerMinorAmount(-100));
expectThrows("fractional amount", () => validateIntegerMinorAmount(100.5));
expectThrows("unsafe integer amount", () => validateIntegerMinorAmount(Number.MAX_SAFE_INTEGER + 10));
expectThrows("non-finite amount", () => validateIntegerMinorAmount(Number.POSITIVE_INFINITY));
expectThrows("negative bigint amount", () => validateIntegerMinorAmount(-1n));
expectOk("zero amount", () => validateIntegerMinorAmount(0));
expectOk("valid integer amount", () => validateIntegerMinorAmount(150000));
expectOk("valid bigint amount", () => validateIntegerMinorAmount(150000n));

// allowed order types
for (const type of ALLOWED_FIXED_ORDER_TYPES) {
  expectOk(`allowed order type ${type}`, () => assertAllowedOrderType(type));
}
expectThrows("unknown order type", () => assertAllowedOrderType("GENERAL_CART"));

// 4. A FixedOrder cannot be repriced or edited after creation.
expectThrows("mutate immutable order", () =>
  assertFixedOrderMutationAllowed({ immutableAt: new Date(), status: "LOCKED" })
);

// 5. A FixedOrder cannot receive a second payment lifecycle.
expectOk("first payment allowed", () =>
  assertSecondPaymentNotAllowed({ hasExistingPaymentAttempt: false })
);
expectThrows("second payment rejected", () =>
  assertSecondPaymentNotAllowed({ hasExistingPaymentAttempt: true })
);

// 6. One original order cannot create two restoration masters (modeled as:
// one restoration entitlement per order; RestorationMaster is unique-per-entitlement in schema).
expectOk("first entitlement allowed", () =>
  assertFirstRestorationExecutionEligible("RESTORATION_DIGITAL", { existingEntitlementId: null })
);
expectThrows("second entitlement rejected", () =>
  assertFirstRestorationExecutionEligible("RESTORATION_DIGITAL", {
    existingEntitlementId: "existing-entitlement-id"
  })
);

// 7. One master cannot create two Replicate executions / 8. Duplicate
// idempotency keys are rejected or safely reused.
const masterId = "master-123";
const key = computeReplicateExecutionIdempotencyKey(masterId);
expectOk("new claim allowed", () => validateOneCallExecutionClaim(masterId, null));
expectOk("same key reused idempotently", () =>
  validateOneCallExecutionClaim(masterId, { restorationMasterId: masterId, idempotencyKey: key })
);
expectThrows("different execution for same master rejected", () =>
  validateOneCallExecutionClaim(masterId, {
    restorationMasterId: masterId,
    idempotencyKey: "restoration-execution:some-other-master"
  })
);
{
  const result = validateOneCallExecutionClaim(masterId, null);
  if (!result.isNewClaim) throw new Error("expected isNewClaim=true for a fresh master");
  const reused = validateOneCallExecutionClaim(masterId, {
    restorationMasterId: masterId,
    idempotencyKey: result.key
  });
  if (reused.isNewClaim) throw new Error("expected isNewClaim=false when reusing an existing claim");
  if (reused.key !== result.key) throw new Error("expected the deterministic key to be stable");
}

// 9. DIGITAL_UPGRADE cannot create a ReplicateExecution.
expectThrows("digital upgrade not first-restoration eligible", () =>
  assertFirstRestorationExecutionEligible("DIGITAL_UPGRADE", { existingEntitlementId: null })
);

// 10. PRINT_ADD_ON cannot create a ReplicateExecution.
expectThrows("print add-on not first-restoration eligible", () =>
  assertFirstRestorationExecutionEligible("PRINT_ADD_ON", { existingEntitlementId: null })
);

// 11. Add-on order must reference a completed, valid original restoration/master.
expectOk("digital upgrade against validated master", () =>
  validateAddOnRelation("DIGITAL_UPGRADE", { status: "VALIDATED" })
);
expectOk("print add-on against validated master", () =>
  validateAddOnRelation("PRINT_ADD_ON", { status: "VALIDATED" })
);
expectThrows("digital upgrade against unvalidated master", () =>
  validateAddOnRelation("DIGITAL_UPGRADE", { status: "PROCESSING" })
);
expectThrows("print add-on against not-started master", () =>
  validateAddOnRelation("PRINT_ADD_ON", { status: "NOT_STARTED" })
);
expectThrows("restoration order type is not an add-on type", () =>
  validateAddOnRelation("RESTORATION_DIGITAL", { status: "VALIDATED" })
);

console.log("fixed order domain guard tests passed");
