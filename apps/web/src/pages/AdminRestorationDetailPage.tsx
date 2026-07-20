import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import type { RestorationItemRecord } from "../lib/portal-types";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";

export function AdminRestorationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<{ id: string; orderNo: string; title: string | null; status: string; totalItems: number; completedItems: number; failedItems: number; createdAt: string; updatedAt: string; items: RestorationItemRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await adminApi.restorationDetail(id);
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  const handleRetryOrder = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      await adminApi.retryRestorationOrder(id);
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const handleRetryItem = async (itemId: string) => {
    setRetrying(true);
    try {
      await adminApi.retryRestorationItem(itemId);
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading...</p></div></section>;
  if (error) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;
  if (!order) return <section className="page-stack"><div className="state-panel"><p>Not found</p></div></section>;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin Restoration</p>
        <h1>{order.title || "Untitled"}</h1>
        <p>{order.orderNo}</p>
      </div>

      <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        <article className="card"><p className="eyebrow">Status</p><StatusBadge value={order.status} /></article>
        <article className="card"><p className="eyebrow">Total</p><h3>{order.totalItems}</h3></article>
        <article className="card"><p className="eyebrow">Completed</p><h3>{order.completedItems}</h3></article>
        <article className="card"><p className="eyebrow">Failed</p><h3>{order.failedItems}</h3></article>
        <article className="card"><p className="eyebrow">Created</p><h3 style={{ fontSize: "0.9rem" }}>{formatDateTime(order.createdAt)}</h3></article>
      </div>

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button type="button" className="button" disabled={retrying} onClick={handleRetryOrder}>Retry All Failed</button>
        <Link to="/admin/restorations" className="button button-secondary">Back</Link>
      </div>

      <div className="admin-card-grid" style={{ marginTop: "1rem" }}>
        {order.items.map((item) => (
          <article key={item.id} className="card admin-record-card">
            <div className="card-top">
              <div><h3>{item.imageCategory || "Image"}</h3></div>
              <StatusBadge value={item.status} />
            </div>
            <dl className="detail-grid">
              <div><dt>Stage</dt><dd>{item.processingStage || "-"}</dd></div>
              <div><dt>Duration</dt><dd>{item.totalDurationMs ? `${(item.totalDurationMs / 1000).toFixed(1)}s` : "-"}</dd></div>
              <div><dt>Quality</dt><dd>{item.beforeQualityScore ?? "?"} → {item.afterQualityScore ?? "?"}</dd></div>
              <div><dt>Damage</dt><dd>{item.damageSeverity} ({item.damageScore ?? "?"})</dd></div>
              <div><dt>Error</dt><dd style={{ color: "var(--error)", fontSize: "0.85rem" }}>{item.errorMessage || "-"}</dd></div>
            </dl>
            {item.status === "FAILED" && (
              <div className="button-row">
                <button type="button" className="button button-small" disabled={retrying} onClick={() => void handleRetryItem(item.id)}>Retry Item</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
