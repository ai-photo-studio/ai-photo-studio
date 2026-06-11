import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatMoney } from "../lib/format";
import type { CustomerPaymentRecord, CustomerPaymentsResponse } from "../lib/portal-types";
import { customerApi } from "../services/customerApi";

export function PaymentsPage() {
  const { token, status } = useAuth();
  const [data, setData] = useState<CustomerPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [checkoutOrderNo, setCheckoutOrderNo] = useState("");
  const [checkoutResult, setCheckoutResult] = useState<string>("");
  const [proofOrderNo, setProofOrderNo] = useState("");
  const [proofFileName, setProofFileName] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [trackingOrderNo, setTrackingOrderNo] = useState("");
  const [trackingResult, setTrackingResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (status !== "ready" || !token) return;

    const load = async () => {
      setLoading(true);
      try {
        const response = await customerApi.payments(token, page, 10);
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load payment history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, status, token]);

  const createCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await customerApi.createPaymentRequest({ orderNo: checkoutOrderNo.trim() });
      setCheckoutResult(
        `Checkout ready for ${checkoutOrderNo.trim()}. ${response.checkoutUrl ? `Open ${response.checkoutUrl}` : "No checkout URL returned yet."}`
      );
    } catch (submitError) {
      setCheckoutResult(submitError instanceof Error ? submitError.message : "Unable to create checkout request");
    } finally {
      setBusy(false);
    }
  };

  const submitProof = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await customerApi.submitManualProof(token, {
        orderNo: proofOrderNo.trim(),
        screenshotPath: proofFileName.trim() || proofOrderNo.trim(),
        screenshotStorageKey: proofFileName ? `proofs/${proofFileName.replace(/\s+/g, "-").toLowerCase()}` : undefined,
        note: proofNote.trim() || undefined
      });
      setCheckoutResult(`Manual proof saved for ${response.providerRef}. Status: ${response.status}`);
    } catch (submitError) {
      setCheckoutResult(submitError instanceof Error ? submitError.message : "Unable to submit payment proof");
    } finally {
      setBusy(false);
    }
  };

  const trackStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await customerApi.trackPaymentStatus(trackingOrderNo.trim());
      setTrackingResult(
        `${response.orderNo}: order ${response.orderStatus}, payment ${response.paymentStatus}${response.latestPayment ? `, latest ${response.latestPayment.status}` : ""}`
      );
    } catch (submitError) {
      setTrackingResult(submitError instanceof Error ? submitError.message : "Unable to track payment status");
    } finally {
      setBusy(false);
    }
  };

  const renderPaymentRow = (record: CustomerPaymentRecord) => (
    <tr key={record.id}>
      <td>
        <strong>{record.orderNo}</strong>
        <div className="helper-text">{record.package.name}</div>
      </td>
      <td>{formatMoney(record.total, record.currency)}</td>
      <td><StatusBadge value={record.orderStatus} /></td>
      <td><StatusBadge value={record.paymentStatus} /></td>
      <td>{formatDateTime(record.createdAt)}</td>
      <td>{record.latestPayment?.provider || "—"}</td>
      <td>{record.latestPayment?.checkoutUrl ? "Checkout available" : "—"}</td>
    </tr>
  );

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Payments</p>
        <h1>Request payment, upload proof, and track payment state.</h1>
        <p className="section-lead">
          This page is wired to the existing checkout, manual proof, and status APIs already present in the backend.
        </p>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span>Pending payments</span>
          <strong>{data ? data.pendingPayments : "..."}</strong>
          <p>Manual proof and approval flow still active</p>
        </article>
        <article className="metric-card">
          <span>Loaded orders</span>
          <strong>{data ? data.total : "..."}</strong>
          <p>Paginated payment history</p>
        </article>
      </div>

      <div className="split-layout">
        <form className="card stack" onSubmit={createCheckout}>
          <div className="section-heading section-heading-tight">
            <p className="eyebrow">Create request</p>
            <h2>Generate a payment checkout</h2>
          </div>
          <label className="field">
            <span>Order number</span>
            <input value={checkoutOrderNo} onChange={(event) => setCheckoutOrderNo(event.target.value)} placeholder="APS-..." required />
          </label>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Creating..." : "Create payment request"}
          </button>
          {checkoutResult && <p className="helper-text">{checkoutResult}</p>}
        </form>

        <form className="card stack" onSubmit={submitProof}>
          <div className="section-heading section-heading-tight">
            <p className="eyebrow">Upload proof</p>
            <h2>Submit manual payment evidence</h2>
          </div>
          <label className="field">
            <span>Order number</span>
            <input value={proofOrderNo} onChange={(event) => setProofOrderNo(event.target.value)} placeholder="APS-..." required />
          </label>
          <label className="field">
            <span>Proof file name</span>
            <input
              value={proofFileName}
              onChange={(event) => setProofFileName(event.target.value)}
              placeholder="payment-slip.png"
              required
            />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea value={proofNote} onChange={(event) => setProofNote(event.target.value)} rows={3} placeholder="Optional note for the admin team" />
          </label>
          <button type="submit" className="button button-secondary" disabled={busy}>
            {busy ? "Saving..." : "Upload proof"}
          </button>
        </form>
      </div>

      <form className="card stack" onSubmit={trackStatus}>
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">Track status</p>
          <h2>Check order payment progress</h2>
        </div>
        <div className="inline-form">
          <input value={trackingOrderNo} onChange={(event) => setTrackingOrderNo(event.target.value)} placeholder="APS-..." required />
          <button type="submit" className="button button-secondary" disabled={busy}>
            Track
          </button>
        </div>
        {trackingResult && <p className="helper-text">{trackingResult}</p>}
      </form>

      {loading ? (
        <div className="state-panel">
          <p>Loading payment history...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <article className="card">
          <div className="section-heading section-heading-tight">
            <p className="eyebrow">Payment history</p>
            <h2>Recent customer orders and payment records</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Total</th>
                  <th>Order status</th>
                  <th>Payment status</th>
                  <th>Created</th>
                  <th>Provider</th>
                  <th>Checkout</th>
                </tr>
              </thead>
              <tbody>{(data?.items || []).map(renderPaymentRow)}</tbody>
            </table>
          </div>
          {data && <Pagination page={page} total={data.total} limit={data.limit} onPageChange={setPage} />}
        </article>
      )}
    </section>
  );
}
