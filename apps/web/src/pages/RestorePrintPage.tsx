// Truthful restore-print page.
//
// Print fulfillment is only offered from a REAL completed restoration result,
// and only after a real payment/checkout provider is active. There is no
// authoritative print-catalog pricing API on this baseline, so this page never
// invents PKR amounts and never shows a fake "Continue" checkout. It surfaces
// the restored result (when truly completed) with a truthful
// PRINT_CHECKOUT_PENDING status and points to /pricing for authoritative
// pricing. Mount/refresh are GET-only — this page never triggers processing.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";
import type { LegacyRestorationOrderResponse } from "../lib/portal-types";

export function RestorePrintPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<LegacyRestorationOrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    if (!orderId) {
      setLoading(false);
      return;
    }
    const guestToken = getGuestOwnershipToken(orderId);
    void customerApi
      .getLegacyRestorationOrder(token || undefined, orderId, undefined, guestToken || undefined)
      .then((data) => {
        if (!disposed) setOrder(data);
      })
      .catch((err) => {
        if (!disposed) setError(err instanceof Error ? err.message : "Unable to load the restoration result");
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [orderId, token]);

  if (loading) {
    return <section className="page-stack"><div className="state-panel"><p>Loading restoration result...</p></div></section>;
  }

  if (error || !order) {
    return (
      <section className="page-stack">
        <div className="state-panel state-panel-error"><p>{error || "Restoration result not found"}</p></div>
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <Link className="button button-secondary" to="/restore">Back to Restorations</Link>
          <Link className="button" to="/pricing">View Current Pricing</Link>
        </div>
      </section>
    );
  }

  const completedItem = order.items.find((item) => item.status === "COMPLETED" && item.finalUrl);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Step 3 · Print</p>
        <h1>Print your restored memory.</h1>
        <p>Print fulfillment is pending checkout. Payment is not collected on this screen.</p>
      </div>

      {completedItem ? (
        <>
          <div className="state-panel">
            <p>Restoration complete for this item. Print fulfillment status: <strong>PRINT_CHECKOUT_PENDING</strong>.</p>
          </div>
          <div className="download-preview">
            <img className="restored-image" src={completedItem.finalUrl || undefined} alt="Restored result" />
          </div>
          <p className="helper-text">Authoritative print pricing is available on the pricing page.</p>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <Link className="button button-secondary" to={`/restore/${orderId}`}>Back to Result</Link>
            <Link className="button" to="/pricing">View Current Pricing</Link>
          </div>
        </>
      ) : (
        <div className="state-panel state-panel-error">
          <p>There is no completed restoration result to print yet.</p>
        </div>
      )}
    </section>
  );
}
