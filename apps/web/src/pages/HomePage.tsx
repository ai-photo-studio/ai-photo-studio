import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";

type UploadState = "idle" | "opening" | "working" | "done" | "error";

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
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [compareValue, setCompareValue] = useState(52);
  const previewToken = status === "ready" ? undefined : undefined;

  useEffect(() => {
    clearPreviewState();
  }, []);

  const resetResult = () => {
    if (resultPreview) URL.revokeObjectURL(resultPreview);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setResultPreview(null);
    setDownloadUrl(null);
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
    } catch (err) {
      setUploadState("error");
      setUploadError(err instanceof Error ? err.message : "Unable to remove the background");
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

  return (
    <div className="home-page premium-home">
      <section className="bg-remover-hero">
        <div className="hero-copy bg-remover-copy">
          <p className="eyebrow">AI product photo studio</p>
          <h1>AI Background Remover for Product Photos</h1>
          <p className="section-lead">
            Upload product photo and create Daraz, Shopify, WooCommerce and Meta ready images.
          </p>

          <div className={`upload-card bg-upload-card ${dragActive ? "upload-card-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
            <div className="upload-card-head">
              <div>
                <span className="upload-icon">+</span>
                <p className="upload-title">{dragActive ? "Drop your product photo" : "Upload product photo"}</p>
                <p className="upload-copy">PNG, JPG, or WebP. Your image appears in the preview immediately.</p>
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

            {uploadState === "working" && <p className="helper-text">Removing the background. The processed preview will appear on the right.</p>}
            {uploadError && <p className="form-error-panel">{uploadError}</p>}
            {downloadUrl && (
              <a href={downloadUrl} download="ai-product-photo.png" className="text-link">
                Download removed-background preview
              </a>
            )}
          </div>
        </div>

        <aside className="bg-preview-card" aria-label="Background removal preview">
          <div className="preview-card-head">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>Original vs removed background</h2>
            </div>
            <span className={sourcePreview ? "status-pill ready" : "status-pill"}>{sourcePreview ? "Upload ready" : "Waiting for upload"}</span>
          </div>

          <div className="single-preview-stage">
            {sourcePreview ? (
              <img src={resultPreview || sourcePreview} alt={resultPreview ? "Processed product preview" : "Uploaded product preview"} />
            ) : (
              <div className="preview-empty-state demo-preview-state">
                <img src={demoProduct} alt="Demo product before upload" />
                <strong>Upload preview appears here</strong>
                <span>Choose a product photo to replace this demo.</span>
              </div>
            )}
          </div>

          {sourcePreview && resultPreview ? (
          <div className="hero-compare-card">
            <div className="hero-compare-head">
              <strong>Comparison slider</strong>
              <span>Drag to compare</span>
            </div>
              <div className="interactive-compare bg-compare" style={{ "--compare": `${compareValue}%` } as CSSProperties & Record<"--compare", string>}>
                <img className="compare-before" src={sourcePreview} alt="Original uploaded product before background removal" />
                <div className="compare-after-wrap">
                  <img src={resultPreview} alt="Product after background removal" />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={compareValue}
                  onChange={(event) => setCompareValue(Number(event.target.value))}
                  aria-label="Original and removed background comparison"
                />
                <span className="compare-handle" aria-hidden="true" />
              </div>
          </div>
          ) : null}
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
    </div>
  );
}
