import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { PaymentStatusLabel } from "../components/PaymentStatusLabel";
import { formatDateTime, formatMoney } from "../lib/format";
import type { AdminCommerceOrderDetail } from "../lib/portal-types";
import { adminApi } from "../services/adminApi";

const formatMinor = (amountMinor: string, currency: string) => formatMoney(Number(amountMinor) / 100, currency);

/**
 * R9.2-P2R-ADMIN: read-only FixedOrder/PriceBook/PaymentAttempt detail.
 *
 * This page issues exactly one GET request and renders it. There is no
 * "mark paid", no retry-provider button, no refund action, and no
 * fulfilment/execution trigger anywhere on it. Bank Alfalah's
 * not-ready state is shown explicitly as "provider unavailable" -- never
 * framed as a payment failure -- because that is exactly what the
 * server-computed payment-readiness reasons say when they include it.
 */
export function AdminCommerceOrderDetailPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const [order, setOrder] = useState<AdminCommerceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    if (!orderNo) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await adminApi.commerceOrderDetail(orderNo);
      setOrder(result);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load this order";
      if (/not found/i.test(message)) {
        setNotFound(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin commerce order</p>
        <h1>{orderNo}</h1>
        <p className="helper-text">Read-only detail view. No control on this page can change payment, entitlement, or fulfilment state.</p>
      </div>

      <div className="button-row">
        <Link to="/admin/commerce-orders" className="button button-small button-secondary">Back to orders</Link>
      </div>

      {loading ? (
        <div className="state-panel" role="status" aria-live="polite"><p>Loading order...</p></div>
      ) : notFound ? (
        <div className="state-panel state-panel-error" role="alert" data-testid="order-not-found">
          <p>This order could not be found.</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error" role="alert">
          <p>{error}</p>
          <div className="button-row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="button" onClick={() => void load()}>Retry</button>
          </div>
        </div>
      ) : order ? (
        <>
          <div className="card">
            <div className="section-heading section-heading-tight">
              <h2>Order</h2>
            </div>
            <dl className="detail-grid">
              <div><dt>Type</dt><dd>{order.type}</dd></div>
              <div><dt>Order status</dt><dd><StatusBadge value={order.status} /></dd></div>
              <div><dt>Market</dt><dd>{order.market}</dd></div>
              <div><dt>Currency</dt><dd>{order.currency}</dd></div>
              <div><dt>Total</dt><dd>{formatMinor(order.totalAmountMinor, order.currency)}</dd></div>
              <div><dt>Created</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
              <div><dt>Updated</dt><dd>{formatDateTime(order.updatedAt)}</dd></div>
            </dl>
          </div>

          <div className="card" data-testid="pricebook-provenance">
            <div className="section-heading section-heading-tight">
              <h2>PriceBook provenance</h2>
            </div>
            <dl className="detail-grid">
              <div><dt>PriceBook version</dt><dd>{order.priceBookVersion ?? "—"}</dd></div>
              <div><dt>Approval reference</dt><dd>{order.priceBookApprovalReference ?? "—"}</dd></div>
              <div><dt>Effective at</dt><dd>{order.priceBookEffectiveAt ? formatDateTime(order.priceBookEffectiveAt) : "—"}</dd></div>
            </dl>
          </div>

          <div className="card">
            <div className="section-heading section-heading-tight">
              <h2>Line items</h2>
            </div>
            <div className="admin-card-grid">
              {order.items.map((item) => (
                <article key={item.id} className="card admin-record-card">
                  <div className="card-top">
                    <div>
                      <p className="eyebrow">{item.kind}</p>
                      <h3>{item.tierOrSku ?? "—"}</h3>
                    </div>
                    <span
                      className="pill"
                      data-testid={item.pricingApproved ? "item-pricing-approved" : "item-pricing-unapproved"}
                    >
                      {item.pricingApproved ? "Approved" : "Not approved"}
                    </span>
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Quantity</dt><dd>{item.quantity}</dd></div>
                    <div><dt>Unit amount</dt><dd>{formatMinor(item.unitAmountMinor, item.currency)}</dd></div>
                    <div><dt>Line total</dt><dd>{formatMinor(item.totalAmountMinor, item.currency)}</dd></div>
                    <div><dt>Pricing source</dt><dd>{item.pricingSource}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </div>

          <div className="card" data-testid="payment-readiness-panel">
            <div className="section-heading section-heading-tight">
              <h2>Payment readiness</h2>
            </div>
            {order.paymentReadiness.ready ? (
              <p role="status" data-testid="payment-ready">Ready for payment.</p>
            ) : (
              <div role="status" aria-live="polite" data-testid="payment-blocked">
                <p>Payment is blocked for this order.</p>
                <ul aria-label="Reasons payment is blocked">
                  {order.paymentReadiness.reasons.map((reason) => (
                    <li key={reason} data-testid={/provider unavailable/i.test(reason) ? "provider-unavailable-reason" : undefined}>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card" data-testid="payment-attempt-panel">
            <div className="section-heading section-heading-tight">
              <h2>Payment attempt</h2>
            </div>
            {order.paymentAttempt ? (
              <dl className="detail-grid" data-testid="payment-attempt-state">
                <div><dt>Attempt id</dt><dd>{order.paymentAttempt.id}</dd></div>
                <div><dt>Status</dt><dd><PaymentStatusLabel status={order.paymentAttempt.status} /></dd></div>
                <div><dt>Provider</dt><dd>{order.paymentAttempt.provider}</dd></div>
                <div><dt>Provider reference</dt><dd>{order.paymentAttempt.providerRef ?? "—"}</dd></div>
              </dl>
            ) : (
              <p data-testid="no-payment-attempt">No payment attempt has been started for this order.</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
