import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { fixedOrderApi, paymentAttemptApi } from "../services/customerApi";
import type { FixedOrderRecord, PaymentAttemptRecord, PaymentReadinessResponse } from "../lib/portal-types";
import { ApiError } from "../lib/api";
import { PaymentStatusLabel } from "../components/PaymentStatusLabel";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  HD_2X: "2HD",
  HD_4X: "4HD"
};

const formatMinorAmount = (amountMinor: string, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amountMinor) / 100);

/** Turns a raw blocker reason into a short, customer-facing label. Falls back to the raw reason if none of these match -- never hides a blocker. */
function describeReason(reason: string): string {
  if (/pricing source/i.test(reason) || /not owner-approved/i.test(reason)) {
    return "Pricing for this order has not been approved for payment yet.";
  }
  if (/provider unavailable/i.test(reason)) {
    return "The payment provider is not yet configured for this order.";
  }
  if (/order status/i.test(reason)) {
    return "This order is not in a state that allows payment.";
  }
  if (/payment attempt is already/i.test(reason)) {
    return "This order's payment has already reached a final state.";
  }
  return reason;
}

const TERMINAL_ATTEMPT_STATUSES = new Set([
  "PAID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "CHARGEBACK",
  "CANCELLED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED"
]);

// R9.2-P1B: locked order review + truthful payment readiness/attempt UI.
// Never shows a fabricated "paid"/"success" state, and never shows a
// checkout URL unless a genuinely ready (mock/test-only, in this packet)
// adapter returned one.
export function FixedOrderReviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const [searchParams] = useSearchParams();
  const orderNo = searchParams.get("orderNo") || "";
  const { token } = useAuth();
  const [order, setOrder] = useState<FixedOrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<PaymentReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<PaymentAttemptRecord | null>(null);
  const [attemptBusy, setAttemptBusy] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);

  const guestToken = draftId ? getGuestOwnershipToken(draftId) || undefined : undefined;

  const loadReadinessAndAttempt = useCallback(async () => {
    if (!orderNo) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const [readinessResult, attemptResult] = await Promise.all([
        paymentAttemptApi.getReadiness(orderNo, token || undefined, guestToken),
        paymentAttemptApi.getAttempt(orderNo, token || undefined, guestToken)
      ]);
      setReadiness(readinessResult);
      setAttempt(attemptResult);
    } catch {
      setReadinessError("Unable to check payment readiness right now.");
    } finally {
      setReadinessLoading(false);
    }
  }, [orderNo, token, guestToken]);

  useEffect(() => {
    if (!orderNo || !draftId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fixedOrderApi.getOrder(orderNo, token || undefined, guestToken);
        if (!cancelled) setOrder(result);
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiError && loadError.status === 404) {
          setError("This order could not be found, or you do not have access to it.");
        } else {
          setError("Unable to load your order right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo, draftId, token]);

  useEffect(() => {
    if (!order) return;
    void loadReadinessAndAttempt();
  }, [order, loadReadinessAndAttempt]);

  const startPayment = async () => {
    if (!orderNo) return;
    setAttemptBusy(true);
    setAttemptError(null);
    try {
      const result = await paymentAttemptApi.createAttempt(orderNo, token || undefined, guestToken);
      setAttempt(result);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 503)) {
        setAttemptError(err.message);
        // A blocker may have changed between the readiness check and this
        // request (e.g. a concurrent cancellation) -- refresh to stay truthful.
        void loadReadinessAndAttempt();
      } else if (err instanceof ApiError && err.status === 502) {
        setAttemptError("The payment provider could not be reached. Please try again.");
        void loadReadinessAndAttempt();
      } else {
        setAttemptError("Unable to start payment right now. Please try again.");
      }
    } finally {
      setAttemptBusy(false);
    }
  };

  if (!orderNo) {
    return (
      <section className="page-stack">
        <div className="state-panel state-panel-error">
          <p>No order reference was provided.</p>
          <div className="button-row" style={{ marginTop: "1rem", justifyContent: "center" }}>
            <Link to="/restore/new" className="button">Start a New Restoration</Link>
          </div>
        </div>
      </section>
    );
  }

  const canPay = Boolean(readiness?.ready) && !attemptBusy && (!attempt || attempt.status === "CREATED" || attempt.status === "FAILED");
  const showRetry = attempt?.status === "FAILED";
  const isTerminal = attempt ? TERMINAL_ATTEMPT_STATUSES.has(attempt.status) : false;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Order Review</h1>
        <p>Your order is locked and cannot be edited, repriced, or added to.</p>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading your order...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : order ? (
        <>
          <div className="card" style={{ maxWidth: 480 }}>
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">{order.orderNo}</p>
              <h2>{order.items[0] ? TIER_LABELS[order.items[0].tierOrSku || ""] || order.items[0].tierOrSku : "Digital Restoration"}</h2>
            </div>
            <dl className="detail-grid">
              <div><dt>Market</dt><dd>{order.market === "PAKISTAN" ? "Pakistan" : "International"}</dd></div>
              <div><dt>Currency</dt><dd>{order.currency}</dd></div>
              <div><dt>Total</dt><dd>{formatMinorAmount(order.totalAmountMinor, order.currency)}</dd></div>
              <div><dt>Status</dt><dd>{order.status}</dd></div>
              {order.priceBookVersion ? (
                <div><dt>Price list version</dt><dd>{order.priceBookVersion}</dd></div>
              ) : null}
              <div>
                <dt>Pricing state</dt>
                <dd>
                  {order.items.every((item) => item.pricingApproved) ? (
                    <span data-testid="pricing-state-approved">Approved pricing</span>
                  ) : (
                    <span data-testid="pricing-state-unapproved">
                      Not yet approved for payment (source: {order.items[0]?.pricingSource ?? "unknown"})
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="small text-muted" style={{ marginTop: "1rem" }}>
              This order became immutable the moment it was created: no line changes, repricing, or currency changes are possible.
            </p>
          </div>

          <div className="card" style={{ maxWidth: 480, marginTop: "1rem" }} data-testid="payment-panel">
            <div className="section-heading section-heading-tight">
              <h2>Payment</h2>
            </div>

            {readinessLoading ? (
              <div className="state-panel" role="status" aria-live="polite"><p>Checking payment readiness...</p></div>
            ) : readinessError ? (
              <div className="state-panel state-panel-error" role="alert">
                <p>{readinessError}</p>
                <div className="button-row" style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="button" onClick={() => void loadReadinessAndAttempt()}>
                    Retry
                  </button>
                </div>
              </div>
            ) : readiness && !readiness.ready && !attempt ? (
              <div className="state-panel state-panel-warning" role="status" aria-live="polite" data-testid="payment-blocked">
                <p>Payment is not available for this order yet.</p>
                <ul style={{ marginTop: "0.5rem" }} aria-label="Reasons payment is blocked">
                  {readiness.reasons.map((reason) => (
                    <li key={reason}>{describeReason(reason)}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {attempt && isTerminal ? (
              <div className="state-panel" role="status" aria-live="polite" data-testid="attempt-status">
                <p>Payment status: <PaymentStatusLabel status={attempt.status} /></p>
              </div>
            ) : attempt && attempt.status === "REDIRECT_READY" ? (
              <div className="state-panel" role="status" aria-live="polite" data-testid="attempt-status">
                <p>A payment session is ready. <PaymentStatusLabel status={attempt.status} /></p>
                {attempt.checkoutUrl ? (
                  <p style={{ marginTop: "0.5rem" }}>
                    <a href={attempt.checkoutUrl} target="_blank" rel="noreferrer">Continue to payment</a>
                  </p>
                ) : null}
              </div>
            ) : showRetry ? (
              <div className="state-panel state-panel-error" role="alert">
                <p>{attemptError || "Payment could not be started."}</p>
              </div>
            ) : attemptError ? (
              <div className="state-panel state-panel-error" role="alert">
                <p>{attemptError}</p>
              </div>
            ) : !attempt && readiness?.ready && !readinessLoading && !readinessError ? (
              <div className="state-panel" role="status" aria-live="polite" data-testid="attempt-status">
                <p>No payment attempt has been started yet.</p>
              </div>
            ) : null}

            <div className="button-row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="button"
                disabled={!canPay}
                title={readiness && !readiness.ready ? readiness.reasons.map(describeReason).join("; ") : undefined}
                onClick={() => void startPayment()}
              >
                {attemptBusy ? "Starting payment..." : showRetry ? "Retry Payment" : "Pay Now"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
