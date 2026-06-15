import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";

type UploadState = "idle" | "opening" | "working" | "done" | "error";
type PreviewLayout = "portrait" | "landscape" | "square";

const serviceCards = [
  { title: "Enhancement", body: "Brighten, sharpen, and clean ecommerce product photos.", href: "/enhancement" },
  { title: "Auto crop", body: "Consistent product framing for catalogs and listings.", href: "/enhancement" },
  { title: "Flat lay", body: "Overhead product visuals for premium store pages.", href: "/flat-lay" },
  { title: "Lifestyle scenes", body: "Commercial scene previews for ads and storefronts.", href: "/lifestyle" },
  { title: "Virtual model", body: "Model-style previews for fashion and accessories.", href: "/virtual-model" },
  { title: "Product video", body: "Motion-ready product creative for reels and ads.", href: "/videos" },
  { title: "Daraz ready", body: "Clean exports for Daraz listing images.", href: "/pricing" },
  { title: "Shopify ready", body: "Polished product photos for Shopify stores.", href: "/pricing" },
  { title: "Meta ads ready", body: "Facebook and Instagram creative sizes.", href: "/pricing" }
];

const demoProduct =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620">
      <rect width="900" height="620" rx="34" fill="#f8fbf8"/>
      <rect x="100" y="74" width="700" height="470" rx="28" fill="#e6f4ea"/>
      <circle cx="650" cy="190" r="96" fill="#bbf7d0"/>
      <ellipse cx="450" cy="505" rx="175" ry="28" fill="#cfe5d4"/>
      <path d="M315 405c80-128 166-206 258-234 54 54 82 120 80 198-96 50-211 62-338 36z" fill="#f97316"/>
      <path d="M352 358c63-80 132-130 209-150 30 34 47 76 51 126-74 35-160 43-260 24z" fill="#ffffff"/>
      <path d="M410 298l42 62 116-98" fill="none" stroke="#ef4444" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  );

const getPreviewLayout = (width: number, height: number): PreviewLayout => {
  const aspectRatio = width / height;
  if (aspectRatio < 0.8) return "portrait";
  if (aspectRatio > 1.2) return "landscape";
  return "square";
};

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
};

const clearPreviewState = () => {
  if (typeof window === "undefined") return;
  const clearMatchingKeys = (storage: Storage) => {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
    keys
      .filter((key) => {
        const normalized = key.toLowerCase();
        return normalized.includes("preview") || normalized.includes("quota") || normalized.includes("limit");
      })
      .forEach((key) => storage.removeItem(key));
  };
  clearMatchingKeys(window.localStorage);
  clearMatchingKeys(window.sessionStorage);
  document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter(Boolean)
    .filter((name) => {
      const normalized = name.toLowerCase();
      return normalized.includes("preview") || normalized.includes("quota") || normalized.includes("limit");
    })
    .forEach((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    });
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",");
      if (!base64) {
        reject(new Error("Unable to read the selected image"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image"));
    reader.readAsDataURL(file);
  });

const base64ToBlobUrl = (bodyBase64: string, contentType: string) => {
  const binary = window.atob(bodyBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: contentType || "image/png" }));
};

export function HomePage() {
  const { status } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [resultPreview, setResultPreview] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadDimensions, setDownloadDimensions] = useState<{ standard: string; hd: string } | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const previewToken = status === "ready" ? undefined : undefined;

  useEffect(() => {
    clearPreviewState();
  }, []);

  const resetResult = () => {
    if (resultPreview) URL.revokeObjectURL(resultPreview);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setResultPreview(null);
    setDownloadUrl(null);
    setDownloadDimensions(null);
  };

  const setFile = (file: File | null) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadState(file ? "idle" : "idle");
    resetResult();
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourcePreview(file ? URL.createObjectURL(file) : null);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] || null;
    if (file) setFile(file);
  };

  const clearFile = () => setFile(null);

  const openFilePicker = () => {
    setUploadState("opening");
    window.setTimeout(() => {
      setUploadState((current) => (current === "opening" ? "idle" : current));
    }, 900);
  };

  const removeBackground = async () => {
    if (!selectedFile) return;
    setUploadState("working");
    setUploadError(null);
    resetResult();

    try {
      const bodyBase64 = await fileToBase64(selectedFile);
      const result = await customerApi.removeBackgroundPreview(previewToken, {
        fileName: selectedFile.name,
        contentType: selectedFile.type || "image/png",
        selectedActions: ["remove-background"],
        bodyBase64
      });

      const nextUrl = base64ToBlobUrl(result.bodyBase64, result.contentType);
      setResultPreview(nextUrl);
      setDownloadUrl(nextUrl);
      setUploadState("done");

      const isTransparent = result.contentType.includes("png") && !result.contentType.includes("jpeg");
      try {
        const dims = await getImageDimensions(nextUrl);
        const layout = getPreviewLayout(dims.width, dims.height);
        const standardDim = layout === "portrait" ? "1200x1600" : layout === "landscape" ? "1200x900" : "1200x1200";
        const hdDim = layout === "portrait" ? "2400x3200" : layout === "landscape" ? "2400x1800" : "2400x2400";
        setDownloadDimensions({ standard: standardDim, hd: hdDim });
      } catch {
        setDownloadDimensions({ standard: "1200x1200", hd: "2400x2400" });
      }
    } catch (err) {
      setUploadState("error");
      if (err instanceof Error) {
        if (err.message.includes("Failed to fetch")) {
          setUploadError("Unable to connect to the background removal service. Please try again later.");
        } else if (err.message.includes("payload") || err.message.includes("large")) {
          setUploadError("Image file is too large. Please use an image smaller than 10MB.");
        } else {
          setUploadError(err.message);
        }
      } else {
        setUploadError("Unable to remove the background");
      }
    }
  };

  const selectedMeta = useMemo(() => {
    if (!selectedFile) return null;
    const size = selectedFile.size > 1024 * 1024
      ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`;
    return `${selectedFile.type || "image"} - ${size}`;
  }, [selectedFile]);

  const chooseLabel = uploadState === "opening" ? "Opening..." : "Choose file";
  const removeLabel = uploadState === "working" ? "Processing..." : "Remove background";

  const displayImage = resultPreview || sourcePreview;
  const previewAlt = resultPreview ? "Processed product preview with background removed" : sourcePreview ? "Uploaded product preview" : "Demo product image";

  return (
    <div className="home-page premium-home">
      <section className="bg-remover-hero">
        <div className="hero-copy bg-remover-copy">
          <p className="eyebrow">AI product photo studio</p>
          <h1>AI Background Remover</h1>
          <p className="section-lead">
            Upload product photo and create Daraz, Shopify, WooCommerce and Meta ready images.
          </p>

          <div className={`upload-card bg-upload-card ${dragActive ? "upload-card-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
            <div className="upload-card-head">
              <div>
                <span className="upload-icon">+</span>
                <p className="upload-title">{dragActive ? "Drop your product photo" : "Upload product photo"}</p>
                <p className="upload-copy">PNG, JPG, or WebP.</p>
              </div>
            </div>

            {sourcePreview ? (
              <div className="selected-preview-card">
                <img src={sourcePreview} alt={`Selected product preview: ${selectedFile?.name || "product image"}`} />
                <div>
                  <strong>{selectedFile?.name}</strong>
                  <span>{selectedMeta}</span>
                </div>
                <button type="button" className="button button-small button-ghost" onClick={clearFile}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="empty-preview">
                <span>Drop a product image here or choose a file.</span>
              </div>
            )}

            <div className="button-row">
              <label className="button button-secondary choose-file-button" onClick={openFilePicker}>
                {chooseLabel}
                <input type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
              </label>
              <button type="button" className="button remove-bg-button" onClick={removeBackground} disabled={!selectedFile || uploadState === "working"}>
                {removeLabel}
              </button>
            </div>

            {uploadState === "working" && <p className="helper-text">Removing the background...</p>}
            {uploadError && <p className="form-error-panel">{uploadError}</p>}
          </div>
        </div>

        <aside className="bg-preview-card" aria-label="Background removal preview">
          <div className="preview-card-head">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>Background removal result</h2>
            </div>
            <span className={sourcePreview ? "status-pill ready" : "status-pill"}>{sourcePreview ? "Upload ready" : "Waiting for upload"}</span>
          </div>

          <div className="single-preview-stage checkerboard">
            {displayImage ? (
              <img src={displayImage} alt={previewAlt} />
            ) : (
              <div className="preview-empty-state demo-preview-state">
                <img src={demoProduct} alt="Demo product before upload" />
                <strong>Upload preview appears here</strong>
                <span>Choose a product photo to replace this demo.</span>
              </div>
            )}
          </div>

          {sourcePreview && resultPreview && downloadDimensions && (
            <div className="download-section">
              <p className="success-text">Background removed successfully</p>
              <div className="download-options">
                <button type="button" className="button button-secondary" onClick={() => { if (downloadUrl) { const a = document.createElement('a'); a.href = downloadUrl; a.download = 'product-standard.png'; a.click(); } }}>
                  Download Standard PNG<br /><span className="dimension">{downloadDimensions.standard}</span>
                </button>
                <button type="button" className="button button-secondary" onClick={() => { if (downloadUrl) { const a = document.createElement('a'); a.href = downloadUrl; a.download = 'product-hd.png'; a.click(); } }}>
                  Download HD PNG<br /><span className="dimension">{downloadDimensions.hd}</span>
                </button>
              </div>
              <p className="transparent-png">Transparent background</p>
              <div className="marketplace-ready">
                <span>Marketplace ready</span>
              </div>
            </div>
          )}

          {sourcePreview && !resultPreview && (
            <div className="download-section">
              <p className="placeholder-text">Your processed image will appear here after background removal.</p>
            </div>
          )}
        </aside>
      </section>

      <section className="section services-section" id="services">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Services</p>
            <h2>More product photo tools for ecommerce teams.</h2>
          </div>
          <div className="marketplace-mini-row" aria-label="Supported channels and payments">
            {["Daraz", "Shopify", "WooCommerce", "Facebook", "Instagram", "JazzCash", "Bank Transfer", "PKR pricing"].map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        </div>
        <div className="services-grid">
          {serviceCards.map((service) => (
            <Link to={service.href} className="service-tile" key={service.title}>
              <strong>{service.title}</strong>
              <span>{service.body}</span>
            </Link>
          ))}
        </div>
      </section>

      {showCompareModal && sourcePreview && resultPreview && (
        <div className="modal-overlay" onClick={() => setShowCompareModal(false)} role="dialog" aria-modal="true" aria-label="Compare original and result">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Compare Original vs Result</h3>
              <button type="button" className="modal-close" onClick={() => setShowCompareModal(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div className="interactive-compare bg-compare" style={{ "--compare": "52%" } as CSSProperties & Record<"--compare", string>}>
                <img className="compare-before" src={sourcePreview} alt="Original uploaded product before background removal" />
                <div className="compare-after-wrap">
                  <img src={resultPreview} alt="Product after background removal" />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={52}
                  onChange={(event) => {}}
                  aria-label="Original and removed background comparison"
                />
                <span className="compare-handle" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}