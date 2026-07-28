import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import type { RestorationOrderSummary } from "../lib/portal-types";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";

export function AdminRestorationsPage() {
  const [orders, setOrders] = useState<RestorationOrderSummary[]>([]);
  const [stats, setStats] = useState<{ total: number; completed: number; processing: number; failed: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [res, statsRes] = await Promise.all([
          adminApi.restorationOrders(`page=${page}&limit=20`),
          adminApi.restorationStats()
        ]);
        if (!cancelled) {
          setOrders(res.items || []);
          setTotalPages(Math.max(1, Math.ceil((res.total || 0) / 20)));
          setStats(statsRes);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [page]);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin</p>
        <h1>Restoration Orders</h1>
      </div>

      {stats && (
        <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
          <article className="card metric"><h3>{stats.total}</h3><p className="eyebrow">Total</p></article>
          <article className="card metric"><h3>{stats.pending}</h3><p className="eyebrow">Pending</p></article>
          <article className="card metric"><h3>{stats.processing}</h3><p className="eyebrow">Processing</p></article>
          <article className="card metric"><h3>{stats.completed}</h3><p className="eyebrow">Completed</p></article>
          <article className="card metric"><h3>{stats.failed}</h3><p className="eyebrow">Failed</p></article>
        </div>
      )}

      {loading ? (
        <div className="state-panel"><p>Loading...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : (
        <div className="admin-card-grid">
          {orders.map((order) => (
            <Link key={order.id} to={`/admin/restorations/${order.id}`} className="card admin-record-card" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card-top">
                <div>
                  <p className="eyebrow">{order.orderNo}</p>
                  <h3>{order.title || "Untitled"}</h3>
                </div>
                <StatusBadge value={order.status} />
              </div>
              <dl className="detail-grid">
                <div><dt>Created</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
                <div><dt>Items</dt><dd>{order.completedItems}/{order.totalItems}</dd></div>
                <div><dt>Failed</dt><dd>{order.failedItems}</dd></div>
                <div><dt>Updated</dt><dd>{formatDateTime(order.updatedAt)}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="button-row" style={{ marginTop: "1rem", justifyContent: "center" }}>
          <button className="button button-small button-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <span className="eyebrow" style={{ padding: "0 1rem" }}>Page {page} of {totalPages}</span>
          <button className="button button-small button-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}
