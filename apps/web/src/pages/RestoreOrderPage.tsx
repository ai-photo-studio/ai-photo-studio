import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";
import type { RestorationItemRecord } from "../lib/portal-types";
import { formatDateTime } from "../lib/format";

const STAGES = [
  { key: "RESTORATION_ANALYSIS", label: "Quality Analysis" },
  { key: "RESTORATION_INPAINT", label: "Damage Repair (LaMa)" },
  { key: "RESTORATION_FACE", label: "Face Restoration (GFPGAN/CodeFormer)" },
  { key: "RESTORATION_COLORIZE", label: "Colorization (DDColor)" },
  { key: "RESTORATION_UPSCALE", label: "Upscaling (Real-ESRGAN)" },
  { key: "RESTORATION_PREVIEW", label: "Preview Generation" }
];

const STAGE_ORDER = STAGES.map((s) => s.key);

function stageProgress(stage: string | null): { current: number; total: number } {
  const idx = stage ? STAGE_ORDER.indexOf(stage) : -1;
  return { current: Math.max(0, idx + 1), total: STAGE_ORDER.length };
}

export function RestoreOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<{
    id: string; status: string; title: string | null; orderNo: string;
    createdAt: string; updatedAt: string;
    totalItems: number; completedItems: number; failedItems: number;
    items: RestorationItemRecord[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<RestorationItemRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [compareValue, setCompareValue] = useState(50);
  const [fullScreen, setFullScreen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!token || !orderId) return;
    setLoading(true);
    try {
      const data = await customerApi.getRestorationOrder(token, orderId);
      setOrder(data);
      if (data.items.length > 0 && !selectedItem) setSelectedItem(data.items[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);
  useEffect(() => { const interval = setInterval(() => { void loadOrder(); }, 7000); return () => clearInterval(interval); }, [loadOrder]);

  const handleProcess = async () => {
    if (!token || !orderId || !selectedItem) return;
    setProcessing(true);
    try {
      await customerApi.processRestorationItem(token, orderId, selectedItem.id);
      setTimeout(() => void loadOrder(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const handlePreview = async (item: RestorationItemRecord) => {
    if (!token || !orderId) return;
    setPreviewLoading(true);
    setSelectedItem(item);
    try {
      const result = await customerApi.getRestorationPreview(token, orderId, item.id);
      setPreviewUrl(result.previewUrl);
    } catch {
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApprove = async (itemId: string, approved: boolean) => {
    if (!token || !orderId) return;
    try {
      await customerApi.approveRestorationItem(token, orderId, itemId, approved);
      void loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const handleDownload = async (item: RestorationItemRecord) => {
    if (!token || !orderId) return;
    try {
      const result = await customerApi.getRestorationDownload(token, orderId, item.id);
      window.open(result.downloadUrl, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading restoration order...</p></div></section>;
  if (error) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;
  if (!order) return <section className="page-stack"><div className="state-panel"><p>Order not found.</p></div></section>;

  const isTerminal = (status: string) => ["COMPLETED", "FAILED", "APPROVED", "REJECTED", "DEAD_LETTER"].includes(status);
  const canProcess = (status: string) => !isTerminal(status) && !["PROCESSING", "QUEUED", "ANALYZING"].includes(status);
  const currentItem = selectedItem || order.items[0];

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Restoration Order</p>
        <h1>{order.title || `Order ${order.orderNo}`}</h1>
        <p>Created {formatDateTime(order.createdAt)}</p>
      </div>

      <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        <article className="card"><div><p className="eyebrow">Status</p><h3 style={{ color: order.status === "COMPLETED" ? "var(--success)" : order.status === "FAILED" ? "var(--error)" : "var(--accent)" }}>{order.status}</h3></div></article>
        <article className="card"><div><p className="eyebrow">Items</p><h3>{order.totalItems}</h3></div></article>
        <article className="card"><div><p className="eyebrow">Completed</p><h3>{order.completedItems}</h3></div></article>
        <article className="card"><div><p className="eyebrow">Failed</p><h3>{order.failedItems}</h3></div></article>
      </div>

      {currentItem.status === "PROCESSING" && currentItem && (
        <div className="restore-progress" style={{ marginTop: "1rem" }}>
          <h3>Processing Pipeline</h3>
          {STAGES.map((stage) => {
            const idx = STAGE_ORDER.indexOf(stage.key);
            const currentIdx = currentItem.processingStage ? STAGE_ORDER.indexOf(currentItem.processingStage) : -1;
            let state = "pending";
            if (idx < currentIdx) state = "completed";
            else if (idx === currentIdx) state = "active";
            return (
              <div key={stage.key} className="restore-stage" style={{
                display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0",
                opacity: state === "pending" ? 0.4 : 1
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700,
                  background: state === "completed" ? "var(--success)" : state === "active" ? "var(--accent)" : "var(--line)",
                  color: state === "pending" ? "var(--muted)" : "#fff"
                }}>
                  {state === "completed" ? "✓" : state === "active" ? "●" : "○"}
                </span>
                <span style={{ fontWeight: state === "active" ? 600 : 400 }}>{stage.label}</span>
              </div>
            );
          })}
          <p className="eyebrow" style={{ marginTop: "0.5rem" }}>
            {stageProgress(currentItem.processingStage).current}/{stageProgress(currentItem.processingStage).total} stages
          </p>
        </div>
      )}

      {order.items.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Images</h3>
          <div className="admin-card-grid">
            {order.items.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <article key={item.id} className={`card admin-record-card ${isSelected ? "card-selected" : ""}`}
                  style={{ border: isSelected ? "2px solid var(--accent)" : undefined }}
                  onClick={() => {
                    setSelectedItem(item);
                    setPreviewUrl(null);
                  }}
                >
                  <div className="card-top">
                    <div><h3>{item.imageCategory || "Image"}</h3></div>
                    <span className={`pill ${item.status === "COMPLETED" ? "" : item.status === "FAILED" ? "pill-error" : ""}`}>{item.status}</span>
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Stage</dt><dd>{item.processingStage || "Pending"}</dd></div>
                    <div><dt>Duration</dt><dd>{item.totalDurationMs ? `${(item.totalDurationMs / 1000).toFixed(1)}s` : "-"}</dd></div>
                    {item.qualityScore && <div><dt>Quality</dt><dd>{item.beforeQualityScore || "?"} → {item.afterQualityScore || "?"}</dd></div>}
                    {item.providerUsed && <div><dt>Providers</dt><dd>{item.providerUsed}</dd></div>}
                  </dl>
                  <div className="button-row">
                    {!isTerminal(item.status) && !["PROCESSING", "QUEUED", "ANALYZING"].includes(item.status) && (
                      <button type="button" className="button button-small" disabled={processing} onClick={(e) => { e.stopPropagation(); setSelectedItem(item); handleProcess(); }}>
                        {processing ? "Starting..." : "Process"}
                      </button>
                    )}
                    {(item.status === "COMPLETED" || item.status === "APPROVED") && (
                      <>
                        <button type="button" className="button button-small" onClick={(e) => { e.stopPropagation(); void handlePreview(item); }} disabled={previewLoading}>
                          {previewLoading ? "Loading..." : "Preview"}
                        </button>
                        <button type="button" className="button button-small button-secondary" onClick={(e) => { e.stopPropagation(); void handleDownload(item); }}>Download</button>
                        {item.status === "COMPLETED" && (
                          <button type="button" className="button button-small" onClick={(e) => { e.stopPropagation(); void handleApprove(item.id, true); }}>Approve</button>
                        )}
                      </>
                    )}
                    {item.status === "COMPLETED" && (
                      <button type="button" className="button button-small button-secondary" onClick={(e) => { e.stopPropagation(); void handleApprove(item.id, false); }}>Reject</button>
                    )}
                    {item.status === "FAILED" && (
                      <button type="button" className="button button-small" onClick={(e) => { e.stopPropagation(); handleProcess(); }}>Retry</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {previewUrl && currentItem && (
        <div style={{ marginTop: "1.5rem", position: "relative" }}>
          <div className="section-heading-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Before / After Comparison</h3>
            <div className="button-row">
              <button type="button" className="button button-small button-secondary" onClick={() => setCompareValue(0)}>Original</button>
              <button type="button" className="button button-small button-secondary" onClick={() => setCompareValue(100)}>Restored</button>
              <button type="button" className="button button-small button-secondary" onClick={() => setFullScreen(!fullScreen)}>{fullScreen ? "Exit Full Screen" : "Full Screen"}</button>
            </div>
          </div>
          <div
            className="restore-compare"
            style={{
              position: "relative", width: "100%", maxWidth: 800, margin: "1rem auto", overflow: "hidden",
              borderRadius: "var(--radius)", cursor: "ew-resize", userSelect: "none",
              height: fullScreen ? "90vh" : 500, background: "var(--bg)"
            }}
          >
            <img src={previewUrl} alt="Restored" style={{ width: "100%", height: "100%", objectFit: "contain", position: "absolute", top: 0, left: 0 }} />
            <div style={{
              position: "absolute", top: 0, left: 0, width: `${compareValue}%`, height: "100%", overflow: "hidden",
              borderRight: "2px solid var(--accent)"
            }}>
              <img src={previewUrl} alt="Original" style={{ width: "100%", height: "100%", objectFit: "contain", position: "absolute", top: 0, left: 0, filter: "grayscale(0.5) brightness(0.9)" }} />
            </div>
            <input
              type="range" min={0} max={100} value={compareValue}
              onChange={(e) => setCompareValue(Number(e.target.value))}
              style={{ position: "absolute", bottom: 10, left: "10%", width: "80%", zIndex: 10 }}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <Link to="/history/restorations" className="button button-secondary">← Back to History</Link>
      </div>
    </section>
  );
}
