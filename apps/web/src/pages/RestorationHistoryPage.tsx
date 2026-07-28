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

  const totalCompleted = orders.filter(o => o.status === "COMPLETED").length;
  const totalProcessing = orders.filter(o => o.status === "PROCESSING" || o.status === "QUEUED").length;
  const totalFailed = orders.filter(o => o.status === "FAILED").length;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>My Restorations</h1>
        <p>View your restoration orders, downloads, and print orders.</p>
      </div>

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        <article className="metric-card metric-card-accent">
          <span>Completed</span>
          <strong>{totalCompleted}</strong>
        </article>
        <article className="metric-card">
          <span>Processing</span>
          <strong>{totalProcessing}</strong>
        </article>
        <article className="metric-card">
          <span>Failed</span>
          <strong>{totalFailed}</strong>
        </article>
        <article className="metric-card">
          <span>Total</span>
          <strong>{orders.length}</strong>
        </article>
      </div>

      <div className="button-row" style={{ marginBottom: "1rem", marginTop: "1rem" }}>
        <Link to="/restore/new" className="button">New Restoration</Link>
        <Link to="/payments" className="button button-secondary">Invoices</Link>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading orders...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : orders.length === 0 ? (
        <div className="state-panel">
          <p>No restoration orders yet.</p>
          <div className="button-row" style={{ marginTop: "1rem", justifyContent: "center" }}>
            <Link to="/restore/new" className="button">Start Your First Restoration</Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          {totalCompleted > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3>Completed Restorations</h3>
              <div className="admin-card-grid" style={{ marginTop: "0.5rem" }}>
                {orders.filter(o => o.status === "COMPLETED").map((order) => (
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
                      <div><dt>Download</dt><dd style={{ color: "var(--accent)", fontWeight: 600 }}>Ready</dd></div>
                    </dl>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {totalProcessing > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3>Currently Processing</h3>
              <div className="admin-card-grid" style={{ marginTop: "0.5rem" }}>
                {orders.filter(o => o.status === "PROCESSING" || o.status === "QUEUED").map((order) => (
                  <Link key={order.id} to={`/restore/${order.id}`} className="card admin-record-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="card-top">
                      <div>
                        <p className="eyebrow">{order.orderNo}</p>
                        <h3>{order.title || "Untitled"}</h3>
                      </div>
                      <StatusBadge value="PROCESSING" />
                    </div>
                    <dl className="detail-grid">
                      <div><dt>Created</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
                      <div><dt>Items</dt><dd>{order.completedItems}/{order.totalItems}</dd></div>
                    </dl>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {totalFailed > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3>Failed Orders</h3>
              <div className="admin-card-grid" style={{ marginTop: "0.5rem" }}>
                {orders.filter(o => o.status === "FAILED").map((order) => (
                  <Link key={order.id} to={`/restore/${order.id}`} className="card admin-record-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="card-top">
                      <div>
                        <p className="eyebrow">{order.orderNo}</p>
                        <h3>{order.title || "Untitled"}</h3>
                      </div>
                      <StatusBadge value="FAILED" />
                    </div>
                    <dl className="detail-grid">
                      <div><dt>Created</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
                      <div><dt>Items</dt><dd>{order.completedItems}/{order.totalItems}</dd></div>
                    </dl>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: "2rem" }}>
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">Quick Actions</p>
          <h3>Upgrade Package</h3>
        </div>
        <div className="button-row">
          <Link to="/payments" className="button button-secondary">View Invoices</Link>
          <Link to="/pricing" className="button button-ghost">Pricing Plans</Link>
        </div>
      </div>
    </section>
  );
}
