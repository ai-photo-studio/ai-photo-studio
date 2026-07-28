import { useEffect, useState } from "react";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatMoney } from "../lib/format";
import type { AdminPaymentRecord } from "../lib/portal-types";
import { adminApi } from "../services/adminApi";

type ResponseData = {
  items: AdminPaymentRecord[];
  total: number;
  page: number;
  limit: number;
};

export function AdminPaymentsPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.payments(`page=${page}&limit=10`);
      setData(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      if (action === "approve") {
        await adminApi.approvePayment(id);
      } else {
        const reason = window.prompt("Reason for rejection", "Rejected from admin UI") || "Rejected from admin UI";
        await adminApi.rejectPayment(id, reason);
      }
      await load();
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin payments</p>
        <h1>Approve or reject customer payments.</h1>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading payments...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : (
        <>
          <div className="admin-card-grid">
            {(data?.items || []).map((payment) => (
              <article key={payment.id} className="card admin-record-card">
                <div className="card-top">
                  <div>
                    <p className="eyebrow">{payment.order.orderNo}</p>
                    <h3>{payment.order.package.name}</h3>
                  </div>
                  <StatusBadge value={payment.status} />
                </div>
                <dl className="detail-grid">
                  <div>
                    <dt>Customer</dt>
                    <dd>{payment.order.customer.whatsappNumber}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{formatMoney(payment.amount, payment.currency)}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDateTime(payment.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{payment.provider}</dd>
                  </div>
                </dl>
                <p className="helper-text">
                  Latest order state: {payment.order.orderStatus} · payment state: {payment.order.paymentStatus}
                </p>
                <div className="button-row">
                  <button type="button" className="button button-small" disabled={busyId === payment.id} onClick={() => act(payment.id, "approve")}>
                    Approve
                  </button>
                  <button type="button" className="button button-small button-secondary" disabled={busyId === payment.id} onClick={() => act(payment.id, "reject")}>
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
          {data && <Pagination page={page} total={data.total} limit={data.limit} onPageChange={setPage} />}
        </>
      )}
    </section>
  );
}
