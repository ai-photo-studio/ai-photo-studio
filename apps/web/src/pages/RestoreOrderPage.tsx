import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";
import type { RestorationItemRecord } from "../lib/portal-types";
import { formatDateTime } from "../lib/format";

const STAGES = [
  { key: "RESTORATION_ANALYSIS", label: "Analyzing" },
  { key: "RESTORATION_INPAINT", label: "Repairing" },
  { key: "RESTORATION_PROCESSING", label: "Processing" },
  { key: "RESTORATION_FACE", label: "Enhancing" },
  { key: "RESTORATION_COLORIZE", label: "Improving" },
  { key: "RESTORATION_UPSCALE", label: "Improving" },
  { key: "RESTORATION_PREVIEW", label: "Generating Preview" }
];

const STAGE_ORDER = STAGES.map((s) => s.key);

function stageProgress(stage: string | null): { current: number; total: number } {
  const idx = stage ? STAGE_ORDER.indexOf(stage) : -1;
  return { current: Math.max(0, idx + 1), total: STAGE_ORDER.length };
}

type ImageLoadState = "idle" | "loading" | "loaded" | "error";

function formatScore(value: number | null | undefined): string {
  if (value == null) return "--";
  if (value >= 80) return "Excellent";
  if (value >= 60) return "Good";
  if (value >= 40) return "Fair";
  return "Poor";
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
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [compareValue, setCompareValue] = useState(50);
  const [fullScreen, setFullScreen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [bothReady, setBothReady] = useState(false);
  const [restoredLoadState, setRestoredLoadState] = useState<ImageLoadState>("idle");
  const [originalLoadState, setOriginalLoadState] = useState<ImageLoadState>("idle");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrder = useCallback(async () => {
    if (!token || !orderId) return;
    setLoading(true);
    try {
      const data = await customerApi.getRestorationOrder(token, orderId);
      setOrder(data);
      if (data.items.length > 0 && !selectedItem) {
        setSelectedItem(data.items[0]);
      }
      if (data.items.some(i => i.status === "COMPLETED" || i.status === "APPROVED")) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);
  useEffect(() => {
    pollingRef.current = setInterval(() => { void loadOrder(); }, 7000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [loadOrder]);

  const handleProcess = async () => {
    if (!token || !orderId || !selectedItem) return;
    setProcessing(true);
    setError(null);
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
    setPreviewUrl(null);
    setOriginalUrl(null);
    setBothReady(false);
    setRestoredLoadState("loading");
    setOriginalLoadState("loading");
    setSelectedItem(item);
    setError(null);
    try {
      const result = await customerApi.getRestorationPreview(token, orderId, item.id);
      setPreviewUrl(result.previewUrl);
    } catch (err) {
      setPreviewUrl(null);
      setRestoredLoadState("error");
      setError(err instanceof Error ? err.message : "Failed to load preview");
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

  const handleRestoredLoad = () => {
    setRestoredLoadState("loaded");
    if (originalLoadState === "loaded") setBothReady(true);
  };

  const handleRestoredError = () => {
    setRestoredLoadState("error");
    setError("Failed to load restored image");
  };

  const handleOriginalLoad = () => {
    setOriginalLoadState("loaded");
    if (restoredLoadState === "loaded") setBothReady(true);
  };

  const handleOriginalError = () => {
    setOriginalLoadState("error");
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading restoration order...</p></div></section>;
  if (error && !order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;
  if (!order) return <section className="page-stack"><div className="state-panel"><p>Order not found.</p></div></section>;

  const isTerminal = (status: string) => ["COMPLETED", "FAILED", "APPROVED", "REJECTED", "DEAD_LETTER"].includes(status);
  const canProcess = (status: string) => !isTerminal(status) && !["PROCESSING", "QUEUED", "ANALYZING"].includes(status);
  const currentItem = selectedItem || order.items[0];

  const statusColor = (status: string) => {
    if (status === "COMPLETED" || status === "APPROVED") return "var(--success)";
    if (status === "FAILED" || status === "REJECTED") return "var(--error)";
    if (status === "PROCESSING" || status === "QUEUED" || status === "ANALYZING") return "var(--accent)";
    return "var(--muted)";
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: "Pending", PROCESSING: "Processing", QUEUED: "Queued",
      ANALYZING: "Analyzing", COMPLETED: "Completed", FAILED: "Failed",
      APPROVED: "Approved", REJECTED: "Rejected"
    };
    return labels[status] || status;
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Restoration Order</p>
        <h1>{order.title || `Order ${order.orderNo}`}</h1>
        <p>Created {formatDateTime(order.createdAt)}</p>
      </div>

      {error && (
        <div className="state-panel state-panel-error" style={{ marginBottom: "1rem" }}>
          <p>{error}</p>
        </div>
      )}

      <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        <article className="card"><div><p className="eyebrow">Status</p><h3 style={{ color: statusColor(order.status) }}>{statusLabel(order.status)}</h3></div></article>
        <article className="card"><div><p className="eyebrow">Photos</p><h3>{order.totalItems}</h3></div></article>
        <article className="card"><div><p className="eyebrow">Restored</p><h3>{order.completedItems}</h3></div></article>
        <article className="card"><div><p className="eyebrow">Failed</p><h3>{order.failedItems}</h3></div></article>
      </div>

      {currentItem.status === "PROCESSING" && currentItem && (
        <div className="restore-progress" style={{ marginTop: "1rem" }}>
          <h3>Processing</h3>
          <div className="restore-progress-track">
            <div className="restore-progress-bar" style={{
              width: `${(stageProgress(currentItem.processingStage).current / stageProgress(currentItem.processingStage).total) * 100}%`
            }} />
          </div>
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
          <p className="eyebrow" style={{ marginTop: "0.5rem", textAlign: "center" }}>
            {stageProgress(currentItem.processingStage).current} of {stageProgress(currentItem.processingStage).total} steps completed
          </p>
        </div>
      )}

      {order.items.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Photos</h3>
          <div className="admin-card-grid">
            {order.items.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <article key={item.id} className={`card admin-record-card ${isSelected ? "card-selected" : ""}`}
                  style={{ border: isSelected ? "2px solid var(--accent)" : undefined, cursor: "pointer" }}
                  onClick={() => {
                    setSelectedItem(item);
                    setPreviewUrl(null);
                    setOriginalUrl(null);
                    setBothReady(false);
                    setError(null);
                  }}
                >
                  <div className="card-top">
                    <div><h3>{item.imageCategory || "Photo"}</h3></div>
                    <span className={`pill ${item.status === "COMPLETED" || item.status === "APPROVED" ? "" : item.status === "FAILED" || item.status === "REJECTED" ? "pill-error" : ""}`}>{statusLabel(item.status)}</span>
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Stage</dt><dd>{item.processingStage ? statusLabel(item.processingStage) : "Pending"}</dd></div>
                    <div><dt>Duration</dt><dd>{item.totalDurationMs ? `${(item.totalDurationMs / 1000).toFixed(1)}s` : "-"}</dd></div>
                    {item.qualityScore != null && (
                      <>
                        <div><dt>Photo Condition</dt><dd>{formatScore(item.beforeQualityScore)}</dd></div>
                        <div><dt>Restored Quality</dt><dd style={{ color: "var(--accent)", fontWeight: 600 }}>{formatScore(item.afterQualityScore)}</dd></div>
                      </>
                    )}
                    {item.finalStorageKey && <div><dt>Print Ready</dt><dd style={{ color: (item.afterQualityScore ?? 0) >= 60 ? "var(--accent)" : "var(--muted)" }}>{(item.afterQualityScore ?? 0) >= 60 ? "Yes" : "Standard"}</dd></div>}
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

      {(previewLoading || bothReady || previewUrl) && currentItem && (
        <div style={{ marginTop: "1.5rem", position: "relative" }}>
          <div className="section-heading-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Before / After</h3>
            <div className="button-row">
              <button type="button" className="button button-small button-secondary" onClick={() => setCompareValue(0)}>Original</button>
              <button type="button" className="button button-small button-secondary" onClick={() => setCompareValue(100)}>Restored</button>
              {bothReady && (
                <button type="button" className="button button-small button-secondary" onClick={() => setFullScreen(!fullScreen)}>{fullScreen ? "Exit Full Screen" : "Full Screen"}</button>
              )}
            </div>
          </div>

          {!bothReady && (previewLoading || restoredLoadState === "loading") && (
            <div className="restore-compare" style={{
              position: "relative", width: "100%", maxWidth: 800, margin: "1rem auto",
              height: fullScreen ? "90vh" : 500, background: "var(--bg)",
              borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 40, height: 40, border: "3px solid var(--line)", borderTopColor: "var(--accent)",
                  borderRadius: "50%", margin: "0 auto 1rem", animation: "spin 0.8s linear infinite"
                }} />
                <p className="eyebrow">Loading preview...</p>
              </div>
            </div>
          )}

          {previewUrl && bothReady && (
            <div className="restore-compare" style={{
              position: "relative", width: "100%", maxWidth: 800, margin: "1rem auto", overflow: "hidden",
              borderRadius: "var(--radius)", cursor: "ew-resize", userSelect: "none",
              height: fullScreen ? "90vh" : 500, background: "var(--bg)"
            }}>
              <img src={previewUrl} alt="Restored" style={{ width: "100%", height: "100%", objectFit: "contain", position: "absolute", top: 0, left: 0 }}
                onLoad={handleRestoredLoad} onError={handleRestoredError} />
              <div style={{
                position: "absolute", top: 0, left: 0, width: `${compareValue}%`, height: "100%", overflow: "hidden",
                borderRight: "2px solid var(--accent)"
              }}>
                <img src={originalUrl || previewUrl} alt="Original" style={{ width: "100%", height: "100%", objectFit: "contain", position: "absolute", top: 0, left: 0 }}
                  onLoad={handleOriginalLoad} onError={handleOriginalError} />
              </div>
              <input type="range" min={0} max={100} value={compareValue}
                onChange={(e) => setCompareValue(Number(e.target.value))}
                style={{ position: "absolute", bottom: 10, left: "10%", width: "80%", zIndex: 10 }} />
            </div>
          )}

          {restoredLoadState === "error" && (
            <div className="state-panel state-panel-error" style={{ marginTop: "1rem" }}>
              <p>Failed to load restored image. The preview link may have expired. Try generating a new preview.</p>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <Link to="/history/restorations" className="button button-secondary">← Back to History</Link>
      </div>
    </section>
  );
}
