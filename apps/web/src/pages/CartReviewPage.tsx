// R9.5-P5Q-MULTI-IMAGE-UI-CART: review/payment/processing/result for a
// multi-item cart order, all as progressive sections of one page -- the
// exact same proven architecture as the single-image FixedOrderReviewPage
// (payment stays fail-closed/truthful, TEST payment stays triple-guarded,
// polling stays GET-only), generalized to N items instead of one. The
// single-image page/route is completely untouched.
const PAYMENT_UNAVAILABLE_MESSAGE = "Online payment is temporarily unavailable.";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi, type FixedOrderCartSummary } from "../services/customerApi";

const TIER_LABELS: Record<string, string> = { ORIGINAL: "Restored Original", HD_2X: "2x HD", HD_4X: "4x Ultra HD", HD_6X: "6x", HD_8X: "8x", HD_10X: "10x", HD_12X: "12x" };

type ItemStatus = {
  fixedOrderItemId: string;
  tier: string | null;
  isPrint: boolean;
  executionStatus: string | null;
  downloadAvailable: boolean;
  downloadUrl: string | null;
  printStatus: "IN_HOUSE_PRINT_PENDING" | null;
};

export function CartReviewPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<FixedOrderCartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paymentProviderUnavailable, setPaymentProviderUnavailable] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testPaymentBusy, setTestPaymentBusy] = useState(false);
  const [itemStatuses, setItemStatuses] = useState<ItemStatus[]>([]);
  const [printPrepared, setPrintPrepared] = useState(false);
  const printPreparationStarted = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(orderNo);
      const data = await customerApi.getRestorationCart(token || undefined, orderNo, guestToken || undefined);
      if (!mounted.current) return;
      setOrder(data);
      if (data.paymentStatus) setPaymentStatus(data.paymentStatus);
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
        if (providerUnavailable) setPaymentProviderUnavailable(true);
      }
    } finally {
      if (mounted.current) setCheckoutBusy(false);
    }
  };

  const pollAllItemsStatus = useCallback(async () => {
    if (!orderNo) return;
    const guestToken = getGuestOwnershipToken(orderNo);
    try {
      const statuses = await customerApi.getAllItemsRestorationStatus(token || undefined, orderNo, guestToken || undefined);
      if (mounted.current) setItemStatuses(statuses);
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
      await pollAllItemsStatus();
    } catch (err) {
      if (mounted.current) setCheckoutError(err instanceof Error ? err.message : "Unable to complete the test payment");
    } finally {
      if (mounted.current) setTestPaymentBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    void customerApi
      .getE2ETestModeStatus()
      .then((result) => { if (mounted.current) setTestModeEnabled(result.enabled === true); })
      .catch(() => { if (mounted.current) setTestModeEnabled(false); });
    return () => { mounted.current = false; };
  }, [load]);

  const allDownloaded = itemStatuses.length > 0 && itemStatuses.every((item) => item.downloadAvailable);

  useEffect(() => {
    if (paymentStatus !== "PAID" || allDownloaded) return;
    const interval = setInterval(() => { void pollAllItemsStatus(); }, 1500);
    return () => clearInterval(interval);
  }, [paymentStatus, allDownloaded, pollAllItemsStatus]);

  useEffect(() => {
    if (!orderNo || !order || printPreparationStarted.current) return;
    const anyPrint = order.items.some((item) => item.product === "PRINT_DIGITAL");
    if (!anyPrint || !allDownloaded) return;
    printPreparationStarted.current = true;
    const guestToken = getGuestOwnershipToken(orderNo);
    void customerApi.prepareAllPrintFulfilment(token || undefined, orderNo, guestToken || undefined)
      .then(() => { if (mounted.current) setPrintPrepared(true); })
      .catch((err) => {
        printPreparationStarted.current = false;
        if (mounted.current) setCheckoutError(err instanceof Error ? err.message : "Unable to prepare print fulfilment");
      });
  }, [orderNo, order, allDownloaded, token]);

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading order...</p></div></section>;
  if (error || !order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error || "Order not found"}</p></div></section>;

  const restorationMajor = (Number(order.restorationTotalMinor) / 100).toFixed(2);
  const printMajor = (Number(order.printTotalMinor) / 100).toFixed(2);
  const deliveryMajor = (Number(order.deliveryAmountMinor) / 100).toFixed(2);
  const totalMajor = (Number(order.totalAmountMinor) / 100).toFixed(2);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Review &amp; Checkout</p>
        <h1>Review your order</h1>
        <p>Order {order.orderNo}. {order.items.length} photos. Pricing is locked by the server and refresh is read-only.</p>
      </div>

      {order.items.map((item, index) => {
        const status = itemStatuses.find((s) => s.fixedOrderItemId === item.fixedOrderItemId);
        return (
          <div className="card" key={item.fixedOrderItemId} style={{ marginBottom: "1rem" }}>
            <p className="eyebrow">Photo {index + 1} of {order.items.length}</p>
            <dl className="order-summary">
              <div><dt>Restoration quality</dt><dd>{TIER_LABELS[item.tier] || item.tier}</dd></div>
              <div><dt>Delivery</dt><dd>{item.product === "PRINT_DIGITAL" ? "Print + Digital" : "Digital Download"}</dd></div>
              <div><dt>Restoration price</dt><dd>{order.currency} {(Number(item.digitalAmountMinor) / 100).toFixed(2)}</dd></div>
              {item.print && <div><dt>Print size</dt><dd>{item.print.size}</dd></div>}
              {item.print && <div><dt>Quantity</dt><dd>{item.print.quantity}</dd></div>}
              {item.print && <div><dt>Print subtotal</dt><dd>{order.currency} {(Number(item.print.subtotalMinor) / 100).toFixed(2)}</dd></div>}
              <div><dt><strong>Line total</strong></dt><dd><strong>{order.currency} {(Number(item.lineTotalMinor) / 100).toFixed(2)}</strong></dd></div>
            </dl>

            {paymentStatus === "PAID" && (
              <div className="state-panel" data-testid={`item-processing-status-${index}`}>
                {status?.downloadAvailable ? (
                  <>
                    <p><strong>Completed</strong></p>
                    {status.downloadUrl && <a className="button" href={status.downloadUrl} data-testid={`e2e-download-link-${index}`}>Download</a>}
                    {item.product === "PRINT_DIGITAL" && (status.printStatus === "IN_HOUSE_PRINT_PENDING" || printPrepared) && (
                      <p data-testid={`print-status-${index}`}>Preparing for printing</p>
                    )}
                  </>
                ) : (
                  <p>Processing... ({status?.executionStatus || "QUEUED"})</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <dl className="order-summary">
          <div><dt>Restoration total</dt><dd>{order.currency} {restorationMajor}</dd></div>
          <div><dt>Print total</dt><dd>{order.currency} {printMajor}</dd></div>
          <div><dt>Delivery</dt><dd>{order.currency} {deliveryMajor}</dd></div>
          <div><dt><strong>TOTAL</strong></dt><dd><strong>{order.currency} {totalMajor}</strong></dd></div>
        </dl>
        <p className="helper-text">PriceBook: {order.priceBookVersion || "-"}</p>
      </div>

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
          {checkoutBusy ? "Starting checkout..." : paymentProviderUnavailable ? "Payment unavailable" : "Pay 100% & Restore Photos"}
        </button>
        <button type="button" className="button button-secondary" onClick={() => void refreshPaymentStatus()}>Check payment status</button>
        <button type="button" aria-label="Refresh order" className="button button-secondary" onClick={() => void load()}>Refresh</button>
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
    </section>
  );
}
