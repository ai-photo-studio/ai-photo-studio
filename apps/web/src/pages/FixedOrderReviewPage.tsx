// R9.2-P6C-CUSTOMER-MVP-FLOW: review the immutable FixedOrder. Read-only on
// mount and on refresh -- issues a GET only, never a write, never creates a
// PaymentAttempt. Payment is truthfully reported as blocked while
// BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED remains open -- this
// page never fabricates a "paid"/"success" state, including from a URL
// query parameter (none are read at all).
//
// R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG: MPGS is commercially frozen
// (MPGS_COMMERCIAL_HOLD) and no payment provider is implemented in its
// place yet. This page must never invent a bank-transfer/COD/JazzCash/
// RAAST flow -- it shows one truthful fail-closed message and nothing else
// until a real provider is implemented and enabled.
const PAYMENT_UNAVAILABLE_MESSAGE = "Online payment is temporarily unavailable.";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi, type FixedOrderSummary } from "../services/customerApi";

const TIER_LABELS: Record<string, string> = { ORIGINAL: "Restored Original", HD_2X: "2x HD", HD_4X: "4x Ultra HD", HD_6X: "6x", HD_8X: "8x", HD_10X: "10x", HD_12X: "12x" };

export function FixedOrderReviewPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<FixedOrderSummary | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paymentProviderUnavailable, setPaymentProviderUnavailable] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  // R9.5-P4B7B: never inferred from Vite/browser env -- true only after the
  // server itself confirms the test-checkout seam is mounted (see
  // customerApi.getE2ETestModeStatus). Absent/404/error all resolve to
  // false, so this is fail-closed identically to production.
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testPaymentBusy, setTestPaymentBusy] = useState(false);
  const [printFulfilment, setPrintFulfilment] = useState<{ status: string; blocker: string } | null>(null);
  const printPreparationStarted = useRef(false);
  const [restorationStatus, setRestorationStatus] = useState<{
    executionStatus: string | null;
    downloadAvailable: boolean;
    downloadUrl: string | null;
  } | null>(null);
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
      if (data.paymentStatus) setPaymentStatus(data.paymentStatus);
      if (data.sourceDraftId) {
        const draftToken = getGuestOwnershipToken(data.sourceDraftId) || guestToken;
        void customerApi.getRestorationDraft(token || undefined, data.sourceDraftId, draftToken || undefined)
          .then((draft) => { if (mounted.current) setThumbnailUrl(draft.previewUrl); })
          .catch(() => { if (mounted.current) setThumbnailUrl(null); });
      }
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
        const providerUnavailable = apiError.code === "PAYMENT_PROVIDER_UNAVAILABLE";
        setCheckoutError(providerUnavailable ? PAYMENT_UNAVAILABLE_MESSAGE : apiError.message || "Unable to start checkout");
        // The provider is fail-closed for every order while unavailable -- a
        // retry is guaranteed to fail identically, so stop offering it
        // instead of leaving an active button the customer can click again.
        if (providerUnavailable) setPaymentProviderUnavailable(true);
      }
    } finally {
      if (mounted.current) setCheckoutBusy(false);
    }
  };

  const pollRestorationStatus = useCallback(async () => {
    if (!orderNo) return;
    const guestToken = getGuestOwnershipToken(orderNo);
    try {
      const status = await customerApi.getFixedOrderRestorationStatus(token || undefined, orderNo, guestToken || undefined);
      if (mounted.current) {
        setRestorationStatus({
          executionStatus: status.executionStatus,
          downloadAvailable: status.downloadAvailable,
          downloadUrl: status.downloadUrl
        });
      }
    } catch {
      // Restoration has not started yet (e.g. before payment) -- not an error.
    }
  }, [orderNo, token]);

  const completeTestPayment = async () => {
    if (!orderNo || testPaymentBusy) return;
    setTestPaymentBusy(true);
    setCheckoutError(null);
    try {
      const guestToken = getGuestOwnershipToken(orderNo);
      await customerApi.createTestCheckout(token || undefined, orderNo, guestToken || undefined);
      await customerApi.completeTestPayment(token || undefined, orderNo, guestToken || undefined);
      if (mounted.current) setPaymentStatus("PAID");
      await pollRestorationStatus();
    } catch (err) {
      if (mounted.current) setCheckoutError(err instanceof Error ? err.message : "Unable to complete the test payment");
    } finally {
      if (mounted.current) setTestPaymentBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    // Server-authoritative only -- a 404/error here always leaves
    // testModeEnabled at its fail-closed default of false.
    void customerApi
      .getE2ETestModeStatus()
      .then((result) => { if (mounted.current) setTestModeEnabled(result.enabled === true); })
      .catch(() => { if (mounted.current) setTestModeEnabled(false); });
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Once a payment has been confirmed (real or test), poll processing status
  // on a bounded interval until a download is available. Purely read-only.
  useEffect(() => {
    if (paymentStatus !== "PAID" || (restorationStatus && restorationStatus.downloadAvailable)) return;
    const interval = setInterval(() => { void pollRestorationStatus(); }, 1500);
    return () => clearInterval(interval);
  }, [paymentStatus, restorationStatus, pollRestorationStatus]);

  useEffect(() => {
    if (!orderNo || !order?.print || !restorationStatus?.downloadAvailable || printPreparationStarted.current) return;
    printPreparationStarted.current = true;
    const guestToken = getGuestOwnershipToken(orderNo);
    void customerApi.preparePrintFulfilment(token || undefined, orderNo, guestToken || undefined)
      .then((result) => { if (mounted.current) setPrintFulfilment(result); })
      .catch((err) => {
        printPreparationStarted.current = false;
        if (mounted.current) setCheckoutError(err instanceof Error ? err.message : "Unable to prepare print fulfilment");
      });
  }, [orderNo, order, restorationStatus, token]);

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading order...</p></div></section>;
  if (error || !order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error || "Order not found"}</p></div></section>;

  const amountMajor = (Number(order.totalAmountMinor) / 100).toFixed(2);
  const printSubtotalMinor = Number(order.print?.subtotalMinor || 0);
  const deliveryAmountMinor = Number(order.print?.deliveryAmountMinor || 0);
  const digitalAmountMinor = Number(order.totalAmountMinor) - printSubtotalMinor - deliveryAmountMinor;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Review &amp; Checkout</p>
        <h1>Review your restoration</h1>
        <p>Order {order.orderNo}. Pricing is locked by the server and refresh is read-only.</p>
      </div>

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        <article className="metric-card"><span>Market</span><strong>{order.market}</strong></article>
        <article className="metric-card"><span>Product</span><strong>{order.print ? "Print + Digital" : "Restore & Download"}</strong></article>
        <article className="metric-card"><span>Tier</span><strong>{TIER_LABELS[order.tier] || order.tier}</strong></article>
        <article className="metric-card"><span>Total</span><strong>{order.currency} {amountMajor}</strong></article>
        <article className="metric-card"><span>PriceBook</span><strong>{order.priceBookVersion || "-"}</strong></article>
      </div>

      {thumbnailUrl && <div className="card" style={{ marginTop: "1rem" }}><img src={thumbnailUrl} alt="Original photo thumbnail" style={{ display: "block", maxHeight: "220px", maxWidth: "100%", margin: "0 auto", objectFit: "contain" }} /></div>}

      {order.print && <div className="state-panel" style={{ marginTop: "1rem" }}><p><strong>{order.print.size}, quantity {order.print.quantity}</strong></p><p>Digital: {order.currency} {(digitalAmountMinor / 100).toFixed(2)} · Print: {order.currency} {(printSubtotalMinor / 100).toFixed(2)} · Delivery: {order.currency} {(deliveryAmountMinor / 100).toFixed(2)}</p>{order.deliveryAddress && <p>Deliver to: {order.deliveryAddress.recipientName}, {order.deliveryAddress.addressLine1}, {order.deliveryAddress.city}</p>}</div>}

       <div className="state-panel" style={{ marginTop: "1rem" }}>
         <p>{checkoutError || (paymentStatus ? `Payment status: ${paymentStatus}` : PAYMENT_UNAVAILABLE_MESSAGE)}</p>
       </div>

       <div className="button-row" style={{ marginTop: "1rem" }}>
         <button
           type="button"
           className="button"
           onClick={() => void startCheckout()}
           disabled={checkoutBusy || paymentProviderUnavailable}
           aria-disabled={checkoutBusy || paymentProviderUnavailable}
         >
            {checkoutBusy ? "Starting checkout..." : paymentProviderUnavailable ? "Payment unavailable" : "Pay 100% & Restore Photo"}
         </button>
         <button type="button" className="button button-secondary" onClick={() => void refreshPaymentStatus()}>
           Check payment status
         </button>
         <button type="button" aria-label="Refresh order" className="button button-secondary" onClick={() => void load()}>
           Refresh
         </button>
         {paymentStatus !== "PAID" && order.sourceDraftId && (
           <button type="button" className="button button-ghost" onClick={() => navigate(`/restore-mvp/${order.sourceDraftId}/tiers`)}>
             Back to Configure
           </button>
         )}
      </div>

      {testModeEnabled && (
        <div className="state-panel" style={{ marginTop: "1rem", border: "2px dashed var(--accent, #999)" }} data-testid="e2e-test-payment-panel">
          <p><strong>TEST MODE — No real charge</strong></p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              data-testid="e2e-complete-test-payment"
              onClick={() => void completeTestPayment()}
              disabled={testPaymentBusy || paymentStatus === "PAID"}
            >
              {testPaymentBusy ? "Completing TEST payment..." : "Complete TEST Payment"}
            </button>
          </div>
        </div>
      )}

      {paymentStatus === "PAID" && (
        <div className="state-panel" style={{ marginTop: "1rem" }} data-testid="restoration-processing-status">
          {restorationStatus?.downloadAvailable ? (
            <>
              <p><strong>Completed</strong></p>
              {restorationStatus.downloadUrl && (
                <a className="button" href={restorationStatus.downloadUrl} data-testid="e2e-download-link">Download</a>
              )}
            </>
          ) : (
            <p>Processing... ({restorationStatus?.executionStatus || "QUEUED"})</p>
          )}
        </div>
      )}
      {printFulfilment && (
        <div className="state-panel" data-testid="print-fulfilment-status">
          <p><strong>Print order ready for fulfilment</strong></p>
          <p>
            {printFulfilment.blocker === "IN_HOUSE_PRINT_PENDING"
              ? "Preparing for printing"
              : `Status: ${printFulfilment.status}`}
          </p>
        </div>
      )}
    </section>
  );
}
