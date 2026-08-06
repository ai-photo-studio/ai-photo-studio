// R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION
//
// /payment/return -- the frontend landing page for the Bank Alfalah local
// APG browser return, once implemented. This page NEVER reads a URL query
// parameter to infer payment success -- it shows exactly one truthful,
// fail-closed message and nothing else. No bank-transfer/COD/JazzCash/
// RAAST flow is implied here.
const PAYMENT_UNAVAILABLE_MESSAGE = "Online payment is temporarily unavailable.";

export function PaymentReturnPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Payment</p>
        <h1>Payment return</h1>
      </div>
      <div className="state-panel">
        <p>{PAYMENT_UNAVAILABLE_MESSAGE}</p>
      </div>
    </section>
  );
}
