import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";
import type { RestorationOrderSummary } from "../lib/portal-types";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";

export function RestorationHistoryPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<RestorationOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await customerApi.listRestorationOrders(token);
        if (!cancelled) setOrders(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Your Restoration Orders</h1>
      </div>
      <div className="button-row" style={{ marginBottom: "1rem" }}>
        <Link to="/restore/new" className="button">New Restoration</Link>
      </div>
      {loading ? (
        <div className="state-panel"><p>Loading orders...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : orders.length === 0 ? (
        <div className="state-panel"><p>No restoration orders yet. <Link to="/restore/new">Create your first restoration.</Link></p></div>
      ) : (
        <div className="admin-card-grid">
          {orders.map((order) => (
            <Link key={order.id} to={`/restore/${order.id}`} className="card admin-record-card" style={{ textDecoration: "none", color: "inherit" }}>
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
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
