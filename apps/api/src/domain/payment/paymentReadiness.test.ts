import { computeOrderPaymentReasons, type OrderPaymentReadinessInput } from "./paymentReadiness";

function expectEmpty(name: string, reasons: string[]) {
  if (reasons.length !== 0) {
    throw new Error(`${name}: expected no blocking reasons, got ${JSON.stringify(reasons)}`);
  }
}

function expectBlocked(name: string, reasons: string[]) {
  if (reasons.length === 0) {
    throw new Error(`${name}: expected at least one blocking reason, got none`);
  }
}

const baseOrder: OrderPaymentReadinessInput = {
  type: "RESTORATION_DIGITAL",
  market: "PAKISTAN",
  currency: "PKR",
  status: "CREATED",
  totalAmountMinor: 25000n,
  items: [{ pricingSource: "approved_live", pricingApproved: true }],
  existingAttemptStatus: null,
  priceBookVersion: "PB-TEST-v1",
  priceBookApprovalReference: "OWNER-TEST-REF"
};

// 1. A fully eligible order (hypothetical owner-approved pricing) is ready.
expectEmpty("eligible order", computeOrderPaymentReasons(baseOrder));

// 2. local_fixture / unapproved pricing is always blocked (gates #3 and #4).
expectBlocked(
  "local_fixture pricing blocked",
  computeOrderPaymentReasons({ ...baseOrder, items: [{ pricingSource: "local_fixture", pricingApproved: false }] })
);
expectBlocked(
  "unapproved pricing blocked regardless of source label",
  computeOrderPaymentReasons({ ...baseOrder, items: [{ pricingSource: "approved_live", pricingApproved: false }] })
);

// 3. Add-on order types are not eligible in this packet.
expectBlocked("DIGITAL_UPGRADE not eligible", computeOrderPaymentReasons({ ...baseOrder, type: "DIGITAL_UPGRADE" }));
expectBlocked("PRINT_ADD_ON not eligible", computeOrderPaymentReasons({ ...baseOrder, type: "PRINT_ADD_ON" }));

// 4. Terminal/blocked order statuses reject payment.
for (const status of ["PAYMENT_VERIFIED", "LOCKED", "CANCELLED", "EXPIRED"] as const) {
  expectBlocked(`order status ${status} blocked`, computeOrderPaymentReasons({ ...baseOrder, status }));
}
expectEmpty("order status CREATED allowed", computeOrderPaymentReasons({ ...baseOrder, status: "CREATED" }));
expectEmpty("order status PAYMENT_PENDING allowed", computeOrderPaymentReasons({ ...baseOrder, status: "PAYMENT_PENDING" }));

// 5. Already-paid/cancelled/terminal payment attempts reject a new/repeated attempt.
for (const attemptStatus of ["PAID", "REFUNDED", "DISPUTED", "CHARGEBACK", "CANCELLED", "CANCELLED_BY_CUSTOMER", "EXPIRED"]) {
  expectBlocked(
    `existing attempt ${attemptStatus} blocks further payment`,
    computeOrderPaymentReasons({ ...baseOrder, existingAttemptStatus: attemptStatus })
  );
}
expectEmpty(
  "existing attempt CREATED does not itself block readiness",
  computeOrderPaymentReasons({ ...baseOrder, existingAttemptStatus: "CREATED" })
);

// 6. Invalid market/currency pairing is blocked.
expectBlocked(
  "PAKISTAN with USD blocked",
  computeOrderPaymentReasons({ ...baseOrder, market: "PAKISTAN", currency: "USD" })
);
expectBlocked(
  "INTERNATIONAL with PKR blocked",
  computeOrderPaymentReasons({ ...baseOrder, market: "INTERNATIONAL", currency: "PKR" })
);

// 7. Non-positive amounts are blocked.
expectBlocked("zero amount blocked", computeOrderPaymentReasons({ ...baseOrder, totalAmountMinor: 0n }));
expectBlocked("negative amount blocked", computeOrderPaymentReasons({ ...baseOrder, totalAmountMinor: -1n }));

// 8. An order with no line items is blocked.
expectBlocked("no items blocked", computeOrderPaymentReasons({ ...baseOrder, items: [] }));

// 9. R9.2-P1C-B: an approved item with a missing/incomplete PriceBook
// snapshot is a corrupt state and must fail closed, not be trusted.
expectBlocked(
  "approved item missing priceBookVersion blocked",
  computeOrderPaymentReasons({ ...baseOrder, priceBookVersion: null })
);
expectBlocked(
  "approved item missing priceBookApprovalReference blocked",
  computeOrderPaymentReasons({ ...baseOrder, priceBookApprovalReference: null })
);
expectEmpty(
  "unapproved item with no snapshot is blocked only by the unapproved-pricing reason, not doubly",
  (() => {
    const reasons = computeOrderPaymentReasons({
      ...baseOrder,
      items: [{ pricingSource: "local_fixture", pricingApproved: false }],
      priceBookVersion: null,
      priceBookApprovalReference: null
    });
    // Exactly the unapproved-pricing reason, not an extra "missing snapshot"
    // reason -- the snapshot-integrity check only applies when an item
    // actually claims pricingApproved:true.
    return reasons.length === 1 ? [] : reasons;
  })()
);

console.log("paymentReadiness.test.ts: all checks passed");
