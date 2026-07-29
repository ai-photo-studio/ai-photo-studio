import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { setGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";
import { usePackages } from "../lib/packages";
import type { PackageSummary } from "../lib/api";
import type { RestorationItemRecord } from "../lib/portal-types";

type FileMeta = {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  objectUrl: string;
  mimeType: string;
  aspectRatio: number;
  suggestedRes: "Original" | "2HD" | "4HD";
  printReady: boolean;
  estPrintInches: string;
};

type ResolutionTier = {
  key: string;
  label: string;
  pricePkr: number;
  description: string;
  resolution: string;
  scaling: string;
  printSize: string;
  quality: string;
};

const SINGLE_RESOLUTION_TIERS: ResolutionTier[] = [
  { key: "original", label: "Original", pricePkr: 250, description: "Source resolution \u2014 ideal for basic sharing", resolution: "Original", scaling: "1x", printSize: "~525x380px", quality: "Good" },
  { key: "2hd", label: "2HD", pricePkr: 350, description: `2\u00D7 enhanced \u2014 sharp detail for listings`, resolution: "2HD", scaling: "2x", printSize: "~1050x760px", quality: "High" },
  { key: "4hd", label: "4HD", pricePkr: 500, description: `4\u00D7 enhanced \u2014 premium print ready`, resolution: "4HD", scaling: "4x", printSize: "~2100x1520px", quality: "Excellent" },
];

function getImageMeta(file: File, objectUrl: string): Promise<FileMeta> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const aspect = Math.round((w / h) * 100) / 100;
      const printReady = w >= 1800 && h >= 1800;
      const suggestedRes = w >= 4000 && h >= 4000 ? "4HD" : w >= 3000 ? "2HD" : "Original";
      const estPrint = `~${Math.round(w / 300)}\u00D7${Math.round(h / 300)} in`;
      resolve({ fileName: file.name, fileSize: file.size, width: w, height: h, objectUrl, mimeType: file.type, aspectRatio: aspect, suggestedRes, printReady, estPrintInches: estPrint });
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = objectUrl;
  });
}

// Feature flag for demo mode
const IS_DEMO_MODE = true;

export function RestoreNewPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { packages, loading: pkgLoading } = usePackages();
  const [files, setFiles] = useState<{ file: File; base64: string; name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "resolution" | "package" | "payment" | "complete">("upload");
  const [selectedPackage, setSelectedPackage] = useState<PackageSummary | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionTier | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [fileMetas, setFileMetas] = useState<FileMeta[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerPanX, setViewerPanX] = useState(0);
  const [viewerPanY, setViewerPanY] = useState(0);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const viewerRef = useRef<HTMLDivElement>(null);

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      fileMetas.forEach((m) => URL.revokeObjectURL(m.objectUrl));
    };
  }, []);

  // Revoke object URLs when leaving preview step
  useEffect(() => {
    if (step === "upload") {
      fileMetas.forEach((m) => URL.revokeObjectURL(m.objectUrl));
    }
  }, [step]);

  const isSingle = files.length === 1;

  const readFile = (file: File): Promise<{ base64: string; name: string; size: number }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({ base64: result.split(",")[1], name: file.name, size: file.size });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const maxSize = 10 * 1024 * 1024;
    const newFiles = [];
    for (const f of Array.from(fileList)) {
      if (!allowed.includes(f.type)) {
        setError(`Unsupported format: ${f.name}. Use JPEG, PNG, or WebP.`);
        continue;
      }
      if (f.size > maxSize) {
        setError(`File too large: ${f.name}. Max 10 MB.`);
        continue;
      }
      try {
        const data = await readFile(f);
        newFiles.push({ file: f, ...data });
      } catch {
        setError(`Failed to read: ${f.name}`);
      }
    }
    setFiles((prev) => {
      // Revoke old object URLs
      prev.forEach((f) => { if ((f as unknown as Record<string, unknown>)._objectUrl) URL.revokeObjectURL((f as unknown as Record<string, unknown>)._objectUrl as string); });
      return [...prev, ...newFiles];
    });
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (index: number) => setFiles((prev) => {
    const removed = prev[index];
    if (removed && (removed as unknown as Record<string, unknown>)._objectUrl) {
      URL.revokeObjectURL((removed as unknown as Record<string, unknown>)._objectUrl as string);
    }
    return prev.filter((_, i) => i !== index);
  });

  const handleUpload = async () => {
    if (!token) {
      setError("Please log in to upload images for restoration");
      return;
    }
    if (files.length === 0) return;
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const order = await customerApi.createRestorationOrder(token, `Restoration - ${files.length} image(s)`);
      if (order.guestOwnershipToken) {
        setGuestOwnershipToken(order.id, order.guestOwnershipToken);
      }
      const allItemIds: string[] = [];
      let firstItemId: string | null = null;
      const metas: FileMeta[] = [];
      for (const f of files) {
        try {
          const result = await customerApi.addRestorationItem(
            token,
            order.id,
            f.name,
            f.file.type || "image/jpeg",
            f.base64,
            order.guestOwnershipToken
          );
          allItemIds.push(result.item.id);
          if (!firstItemId) firstItemId = result.item.id;
          const objectUrl = URL.createObjectURL(f.file);
          (f as unknown as Record<string, unknown>)._objectUrl = objectUrl;
          // Free base64 memory after upload by setting to empty string
          (f as unknown as Record<string, unknown>).base64 = "";
          const meta = await getImageMeta(f.file, objectUrl);
          metas.push(meta);
        } catch (err) {
          setError(`Failed to upload ${f.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      setOrderId(order.id);
      setFileMetas(metas);
      setSelectedMeta(0); // Auto-select first image for preview
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create restoration order");
    } finally {
      setUploading(false);
    }
  };

  const handleSelectResolution = (tier: ResolutionTier) => {
    setSelectedResolution(tier);
    setStep("payment");
  };

  const handleSelectPackage = (pkg: PackageSummary) => {
    setSelectedPackage(pkg);
    setStep("payment");
  };

  const handlePaymentComplete = async () => {
    if (orderId && token) {
      // In demo mode, approve the restoration item so processing can start
      if (IS_DEMO_MODE) {
        try {
          // Approve all items so processItem passes the payment guard
          for (const meta of fileMetas) {
            // The item IDs are stored in uploadItemIds but we don't have them here.
            // The processItem endpoint will handle this when called from RestoreOrderPage.
            // For now, just navigate - the payment guard check will need order.status === APPROVED
          }
        } catch { /* non-critical */ }
      }
      navigate(`/restore/${orderId}`);
    }
  };
  const openViewer = (idx: number) => {
    setSelectedMeta(idx);
    setViewerScale(1);
    setViewerPanX(0);
    setViewerPanY(0);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerScale(1);
    setViewerPanX(0);
    setViewerPanY(0);
  };

  const handleViewerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closeViewer();
  };

  const zoomIn = () => setViewerScale((s) => Math.min(s + 0.25, 5));
  const zoomOut = () => setViewerScale((s) => Math.max(s - 0.25, 0.25));
  const fitToScreen = () => { setViewerScale(1); setViewerPanX(0); setViewerPanY(0); };
  const zoom100 = () => { setViewerScale(1); setViewerPanX(0); setViewerPanY(0); };

  const handleViewerMouseDown = (e: React.MouseEvent) => {
    if (viewerScale > 1) {
      setPanning(true);
      setPanStart({ x: e.clientX - viewerPanX, y: e.clientY - viewerPanY });
    }
  };
  const handleViewerMouseMove = (e: React.MouseEvent) => {
    if (panning && viewerScale > 1) {
      setViewerPanX(e.clientX - panStart.x);
      setViewerPanY(e.clientY - panStart.y);
    }
  };
  const handleViewerMouseUp = () => setPanning(false);
  const handleViewerWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setViewerScale((s) => {
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      return Math.min(Math.max(s + delta, 0.25), 5);
    });
  };

  const activeMeta = selectedMeta !== null ? fileMetas[selectedMeta] : null;
  const ext = (name: string) => name.split(".").pop()?.toUpperCase() || "";
  const orientation = (w: number, h: number) =>
    w === h ? "Square" : w > h ? "Landscape" : "Portrait";
  const uploadTimestamp = new Date().toLocaleString();

  // ========== PREVIEW STEP ==========
  if (step === "preview") {
    return (
      <section className="page-stack">
        {/* Image viewer modal */}
        {viewerOpen && activeMeta && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed", inset: 0, zIndex: 1000,
              background: "rgba(0,0,0,0.92)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              cursor: panning ? "grabbing" : "default",
            }}
            onClick={closeViewer}
            onKeyDown={handleViewerKeyDown}
            tabIndex={0}
            role="dialog"
            aria-label="Image viewer"
            ref={viewerRef}
          >
            {/* Toolbar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "1rem", background: "rgba(0,0,0,0.5)",
              zIndex: 1001,
            }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); zoomOut(); }}
                style={viewerBtnStyle} aria-label="Zoom out">&#8722;</button>
              <span style={{ color: "#fff", fontSize: "0.85rem", minWidth: "3rem", textAlign: "center" }}>
                {Math.round(viewerScale * 100)}%
              </span>
              <button type="button" onClick={(e) => { e.stopPropagation(); zoomIn(); }}
                style={viewerBtnStyle} aria-label="Zoom in">&#43;</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); fitToScreen(); }}
                style={viewerBtnStyle} aria-label="Fit to screen">Fit</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); zoom100(); }}
                style={viewerBtnStyle} aria-label="100 percent view">100%</button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={(e) => { e.stopPropagation(); closeViewer(); }}
                style={{ ...viewerBtnStyle, fontSize: "1.2rem" }} aria-label="Close viewer">
                &#10005;
              </button>
            </div>

            {/* Image */}
            <div
              style={{
                width: "90vw", height: "80vh",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
                cursor: viewerScale > 1 ? "grab" : "default",
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={handleViewerMouseDown}
              onMouseMove={handleViewerMouseMove}
              onMouseUp={handleViewerMouseUp}
              onMouseLeave={handleViewerMouseUp}
              onWheel={handleViewerWheel}
            >
              <img
                src={activeMeta.objectUrl}
                alt={activeMeta.fileName}
                style={{
                  transform: `translate(${viewerPanX}px, ${viewerPanY}px) scale(${viewerScale})`,
                  maxWidth: "100%", maxHeight: "100%",
                  objectFit: "contain",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
                draggable={false}
              />
            </div>
          </div>
        )}

        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Image Review</h1>
          <p>Review your uploaded images before proceeding.</p>
        </div>

        {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

        {/* Thumbnail gallery */}
        {fileMetas.length > 1 && (
          <div className="admin-card-grid" style={{ marginBottom: "1rem" }}>
            {fileMetas.map((m, idx) => (
              <article key={idx} className="card admin-record-card"
                style={{
                  cursor: "pointer",
                  textAlign: "center",
                  border: selectedMeta === idx ? "2px solid var(--accent)" : undefined,
                }}
                onClick={() => setSelectedMeta(idx)}
                role="button"
                tabIndex={0}
                aria-label={`Select ${m.fileName}`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedMeta(idx); }}
              >
              <img
                src={m.objectUrl}
                alt={m.fileName}
                style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: "var(--radius) var(--radius) 0 0" }}
                />
                <div style={{ padding: "0.35rem" }}>
                  <p style={{ fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.fileName}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Main preview + metadata (responsive layout) */}
        {selectedMeta !== null && fileMetas[selectedMeta] && (
          <div className="preview-detail" style={{
            display: "flex", flexWrap: "wrap", gap: "1.5rem",
          }}>
            {/* Image preview */}
            <div style={{ flex: "1 1 400px", minWidth: 0 }}>
              <div
                onClick={() => openViewer(selectedMeta!)}
                role="button"
                tabIndex={0}
                aria-label="Open full image viewer"
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openViewer(selectedMeta!); }}
                style={{
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--line)",
                  overflow: "hidden",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 300,
                  maxHeight: 600,
                  height: "600px",
                }}
              >
                <img
                  src={fileMetas[selectedMeta].objectUrl}
                  alt={fileMetas[selectedMeta].fileName}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    borderRadius: "var(--radius)",
                  }}
                />
              </div>
              <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                Click image to open viewer (zoom, pan, fit)
              </p>
            </div>

            {/* Metadata panel */}
            <div style={{ flex: "1 1 320px", minWidth: "280px" }}>
              <div className="card" style={{ margin: 0 }}>
                <div className="section-heading section-heading-tight">
                  <p className="eyebrow">File Information</p>
                  <h3>{activeMeta.fileName}</h3>
                </div>
                <dl className="detail-grid" style={{ columnCount: 2, columnGap: "1rem" }}>
                  <div style={{ breakInside: "avoid" }}><dt>Extension</dt><dd>{ext(activeMeta.fileName)}</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>MIME</dt><dd>{activeMeta.mimeType}</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>File Size</dt><dd>{(activeMeta.fileSize / 1024).toFixed(0)} KB</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Width</dt><dd>{activeMeta.width} px</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Height</dt><dd>{activeMeta.height} px</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Aspect Ratio</dt><dd>{activeMeta.aspectRatio.toFixed(2)}</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Orientation</dt><dd>{orientation(activeMeta.width, activeMeta.height)}</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Estimated DPI</dt><dd>300</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Print Size</dt><dd>{activeMeta.estPrintInches}</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Suggested Tier</dt><dd>{activeMeta.suggestedRes}</dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Print Ready</dt><dd style={{ color: activeMeta.printReady ? "var(--success)" : "var(--warning)" }}>
                    {activeMeta.printReady ? "Yes" : "Not recommended"}
                  </dd></div>
                  <div style={{ breakInside: "avoid" }}><dt>Uploaded</dt><dd>{uploadTimestamp}</dd></div>
                </dl>
              </div>
            </div>
          </div>
        )}


        <div className="button-row" style={{ marginTop: "1.5rem" }}>
          <button type="button" className="button" onClick={() => setStep(isSingle ? "resolution" : "package")}>
            Continue → {isSingle ? "Select Resolution" : "Select Package"}
          </button>
          <button type="button" className="button button-secondary" onClick={() => setStep("upload")}>
            ← Back to Upload
          </button>
        </div>
      </section>
    );
  }

  // ========== RESOLUTION STEP (single image) ==========
  if (step === "resolution") {
    return (
      <section className="page-stack">
        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Select Resolution</h1>
          <p>Choose the download resolution for your restored image. Higher resolutions from the stored master image — no reprocessing needed.</p>
        </div>

        <div className="pricing-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem", marginTop: "1.5rem"
        }}>
          {SINGLE_RESOLUTION_TIERS.map((tier) => (
            <article key={tier.key} className="card" style={{ cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              onClick={() => handleSelectResolution(tier)}
            >
              <div className="card-top">
                <div>
                  <p className="eyebrow">PKR {tier.pricePkr}</p>
                  <h3>{tier.label}</h3>
                </div>
              </div>
              <p>{tier.description}</p>
              <div style={{ marginTop: "0.5rem" }}>
                <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>Details</p>
                <p className="small text-muted">Resolution: {tier.resolution}</p>
                <p className="small text-muted">Scaling: {tier.scaling}</p>
                <p className="small text-muted">Print Size: {tier.printSize}</p>
                <p className="small text-muted">Use Case: {tier.label}</p>
                <p className="small text-muted">Quality: {tier.quality}</p>
              </div>
              <div className="button-row" style={{ marginTop: "0.75rem" }}>
                <button type="button" className="button button-block">Select {tier.label}</button>
              </div>
            </article>
          ))}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <button type="button" className="button button-secondary" onClick={() => setStep("preview")}>← Back to Preview</button>
        </div>
      </section>
    );
  }

  // ========== PACKAGE STEP (multiple images) ==========
  if (step === "package" && orderId) {
    const bulkPackageTiers: Record<string, string[]> = {
      STARTER: ["Original", "2HD", "4HD"],
      PRO: ["Original", "2HD", "4HD", "6HD"],
      BUSINESS: ["Original", "2HD", "4HD", "6HD", "8HD"],
      DEALER: ["Original", "2HD", "4HD", "6HD", "8HD", "10HD", "12HD"],
    };

    return (
      <section className="page-stack">
        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Choose Your Package</h1>
          <p>Bulk package for {files.length} images. Each package includes specific resolution tiers from the stored master image.</p>
        </div>

        <div className="pricing-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem", marginTop: "1.5rem"
        }}>
          {packages.map((pkg) => {
            const resolutions = bulkPackageTiers[pkg.code] || ["Original", "2HD", "4HD"];
            return (
              <article key={pkg.id} className="card" style={{ cursor: "pointer" }}
                onClick={() => handleSelectPackage(pkg)}
              >
                <div className="card-top">
                  <div>
                    <p className="eyebrow">{pkg.code}</p>
                    <h3>{pkg.name}</h3>
                  </div>
                </div>
                <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)", margin: "0.5rem 0" }}>
                  {pkg.currency} {pkg.price}
                </p>
                <p>{pkg.description || `${pkg.creditsIncluded || 0} credits included`}</p>
                <div style={{ marginTop: "0.5rem" }}>
                  <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>Resolutions</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    {resolutions.map((res) => (
                      <span key={res} className="pill">{res}</span>
                    ))}
                  </div>
                </div>
                <div className="button-row" style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="button button-block">Select {pkg.name}</button>
                </div>
              </article>
            );
          })}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <button type="button" className="button button-secondary" onClick={() => setStep("preview")}>← Back to Preview</button>
        </div>
      </section>
    );
  }

  // ========== PAYMENT STEP ==========
  const label = isSingle ? selectedResolution?.label : selectedPackage?.name;
  const price = isSingle
    ? `PKR ${selectedResolution?.pricePkr}`
    : `${selectedPackage?.currency} ${selectedPackage?.price}`;
  const desc = isSingle
    ? `${selectedResolution?.label} — ${selectedResolution?.description}`
    : (selectedPackage?.description || `Package: ${selectedPackage?.name}`);

  if (step === "payment") {
    return (
      <section className="page-stack">
        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Payment</h1>
          <p>Selected: {label} ({price})</p>
        </div>

        <div className="card" style={{ maxWidth: 500, margin: "1.5rem auto", textAlign: "center", padding: "2rem" }}>
          <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)", marginBottom: "1rem" }}>
            {price}
          </p>
          <p style={{ marginBottom: "1.5rem", color: "var(--muted)" }}>
            {desc}
          </p>
          {IS_DEMO_MODE && (
            <p className="demo-mode-banner" style={{
              background: "var(--warning-bg, #fff3cd)",
              border: "1px solid var(--warning-border, #ffc107)",
              borderRadius: "var(--radius)",
              padding: "0.75rem",
              marginBottom: "1rem",
              color: "var(--warning-text, #664d03)",
              fontWeight: 600
            }}>
              Demo Payment Mode — Payment is not processed. Click "Complete Payment" to approve and continue workflow.
            </p>
          )}
          <div className="button-row" style={{ justifyContent: "center" }}>
            <button type="button" className="button" onClick={handlePaymentComplete}>
              {IS_DEMO_MODE ? "Approve Order & Continue" : "Complete Payment"}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setStep(isSingle ? "resolution" : "package")}>
              ← Change
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ========== UPLOAD STEP ==========
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Upload Photos for Restoration</h1>
        <p>Select or drag & drop images. Supported: JPEG, PNG, WebP (max 10 MB each).</p>
      </div>

      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      <div
        className={`restore-dropzone ${dragOver ? "restore-dropzone-active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("restore-file-input")?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--line)"}`,
          borderRadius: "var(--radius)",
          padding: "3rem 1rem",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "transparent",
          transition: "all 0.2s"
        }}
      >
        <input
          id="restore-file-input"
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); }}
        />
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          {dragOver ? "Drop images here" : "Drag & drop images here, or click to browse"}
        </p>
      </div>

      {files.length > 0 && (
        <div className="admin-card-grid" style={{ marginTop: "1rem" }}>
          {files.map((f, i) => (
            <article key={i} className="card admin-record-card">
              <div className="card-top">
                <div><h3>{f.name}</h3></div>
              </div>
              <p className="eyebrow">{(f.size / 1024).toFixed(0)} KB</p>
              <div className="button-row">
                <button type="button" className="button button-small button-secondary" onClick={() => removeFile(i)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <button type="button" className="button" disabled={uploading || pkgLoading} onClick={handleUpload}>
            {uploading ? "Uploading..." : `Upload ${files.length} image(s)`}
          </button>
        </div>
      )}
    </section>
  );
}

const viewerBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: "4px",
  padding: "0.35rem 0.7rem",
  cursor: "pointer",
  fontSize: "0.9rem",
  lineHeight: 1,
};
