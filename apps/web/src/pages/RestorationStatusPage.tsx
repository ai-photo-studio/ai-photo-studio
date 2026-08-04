import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";
import type { RestorationCustomerStatusResponse, RestorationItemRecord } from "../lib/portal-types";

const statusLabel = (status: string) => {
  if (status === "SUCCEEDED" || status === "COMPLETED") return "Succeeded";
  if (status === "PROCESSING") return "Processing";
  if (status === "QUEUED") return "Queued";
  if (status === "FAILED") return "Failed";
  return "Pending";
};

export function RestorationStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<RestorationCustomerStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadItemId, setDownloadItemId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (!orderId) return;
    const guestToken = getGuestOwnershipToken(orderId);
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const next = await customerApi.getRestorationOrder(token || undefined, orderId, undefined, guestToken || undefined);
      if (!mounted.current) return;
      setOrder(next);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to load restoration status");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [orderId, token]);

  useEffect(() => {
    mounted.current = true;
    void load(false);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const handleDownload = async (item: RestorationItemRecord) => {
    if (!orderId) return;
    setBusyItemId(item.id);
    setDownloadUrl(null);
    setDownloadItemId(item.id);
    try {
      const guestToken = getGuestOwnershipToken(orderId);
      const result = await customerApi.getRestorationDownload(token || undefined, orderId, item.id, "master", guestToken || undefined);
      setDownloadUrl(result.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create download");
    } finally {
      setBusyItemId(null);
    }
  };

  if (loading) {
    return <section className="page-stack"><div className="state-panel"><p>Loading restoration status...</p></div></section>;
  }

  if (error && !order) {
    return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;
  }

  if (!order) {
    return <section className="page-stack"><div className="state-panel state-panel-error"><p>Order not found</p></div></section>;
  }

  const firstCompleted = order.items.find((item) => item.status === "COMPLETED");

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Restoration</p>
        <h1>{order.title || order.orderNo}</h1>
        <p>Read-only status updates. Refresh never writes.</p>
      </div>

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        <article className="metric-card"><span>Status</span><strong>{statusLabel(order.status)}</strong></article>
        <article className="metric-card"><span>Items</span><strong>{order.items.length}</strong></article>
        <article className="metric-card"><span>Download</span><strong>{order.hasDownload ? "Available" : "Locked"}</strong></article>
      </div>

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button className="button button-secondary" type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
        <Link className="button button-ghost" to="/restore">Back to history</Link>
      </div>

      {error && <div className="state-panel state-panel-error" style={{ marginTop: "1rem" }}><p>{error}</p></div>}

      <div className="admin-card-grid" style={{ marginTop: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {order.items.map((item) => (
          <article key={item.id} className="card">
            <div className="card-top"><h3>{statusLabel(item.status)}</h3><span className="pill">{item.status}</span></div>
            <p className="helper-text">{item.processingStage || item.errorMessage || "Awaiting update"}</p>
            <div className="button-row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="button"
                onClick={() => void handleDownload(item)}
                disabled={item.status !== "COMPLETED" || busyItemId === item.id}
              >
                {busyItemId === item.id ? "Preparing..." : item.status === "COMPLETED" ? "Download" : "Unavailable"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {downloadUrl && downloadItemId && firstCompleted && (
        <div className="state-panel" style={{ marginTop: "1rem" }}>
          <p>Signed download ready.</p>
          <a className="button" href={downloadUrl} target="_blank" rel="noreferrer">Open secure download</a>
        </div>
      )}
    </section>
  );
}
