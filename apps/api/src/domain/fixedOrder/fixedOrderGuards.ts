// R9.2-P0A pure domain guards for the fixed-order commerce foundation.
//
// These functions validate the invariants required before payment, provider
// dispatch, Sharp variant generation, or fulfilment can be wired up in later
// packets. None of them touch Prisma, the database, Replicate, or R2 -- they
// are pure functions over plain data so they can be unit tested without a
// live database (see fixedOrderGuards.test.ts) and reused unchanged once the
// live services exist. Nothing here is called from any route or service yet.

export type Market = "PAKISTAN" | "INTERNATIONAL";
export type FixedOrderCurrency = "PKR" | "USD";
export type FixedOrderType =
  | "RESTORATION_DIGITAL"
  | "RESTORATION_WITH_PRINT"
  | "DIGITAL_UPGRADE"
  | "PRINT_ADD_ON";

export const ALLOWED_FIXED_ORDER_TYPES: readonly FixedOrderType[] = [
  "RESTORATION_DIGITAL",
  "RESTORATION_WITH_PRINT",
  "DIGITAL_UPGRADE",
  "PRINT_ADD_ON"
];

const FIRST_RESTORATION_ORDER_TYPES: readonly FixedOrderType[] = [
  "RESTORATION_DIGITAL",
  "RESTORATION_WITH_PRINT"
];

const ADD_ON_ORDER_TYPES: readonly FixedOrderType[] = ["DIGITAL_UPGRADE", "PRINT_ADD_ON"];

export class FixedOrderDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixedOrderDomainError";
  }
}

/** Pakistan must charge/display PKR; every other supported market charges/displays USD. No third pairing exists. */
export function validateMarketCurrencyPair(market: Market, currency: FixedOrderCurrency): void {
  const valid =
    (market === "PAKISTAN" && currency === "PKR") ||
    (market === "INTERNATIONAL" && currency === "USD");
  if (!valid) {
    throw new FixedOrderDomainError(
      `invalid market/currency pair: market=${market} currency=${currency}`
    );
  }
}

export function assertAllowedOrderType(type: string): asserts type is FixedOrderType {
  if (!ALLOWED_FIXED_ORDER_TYPES.includes(type as FixedOrderType)) {
    throw new FixedOrderDomainError(`invalid fixed order type: ${type}`);
  }
}

/**
 * Money is always a validated non-negative integer in minor units. Rejects
 * negative amounts, fractional amounts, non-finite values, and values outside
 * `Number.isSafeInteger` range (a `bigint` beyond that range is still valid --
 * only fractional/negative/non-finite values are rejected for bigint input).
 */
export function validateIntegerMinorAmount(amount: number | bigint): void {
  if (typeof amount === "bigint") {
    if (amount < 0n) {
      throw new FixedOrderDomainError(`minor amount must not be negative: ${amount}`);
    }
    return;
  }

  if (!Number.isFinite(amount)) {
    throw new FixedOrderDomainError(`minor amount must be a finite number: ${amount}`);
  }
  if (!Number.isInteger(amount)) {
    throw new FixedOrderDomainError(`minor amount must be an integer, not fractional: ${amount}`);
  }
  if (amount < 0) {
    throw new FixedOrderDomainError(`minor amount must not be negative: ${amount}`);
  }
  if (!Number.isSafeInteger(amount)) {
    throw new FixedOrderDomainError(`minor amount exceeds safe integer range: ${amount}`);
  }
}

export interface ImmutableFixedOrderState {
  immutableAt: Date | string | null;
  status: string;
}

/**
 * A FixedOrder is immutable from the moment it is created (`immutableAt` is
 * always set at creation time, never null, in the schema default). This guard
 * exists so any future mutation attempt (reprice, add line, currency change)
 * has one shared rejection point instead of being re-implemented per route.
 */
export function assertFixedOrderMutationAllowed(order: ImmutableFixedOrderState): void {
  if (order.immutableAt) {
    throw new FixedOrderDomainError(
      "fixed order is immutable after creation: no reprice, line addition, or currency change is permitted"
    );
  }
}

export interface PaymentLifecycleState {
  hasExistingPaymentAttempt: boolean;
}

/** A FixedOrder may create exactly one PaymentAttempt lifecycle; a second attempt is always rejected. */
export function assertSecondPaymentNotAllowed(state: PaymentLifecycleState): void {
  if (state.hasExistingPaymentAttempt) {
    throw new FixedOrderDomainError(
      "fixed order already has a payment attempt lifecycle: a second payment is not permitted"
    );
  }
}

export interface RestorationMasterCompletionState {
  status: "NOT_STARTED" | "PROCESSING" | "VALIDATED" | "FAILED";
}

/**
 * Add-on orders (DIGITAL_UPGRADE, PRINT_ADD_ON) may only be created against a
 * restoration master that has actually completed validation -- never against
 * a queued, in-progress, or failed restoration.
 */
export function validateAddOnRelation(
  addOnType: FixedOrderType,
  master: RestorationMasterCompletionState
): void {
  if (!ADD_ON_ORDER_TYPES.includes(addOnType)) {
    throw new FixedOrderDomainError(
      `${addOnType} is not an add-on order type; expected one of ${ADD_ON_ORDER_TYPES.join(", ")}`
    );
  }
  if (master.status !== "VALIDATED") {
    throw new FixedOrderDomainError(
      `add-on order requires a completed, validated restoration master; master status is ${master.status}`
    );
  }
}

export interface FirstRestorationEligibilityState {
  existingEntitlementId: string | null;
}

/**
 * Only RESTORATION_DIGITAL / RESTORATION_WITH_PRINT orders may ever originate
 * a first restoration entitlement, and only once per order -- DIGITAL_UPGRADE
 * and PRINT_ADD_ON orders can never own a ReplicateExecution because they can
 * never pass this guard.
 */
export function assertFirstRestorationExecutionEligible(
  orderType: FixedOrderType,
  state: FirstRestorationEligibilityState
): void {
  if (!FIRST_RESTORATION_ORDER_TYPES.includes(orderType)) {
    throw new FixedOrderDomainError(
      `${orderType} can never own a first restoration execution; only ${FIRST_RESTORATION_ORDER_TYPES.join(
        ", "
      )} are eligible`
    );
  }
  if (state.existingEntitlementId) {
    throw new FixedOrderDomainError(
      `fixed order ${state.existingEntitlementId} already has a restoration entitlement; a second cannot be created`
    );
  }
}

/**
 * Deterministic idempotency key for the single ReplicateExecution a
 * RestorationMaster may ever own. Deriving it from the master id (itself
 * unique-per-entitlement, unique-per-first-paid-order) means a duplicate
 * payment callback that re-derives the same key can never create a second
 * execution row -- the unique index on `ReplicateExecution.idempotencyKey`
 * (and on `ReplicateExecution.restorationMasterId`) rejects it at the
 * database layer.
 */
export function computeReplicateExecutionIdempotencyKey(restorationMasterId: string): string {
  if (!restorationMasterId) {
    throw new FixedOrderDomainError("restorationMasterId is required to derive an idempotency key");
  }
  return `restoration-execution:${restorationMasterId}`;
}

export interface ExistingExecutionClaim {
  restorationMasterId: string;
  idempotencyKey: string;
}

/**
 * Validates a claim to create/reuse the one ReplicateExecution for a master.
 * If no execution exists yet, the claim is new and safe to insert. If one
 * already exists, the claim is only valid when the idempotency key matches
 * (safe, idempotent reuse of the same job); a mismatched key means something
 * is trying to create a second, different execution for the same master and
 * must be rejected.
 */
export function validateOneCallExecutionClaim(
  restorationMasterId: string,
  existing: ExistingExecutionClaim | null
): { key: string; isNewClaim: boolean } {
  const key = computeReplicateExecutionIdempotencyKey(restorationMasterId);
  if (!existing) {
    return { key, isNewClaim: true };
  }
  if (existing.restorationMasterId !== restorationMasterId || existing.idempotencyKey !== key) {
    throw new FixedOrderDomainError(
      `restoration master ${restorationMasterId} already owns a different execution claim; a second Replicate execution is not permitted`
    );
  }
  return { key, isNewClaim: false };
}
