import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";
import type { RestorationItemRecord } from "../lib/portal-types";
import { formatDateTime } from "../lib/format";

const DOWNLOAD_TIERS = [
  { key: "original", label: "Original", description: "Source resolution" },
  { key: "2x", label: "2X", description: "2× upscale" },
  { key: "4x", label: "4X", description: "4× upscale" },
  { key: "6x", label: "6X", description: "6× upscale" },
  { key: "8x", label: "8X", description: "8× upscale" },
  { key: "12x", label: "12X", description: "12× upscale" },
];

const PRINT_SIZES = [
  { key: "4x6", label: "4×6", price: "500", description: "Standard print" },
  { key: "5x7", label: "5×7", price: "700", description: "Medium print" },
  { key: "8x10", label: "8×10", price: "1,000", description: "Large print" },
  { key: "a4", label: "A4", price: "1,200", description: "A4 print" },
  { key: "a3", label: "A3", price: "2,000", description: "A3 print" },
  { key: "canvas", label: "Canvas", price: "3,500", description: "Canvas wrap" },
  { key: "frame", label: "Frame", price: "5,000", description: "Framed print" },
  { key: "album", label: "Album", price: "8,000", description: "Album page" },
];

type ItemTierState = "locked" | "purchased" | "upgrade-available";

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
  const [bothReady, setBothReady] = useState(false);
  const [purchasedTiers, setPurchasedTiers] = useState<Set<string>>(new Set(["original"]));
  const [selectedPrintSize, setSelectedPrintSize] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadOrder = useCallback(async () => {
    if (!token || !orderId) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const data = await customerApi.getRestorationOrder(token, orderId, abortRef.current?.signal);
      setOrder(data);
      if (data.items.length > 0 && !selectedItem) {
        setSelectedItem(data.items[0]);
      }
      if (data.items.some(i => i.status === "COMPLETED")) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to load order");
      }
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

  useEffect(() => { void loadOrder(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, [loadOrder]);
  useEffect(() => {
    pollingRef.current = setInterval(() => { void loadOrder(); }, 7000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [loadOrder]);

  const handlePreview = async (item: RestorationItemRecord) => {
    if (!token || !orderId) return;
    setPreviewLoading(true);
    setPreviewUrl(null);
    setBothReady(false);
    setSelectedItem(item);
    setError(null);
    try {
      const result = await customerApi.getRestorationPreview(token, orderId, item.id);
      setPreviewUrl(result.previewUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUpgradeTier = async (tierKey: string) => {
    if (!token || !orderId) return;
    try {
      setPurchasedTiers(prev => new Set(prev).add(tierKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
    }
  };

  const handlePrintOrder = async () => {
    if (!token || !orderId || !selectedPrintSize) return;
    setPrintBusy(true);
    try {
      setPrintBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Print order failed");
      setPrintBusy(false);
    }
  };

  const getItemStatus = (item: RestorationItemRecord): string => {
    if (item.status === "COMPLETED") return "Completed";
    if (item.status === "FAILED") return "Failed";
    if (item.status === "PROCESSING") return "Processing";
    if (item.status === "QUEUED") return "Queued";
    return "Pending";
  };

  const getTierState = (tierKey: string): ItemTierState => {
    if (purchasedTiers.has(tierKey)) return "purchased";
    if (tierKey === "2x" && purchasedTiers.has("original")) return "upgrade-available";
    if (tierKey === "4x" && purchasedTiers.has("2x")) return "upgrade-available";
    if (tierKey === "6x" && purchasedTiers.has("4x")) return "upgrade-available";
    if (tierKey === "8x" && purchasedTiers.has("6x")) return "upgrade-available";
    if (tierKey === "12x" && purchasedTiers.has("8x")) return "upgrade-available";
    return "locked";
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading restoration order...</p></div></section>;
  if (error && !order) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;
  if (!order) return <section className="page-stack"><div className="state-panel"><p>Order not found.</p></div></section>;

  const isCompleted = order.items.some(i => i.status === "COMPLETED");
  const isProcessing = order.items.some(i => i.status === "PROCESSING" || i.status === "QUEUED");
  const currentItem = selectedItem || order.items[0];

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>{order.title || `Order ${order.orderNo}`}</h1>
        <p>Created {formatDateTime(order.createdAt)}</p>
      </div>

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
            <h3>{isProcessing ? "~2-3 min" : isCompleted ? "Complete" : "Pending upload"}</h3>
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
            <p style={{ fontWeight: 600 }}>Your images are being restored. This takes approximately 2-3 minutes.</p>
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
                      <p>Processing failed. Please contact support.</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {(previewLoading || previewUrl) && currentItem && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Preview</h3>
          {previewLoading ? (
            <div className="state-panel" style={{ padding: "2rem", textAlign: "center" }}>
              <p>Loading preview...</p>
            </div>
          ) : previewUrl ? (
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              <img src={previewUrl} alt="Restored preview" style={{ width: "100%", height: "auto", borderRadius: "var(--radius)" }} />
            </div>
          ) : null}
        </div>
      )}

      {isCompleted && (
        <>
          <div style={{ marginTop: "2rem" }}>
            <h3>Download Tiers</h3>
            <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {DOWNLOAD_TIERS.map((tier) => {
                const state = getTierState(tier.key);
                return (
                  <article key={tier.key} className="card" style={{
                    opacity: state === "locked" ? 0.5 : 1,
                    border: state === "purchased" ? "2px solid var(--accent)" : "1px solid var(--line)"
                  }}>
                    <div className="card-top">
                      <div>
                        <h3>{tier.label}</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{tier.description}</p>
                      </div>
                      <span className={`pill ${state === "purchased" ? "" : state === "upgrade-available" ? "" : "pill-error"}`}>
                        {state === "purchased" ? "Owned" : state === "upgrade-available" ? "Upgrade" : "Locked"}
                      </span>
                    </div>
                    <div className="button-row" style={{ marginTop: "0.75rem" }}>
                      {state === "purchased" && (
                        <button type="button" className="button button-small">Download</button>
                      )}
                      {state === "upgrade-available" && (
                        <button type="button" className="button button-small button-secondary" onClick={() => void handleUpgradeTier(tier.key)}>
                          Buy {tier.label}
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

          <div style={{ marginTop: "2rem" }}>
            <h3>Print Options</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Printed from restored master. No extra processing needed.
            </p>
            <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {PRINT_SIZES.map((size) => (
                <article key={size.key} className={`card ${selectedPrintSize === size.key ? "card-selected" : ""}`}
                  style={{
                    cursor: "pointer",
                    border: selectedPrintSize === size.key ? "2px solid var(--accent)" : "1px solid var(--line)",
                    background: selectedPrintSize === size.key ? "color-mix(in srgb, var(--accent) 5%, var(--surface))" : "var(--surface)"
                  }}
                  onClick={() => setSelectedPrintSize(size.key)}
                >
                  <div className="card-top">
                    <div>
                      <h3>{size.label}</h3>
                      <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{size.description}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0.5rem 0", color: "var(--accent)" }}>
                    PKR {size.price}
                  </p>
                </article>
              ))}
            </div>
            {selectedPrintSize && (
              <div className="button-row" style={{ marginTop: "1rem" }}>
                <button type="button" className="button" disabled={printBusy} onClick={handlePrintOrder}>
                  {printBusy ? "Placing order..." : "Order Print"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <Link to="/restore" className="button button-secondary">← My Restorations</Link>
      </div>
    </section>
  );
}
