// R9.2-P6C-CUSTOMER-MVP-FLOW: review the immutable FixedOrder. Read-only on
// mount and on refresh -- issues a GET only, never a write, never creates a
// PaymentAttempt. Payment is truthfully reported as blocked while
// BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED remains open -- this
// page never fabricates a "paid"/"success" state, including from a URL
// query parameter (none are read at all).
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi, type FixedOrderSummary } from "../services/customerApi";

const TIER_LABELS: Record<string, string> = { ORIGINAL: "Original", HD_2X: "2HD", HD_4X: "4HD" };

export function FixedOrderReviewPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<FixedOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(orderNo);
      const data = await customerApi.getFixedOrder(token || undefined, orderNo, guestToken || undefined);
      if (!mounted.current) return;
      setOrder(data);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to load the order");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [orderNo, token]);

  const refreshPaymentStatus = useCallback(async () => {
    if (!orderNo) return;
    const guestToken = getGuestOwnershipToken(orderNo);
    try {
      const status = await customerApi.getCustomerPaymentStatus(token || undefined, orderNo, guestToken || undefined);
      if (mounted.current) setPaymentStatus(status.status);
    } catch (err) {
      if (mounted.current) setCheckoutError(err instanceof Error ? err.message : "Unable to load payment status");
    }
  }, [orderNo, token]);

  const startCheckout = async () => {
    if (!orderNo || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const guestToken = getGuestOwnershipToken(orderNo);
      const result = await customerApi.createCustomerCheckout(token || undefined, orderNo, guestToken || undefined);
      setPaymentStatus(result.status);
      if (result.sessionId) {
        window.location.assign(`https://test-bankalfalah.gateway.mastercard.com/checkout/pay/${encodeURIComponent(result.sessionId)}`);
      }
    } catch (err) {
      if (mounted.current) {
        const apiError = err as { code?: string; message?: string };
        setCheckoutError(apiError.code === "PAYMENT_PROVIDER_UNAVAILABLE" ? "Payment provider unavailable. Checkout is not enabled yet." : apiError.message || "Unable to start checkout");
      }
    } finally {
      if (mounted.current) setCheckoutBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading order...</p></div></section>;
  if (error || !order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error || "Order not found"}</p></div></section>;

  const amountMajor = (Number(order.totalAmountMinor) / 100).toFixed(2);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Review</p>
        <h1>Order {order.orderNo}</h1>
        <p>Read-only. Refresh never writes.</p>
      </div>

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        <article className="metric-card"><span>Market</span><strong>{order.market}</strong></article>
        <article className="metric-card"><span>Tier</span><strong>{TIER_LABELS[order.tier] || order.tier}</strong></article>
        <article className="metric-card"><span>Amount</span><strong>{order.currency} {amountMajor}</strong></article>
        <article className="metric-card"><span>PriceBook</span><strong>{order.priceBookVersion || "-"}</strong></article>
      </div>

       <div className="state-panel" style={{ marginTop: "1rem" }}>
         <p>{checkoutError || (paymentStatus ? `Payment status: ${paymentStatus}` : "Payment is not yet available until you press Pay. Refresh reads status only.")}</p>
       </div>

       <div className="button-row" style={{ marginTop: "1rem" }}>
         <button type="button" className="button" onClick={() => void startCheckout()} disabled={checkoutBusy}>
           {checkoutBusy ? "Starting checkout..." : "Pay securely"}
         </button>
         <button type="button" className="button button-secondary" onClick={() => void refreshPaymentStatus()}>
           Check payment status
         </button>
         <button type="button" aria-label="Refresh order" className="button button-secondary" onClick={() => void load()}>
           Refresh
         </button>
      </div>
    </section>
  );
}
