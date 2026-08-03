import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/format";
import type { CustomerFixedOrderListItem } from "../lib/portal-types";
import { customerFixedOrdersApi } from "../services/customerApi";
import { getPaymentStatusPresentation } from "./PaymentStatusLabel";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  HD_2X: "2HD",
  HD_4X: "4HD"
};

const formatMinorAmount = (amountMinor: string, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      Number(amountMinor) / 100
    );
  } catch {
    return `${amountMinor} ${currency}`;
  }
};

function paymentAttemptLabel(order: CustomerFixedOrderListItem): string {
  if (!order.paymentAttempt) return "No payment attempt yet";
  return `Payment: ${order.paymentAttempt.status}`;
}

/**
 * Shared presentation-only classification (never a new status/enum) used
 * only to drive the accessible name -- the visible text above is
 * preserved unchanged so existing regression coverage keeps matching it.
 */
function paymentAttemptAriaLabel(order: CustomerFixedOrderListItem): string {
  return getPaymentStatusPresentation(order.paymentAttempt?.status ?? null).ariaLabel;
}

/**
 * R9.2-P2R-ADMIN-READINESS-REFINEMENT: an order counts as approved-priced only
 * when EVERY line is owner-approved -- matching `FixedOrderReviewPage`'s
 * `items.every(...)` rule. The previous `.some(...)` form could label a mixed
 * order (one approved line + one `local_fixture` line) as "Owner-approved
 * pricing" even though the fixture line keeps the order payment-blocked.
 * An order with no lines is never presented as approved.
 */
function pricingIndicator(order: CustomerFixedOrderListItem): { label: string; approved: boolean } {
  const allApproved = order.items.length > 0 && order.items.every((item) => item.pricingApproved);
  return allApproved
    ? { label: "Owner-approved pricing", approved: true }
    : { label: "Fixture pricing (not payment-eligible)", approved: false };
}

/**
 * R9.2-P2R-CUSTOMER-ORDERS: new, additive "Restoration Orders" section for
 * the existing (now-authenticated) OrdersPage. GET-only on mount -- never
 * creates a PaymentAttempt or any other write. Never derives a PAID/approved
 * state from a URL query parameter; every value shown here comes from the
 * server response for this render.
 */
export function RestorationOrdersHistorySection({ token }: { token: string }) {
  const [items, setItems] = useState<CustomerFixedOrderListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerFixedOrdersApi.list(token, { pageSize: 20 });
      setItems(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your restoration orders");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <article className="card stack" aria-labelledby="restoration-orders-heading">
      <div className="section-heading section-heading-tight">
        <p className="eyebrow">Restoration orders</p>
        <h2 id="restoration-orders-heading">Your restoration orders</h2>
      </div>

      {loading && (
        <p className="helper-text" role="status" aria-live="polite">
          Loading your restoration orders...
        </p>
      )}

      {!loading && error && (
        <div className="state-panel state-panel-error" role="alert">
          <p>{error}</p>
          <button type="button" className="button button-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && items && items.length === 0 && (
        <p className="helper-text">You have no restoration orders yet.</p>
      )}

      {!loading && !error && items && items.length > 0 && (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((order) => {
            const tier = order.items[0]?.tierOrSku ? TIER_LABELS[order.items[0].tierOrSku] || order.items[0].tierOrSku : "—";
            const pricing = pricingIndicator(order);
            return (
              <li key={order.orderNo} className="card" style={{ marginBottom: "0.75rem" }}>
                <div className="detail-grid">
                  <div>
                    <dt>Order</dt>
                    <dd>{order.orderNo}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{formatDateTime(order.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{order.status}</dd>
                  </div>
                  <div>
                    <dt>Tier</dt>
                    <dd>{tier}</dd>
                  </div>
                  {/*
                    R9.2-P2R-ADMIN-READINESS-REFINEMENT: market and the immutable
                    PriceBook snapshot version are already returned by
                    `GET /api/fixed-orders` (`CustomerFixedOrderListItem`) and are
                    shown on the order-review and admin surfaces; they are shown
                    here too so the same immutable order facts read consistently
                    across every page. Display only -- no new API field, no
                    client-side recomputation.
                  */}
                  <div>
                    <dt>Market</dt>
                    <dd data-testid="history-order-market">
                      {order.market === "PAKISTAN" ? "Pakistan" : "International"}
                    </dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>{formatMinorAmount(order.totalAmountMinor, order.currency)}</dd>
                  </div>
                  <div>
                    <dt>Price list version</dt>
                    <dd data-testid="history-order-pricebook-version">{order.priceBookVersion ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Pricing</dt>
                    <dd data-testid={pricing.approved ? "history-pricing-approved" : "history-pricing-unapproved"}>
                      {pricing.label}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd aria-label={paymentAttemptAriaLabel(order)}>{paymentAttemptLabel(order)}</dd>
                  </div>
                </div>
                <div className="button-row" style={{ marginTop: "0.75rem" }}>
                  <Link
                    className="text-link"
                    to={`/restore/drafts/account/review?orderNo=${encodeURIComponent(order.orderNo)}`}
                  >
                    View order
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
