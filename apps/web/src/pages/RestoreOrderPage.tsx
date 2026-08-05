import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";
import type { LegacyRestorationItemRecord, LegacyRestorationOrderResponse } from "../lib/portal-types";
import { formatDateTime } from "../lib/format";

const DOWNLOAD_TIERS = [
  { key: "master", label: "Master", description: "Full restored master" },
  { key: "2hd", label: "2HD", description: "Up to 2048px wide" },
  { key: "4hd", label: "4HD", description: "Up to 4096px Sharp export, capped at native master" },
];

type ItemTierState = "locked" | "unlocked";

const mapRestoreErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Session expired";
    if (error.status === 402) return "Processing credit unavailable";
    if (error.status === 404) return "Order not found";
    if (error.status === 429) return "Service busy; retry later";
    if (error.code && /FAILED$/i.test(error.code)) return "Restoration failed; retry available";
    return error.message || "Restoration failed; retry available";
  }

  if (error instanceof Error) {
    const text = error.message.toLowerCase();
    if (text.includes("guest ownership token")) return "Session expired";
    if (text.includes("insufficient credit") || text.includes("payment required")) return "Processing credit unavailable";
    if (text.includes("rate limit") || text.includes("too many requests")) return "Service busy; retry later";
    if (text.includes("not found")) return "Order not found";
    if (text.includes("replicate") || text.includes("provider") || text.includes("processing failed")) return "Restoration failed; retry available";
    return error.message;
  }

  return "Restoration failed; retry available";
};

export function RestoreOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<LegacyRestorationOrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<LegacyRestorationItemRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [_bothReady, setBothReady] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [downloadAllState, setDownloadAllState] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const [_polling, setPolling] = useState(false);
  const terminalRef = useRef(false);

  const loadOrder = useCallback(async (fromPoll = false) => {
    if (!orderId) return;
    if (!mountedRef.current) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const guestToken = getGuestOwnershipToken(orderId);
    if (!fromPoll) setLoading(true);
    try {
      const data = await customerApi.getLegacyRestorationOrder(token || undefined, orderId, controller.signal, guestToken || undefined);
      if (!mountedRef.current || controller.signal.aborted) return;
      setOrder(data);
      if (data.items.length > 0 && !selectedItem) {
        setSelectedItem(data.items[0]);
      }
      const completedItem = data.items.find((item) => item.status === "COMPLETED");
      if (completedItem && !previewUrl && !previewLoading) void handlePreview(completedItem);
      // Read-only: page load and refresh/poll must never dispatch processing.
      // Only the verified-payment-created internal execution and the P4B
      // worker runner may start new restoration processing.
      // Stop polling when all items are done OR if there was an error
      const hasError = data.items.some(i => i.status === "FAILED");
      if (hasError || data.items.every(i => i.status === "COMPLETED")) {
        terminalRef.current = true;
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        setPolling(false);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError" && mountedRef.current) {
        setError(mapRestoreErrorMessage(err));
      }
    } finally {
      if (!fromPoll && mountedRef.current) setLoading(false);
    }
  }, [token, orderId]); // stable deps only — no state vars that change during lifecycle

  useEffect(() => {
    mountedRef.current = true;
    void loadOrder();
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [loadOrder]);

  useEffect(() => {
    let disposed = false;
    const clearPoll = () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      pollingRef.current = null;
    };
    const schedulePoll = (delayMs: number) => {
      clearPoll();
      if (disposed || document.hidden || terminalRef.current) return;
      setPolling(true);
      pollingRef.current = setTimeout(async () => {
        await loadOrder(true);
        if (!disposed && !terminalRef.current) schedulePoll(4000);
      }, delayMs);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearPoll();
        setPolling(false);
      } else {
        schedulePoll(0);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedulePoll(4000);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearPoll();
    };
  }, [loadOrder]);

  const handlePreview = async (item: LegacyRestorationItemRecord) => {
    if (!orderId) return;
    const guestToken = getGuestOwnershipToken(orderId);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setBothReady(false);
    setSelectedItem(item);
    setError(null);
    try {
      const result = await customerApi.getRestorationPreview(token || undefined, orderId, item.id, guestToken || undefined);
      setPreviewUrl(result.previewUrl);
    } catch (err) {
      setError(mapRestoreErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (item: LegacyRestorationItemRecord, tier: string) => {
    if (!orderId) return;
    const guestToken = getGuestOwnershipToken(orderId);
    setDownloadBusy(tier);
    setError(null);
    try {
      const blob = await customerApi.getLegacyRestorationDownload(token || undefined, orderId, item.id, tier, guestToken || undefined);
      saveBlob(blob, `restoration-${order.orderNo}-${tier}.jpg`);
      setError("Download started");
    } catch (err) {
      setError(mapRestoreErrorMessage(err));
    } finally {
      setDownloadBusy(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!orderId) return;
    const completed = order.items.filter((item) => item.status === "COMPLETED");
    if (!completed.length || !unlockedTiers.length) return;
    setDownloadAllState(`Starting 0 of ${completed.length}`);
    let started = 0;
    for (const item of completed) {
      try {
        setDownloadAllState(`Downloading ${started + 1} of ${completed.length}`);
        const blob = await customerApi.getLegacyRestorationDownload(token || undefined, orderId, item.id, unlockedTiers[0].key, getGuestOwnershipToken(orderId) || undefined);
        saveBlob(blob, `restoration-${order.orderNo}-${started + 1}-${unlockedTiers[0].key}.jpg`);
        started += 1;
        await new Promise((resolve) => setTimeout(resolve, 400));
      } catch {
        setDownloadAllState(`Download blocked at image ${started + 1}. Use Download and Continue.`);
        return;
      }
    }
    setDownloadAllState(`${started} image${started === 1 ? "" : "s"} download started`);
  };

  const getItemStatus = (item: LegacyRestorationItemRecord): string => {
    if (item.status === "COMPLETED") return "Completed";
    if (item.status === "FAILED") return "Failed";
    if (item.status === "PROCESSING") return "Processing";
    if (item.status === "QUEUED") return "Queued";
    return "Pending";
  };

  const getTierState = (tierKey: string): ItemTierState => {
    const entitlement = order?.entitlement || "PREVIEW_ONLY";
    if (entitlement === "TEST_UNLOCKED" || entitlement === "ALL") return "unlocked";
    if (entitlement === "MASTER" && tierKey === "master") return "unlocked";
    if (entitlement === "HD_2" && ["master", "2hd"].includes(tierKey)) return "unlocked";
    if (entitlement === "HD_4" && ["master", "2hd", "4hd"].includes(tierKey)) return "unlocked";
    return tierKey === "master" && entitlement === "PREVIEW_ONLY" ? "locked" : "locked";
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading restoration order...</p></div></section>;
  if (error && !order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;
  if (!order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>Order not found</p></div></section>;

  const isCompleted = order.items.some(i => i.status === "COMPLETED");
  const isProcessing = order.items.some(i => i.status === "PROCESSING" || i.status === "QUEUED");
  const currentItem = selectedItem || order.items[0];
  const unlockedTiers = DOWNLOAD_TIERS.filter((tier) => getTierState(tier.key) === "unlocked" && currentItem?.availableTiers?.includes(tier.key));

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>{order.title || `Order ${order.orderNo}`}</h1>
        <p>Created {formatDateTime(order.createdAt)}</p>
      </div>

      {isCompleted && currentItem?.finalUrl && <div className="restoration-result-hero card">{currentItem.originalUrl ? <><div className="comparison-stage"><img src={currentItem.finalUrl} alt="Final restored photo" className="comparison-image" /><div className="comparison-before" style={{ width: `${comparisonPosition}%` }}><img src={currentItem.originalUrl} alt="Exact original uploaded photo" className="comparison-image" /></div><span className="comparison-label comparison-label-before">Before</span><span className="comparison-label comparison-label-after">After</span></div><label className="comparison-control">Before / after<input aria-label="Before and after comparison" type="range" min="0" max="100" value={comparisonPosition} onChange={(event) => setComparisonPosition(Number(event.target.value))} /></label></> : <div className="state-panel state-panel-error"><p>Original upload is unavailable. Comparison cannot be shown safely.</p></div>}<div className="result-actions"><div><p className="eyebrow">Restoration complete</p><h2>Your memory is ready.</h2>{currentItem.damageSeverity === "HEAVY" && <p className="helper-text">Large missing areas require AI reconstruction and may not exactly match the original person.</p>}</div><div className="button-row">{unlockedTiers[0] ? <button className="button" type="button" onClick={() => void handleDownload(currentItem, unlockedTiers[0].key)}>Download</button> : <Link className="button" to="/pricing">Buy or Upgrade</Link>}<Link className="button button-secondary" to={`/restore/${order.id}/print`}>Continue</Link></div></div></div>}

      {error && (
        <div className="state-panel state-panel-error" style={{ marginBottom: "1rem" }}>
          <p>{error}</p>
        </div>
      )}

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        <article className="card">
          <div>
            <p className="eyebrow">Status</p>
            <h3 style={{ color: isCompleted ? "var(--success)" : isProcessing ? "var(--accent)" : "var(--muted)" }}>
              {isCompleted ? "Ready" : isProcessing ? "Processing" : "Pending"}
            </h3>
          </div>
        </article>
        <article className="card">
          <div>
            <p className="eyebrow">Images</p>
            <h3>{order.totalItems}</h3>
          </div>
        </article>
        <article className="card">
          <div>
            <p className="eyebrow">Restored</p>
            <h3>{order.completedItems}</h3>
          </div>
        </article>
        <article className="card">
          <div>
            <p className="eyebrow">Estimated Time</p>
         <h3>{isProcessing ? "~40 sec" : isCompleted ? "Complete" : "Pending upload"}</h3>
          </div>
        </article>
      </div>

      {isProcessing && (
        <div className="state-panel" style={{ background: "var(--surface)", marginTop: "1rem", padding: "1rem 1.5rem", borderRadius: "var(--radius)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              border: "3px solid var(--accent)", borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite"
            }} />
             <p style={{ fontWeight: 600 }}>Preparing, restoring, enhancing faces, creating HD files, and finalizing. Typical completion is about 40 seconds.</p>
          </div>
        </div>
      )}

      {order.items.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Your Images</h3>
          <div className="admin-card-grid">
            {order.items.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const status = getItemStatus(item);
              return (
                <article key={item.id} className={`card admin-record-card ${isSelected ? "card-selected" : ""}`}
                  style={{ border: isSelected ? "2px solid var(--accent)" : undefined, cursor: "pointer" }}
                  onClick={() => {
                    setSelectedItem(item);
                    setPreviewUrl(null);
                    setBothReady(false);
                    setError(null);
                  }}
                >
                  <div className="card-top">
                    <div><h3>{item.imageCategory || "Photo"}</h3></div>
                    <span className={`pill ${status === "Completed" ? "" : status === "Failed" ? "pill-error" : ""}`}>{status}</span>
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Original</dt><dd>{item.originalStorageKey ? "Uploaded" : "-"}</dd></div>
                    {item.totalDurationMs != null && (
                      <div><dt>Processed</dt><dd>{(item.totalDurationMs / 1000).toFixed(1)}s</dd></div>
                    )}
                    {item.finalStorageKey && <div><dt>Ready</dt><dd style={{ color: "var(--accent)", fontWeight: 600 }}>Yes</dd></div>}
                  </dl>
                  {status === "Completed" && (
                    <div className="button-row">
                      <button type="button" className="button button-small" onClick={(e) => { e.stopPropagation(); void handlePreview(item); }} disabled={previewLoading}>
                        {previewLoading ? "Loading..." : "Preview"}
                      </button>
                    </div>
                  )}
                  {status === "Failed" && (
                    <div className="state-panel state-panel-error" style={{ padding: "0.5rem", margin: "0.5rem 0", fontSize: "0.85rem" }}>
                      <p>{item.errorMessage ? mapRestoreErrorMessage(item.errorMessage) : "Restoration failed; retry available"}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {isCompleted && (
        <>
           <div style={{ marginTop: "2rem" }}>
             <h3>Download Tiers</h3>
             <p className="helper-text">Your plan unlocks {unlockedTiers.length} of {DOWNLOAD_TIERS.length} digital files.</p>
             {order.items.filter((item) => item.status === "COMPLETED").length > 1 && unlockedTiers.length > 0 && <div className="button-row" style={{ marginBottom: "1rem" }}><button type="button" className="button button-secondary" onClick={() => void handleDownloadAll()} disabled={Boolean(downloadAllState?.startsWith("Downloading"))}>Download All Images</button>{downloadAllState && <span className="helper-text">{downloadAllState}</span>}</div>}
            <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {DOWNLOAD_TIERS.filter((tier) => currentItem?.availableTiers?.includes(tier.key)).map((tier) => {
                const state = getTierState(tier.key);
                return (
                  <article key={tier.key} className="card" style={{
                    opacity: state === "locked" ? 0.5 : 1,
                     border: state === "unlocked" ? "2px solid var(--accent)" : "1px solid var(--line)"
                  }}>
                    <div className="card-top">
                      <div>
                        <h3>{tier.label}</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{tier.description}</p>
                      </div>
                       <span className={`pill ${state === "unlocked" ? "" : "pill-error"}`}>
                         {state === "unlocked" ? "Unlocked" : "Locked until payment"}
                      </span>
                    </div>
                    <div className="button-row" style={{ marginTop: "0.75rem" }}>
                       {state === "unlocked" && (
                        <button
                          type="button"
                          className="button button-small"
                          disabled={!currentItem || downloadBusy === tier.key}
                          onClick={() => currentItem && void handleDownload(currentItem, tier.key)}
                        >
                          {downloadBusy === tier.key ? "Preparing..." : "Download"}
                        </button>
                      )}
                       {state === "locked" && (
                        <button type="button" className="button button-small" disabled style={{ opacity: 0.5 }}>
                          Unlock {tier.label}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

        </>
      )}

      {previewModal && previewUrl && <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 20, background: "rgba(0,0,0,.86)", display: "grid", placeItems: "center", padding: "1rem" }} onClick={() => setPreviewModal(false)}><img src={previewUrl} alt="Large restored preview" style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain" }} /></div>}

      <div style={{ marginTop: "1.5rem" }}>
        <Link to="/restore" className="button button-secondary">← My Restorations</Link>
      </div>
    </section>
  );
}

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
