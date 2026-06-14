import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";

const LOCAL_REMOVER_URL = import.meta.env.VITE_LOCAL_REMOVER_URL || "";
const LOCAL_REMOVER_MODE = import.meta.env.VITE_LOCAL_REMOVER_MODE || "remove-bg";
const DISABLE_PREVIEW_LIMIT = import.meta.env.VITE_DISABLE_PREVIEW_LIMIT === "true";
const PREVIEW_CLIENT_STORAGE_KEY = "aps-preview-client-id";

type ActionId =
  | "remove-background"
  | "resize"
  | "auto-crop"
  | "auto-center"
  | "enhancement"
  | "white-background"
  | "flat-lay"
  | "lifestyle-scene"
  | "virtual-model"
  | "product-video"
  | "daraz-ready"
  | "shopify-ready"
  | "meta-ads-ready";

const actionOptions: Array<{ id: ActionId; label: string; supported: boolean }> = [
  { id: "remove-background", label: "Remove background", supported: true },
  { id: "resize", label: "Resize", supported: true },
  { id: "auto-crop", label: "Auto crop", supported: true },
  { id: "auto-center", label: "Auto center", supported: true },
  { id: "enhancement", label: "Brightness / enhancement", supported: true },
  { id: "white-background", label: "White background", supported: true },
  { id: "flat-lay", label: "Flat lay", supported: false },
  { id: "lifestyle-scene", label: "Lifestyle scene", supported: false },
  { id: "virtual-model", label: "Virtual model", supported: false },
  { id: "product-video", label: "Product video", supported: false },
  { id: "daraz-ready", label: "Daraz ready", supported: true },
  { id: "shopify-ready", label: "Shopify ready", supported: true },
  { id: "meta-ads-ready", label: "Meta ads ready", supported: true }
];

const defaultActions: ActionId[] = ["remove-background", "auto-crop", "auto-center"];

const fallbackProduct =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700">
      <rect width="900" height="700" fill="#f4f8f4"/>
      <rect x="170" y="125" width="560" height="420" rx="38" fill="#ffffff" stroke="#d9e7dc" stroke-width="6"/>
      <ellipse cx="450" cy="525" rx="180" ry="28" fill="#dcebe0"/>
      <path d="M285 420c105-145 220-220 335-235 45 55 62 120 50 195-120 36-248 50-385 40z" fill="#f97316"/>
      <path d="M315 382c94-108 192-166 296-176 25 38 39 82 41 130-94 34-206 50-337 46z" fill="#ffffff"/>
      <path d="M362 330c72-56 145-88 220-96" stroke="#d1d5db" stroke-width="18" stroke-linecap="round"/>
      <path d="M402 286l42 78 155-112" fill="none" stroke="#ef4444" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  );

const serviceCards: Array<[string, string, ActionId]> = [
  ["Remove background", "/background-removal", "remove-background"],
  ["Brightness / enhance", "/enhancement", "enhancement"],
  ["Auto crop", "/enhancement", "auto-crop"],
  ["Auto center", "/enhancement", "auto-center"],
  ["Flat lay", "/flat-lay", "flat-lay"],
  ["Lifestyle scenes", "/lifestyle", "lifestyle-scene"],
  ["Virtual model", "/virtual-model", "virtual-model"],
  ["Product video", "/videos", "product-video"],
  ["Batch processing", "/pricing", "resize"],
  ["Daraz ready", "/pricing", "daraz-ready"],
  ["Shopify ready", "/pricing", "shopify-ready"],
  ["Meta ads ready", "/pricing", "meta-ads-ready"]
];

const showcaseSlides = [
  { id: "original", title: "Original image", detail: "Start with any product shot from your phone.", tone: "original" },
  { id: "remove-background", title: "Background removed", detail: "Cut out the product for clean transparent exports.", tone: "cutout" },
  { id: "white-background", title: "White background", detail: "Generate catalog-safe white photos for marketplaces.", tone: "white" },
  { id: "auto-crop", title: "Auto crop", detail: "Frame every product consistently for listings.", tone: "crop" },
  { id: "enhancement", title: "Brightness / enhancement", detail: "Lift shadows and sharpen details without reshooting.", tone: "enhance" },
  { id: "flat-lay", title: "Flat lay", detail: "Create premium overhead compositions for stores.", tone: "flatlay" },
  { id: "lifestyle-scene", title: "Lifestyle scene", detail: "Place products into tasteful commercial scenes.", tone: "lifestyle" },
  { id: "virtual-model", title: "Virtual model", detail: "Preview apparel and accessories with model-style output.", tone: "model" },
  { id: "product-video", title: "Product video", detail: "Animated product motion preview for reels.", tone: "video" },
  { id: "meta-ads-ready", title: "Meta ad creative", detail: "Build campaign-ready visuals for Facebook and Instagram.", tone: "meta" },
  { id: "daraz-ready", title: "Daraz ready image", detail: "Export centered, clean, marketplace-ready photos.", tone: "daraz" },
  { id: "shopify-ready", title: "Shopify ready image", detail: "Polished product visuals for Shopify storefronts.", tone: "shopify" }
] as const;

const clearPreviewStorage = () => {
  if (typeof window === "undefined") return;
  const clearMatchingKeys = (storage: Storage) => {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
    keys.filter((key) => key.toLowerCase().includes("preview")).forEach((key) => storage.removeItem(key));
  };
  clearMatchingKeys(window.localStorage);
  clearMatchingKeys(window.sessionStorage);
};

const getPreviewClientId = () => {
  if (typeof window === "undefined") return "preview";
  if (DISABLE_PREVIEW_LIMIT) {
    clearPreviewStorage();
    return "preview-limit-disabled";
  }
  const existing = window.localStorage.getItem(PREVIEW_CLIENT_STORAGE_KEY);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(PREVIEW_CLIENT_STORAGE_KEY, next);
  return next;
};

const buildRemoverUrl = () => {
  if (!LOCAL_REMOVER_URL) return "";
  return `${LOCAL_REMOVER_URL.replace(/\/+$/, "")}/${LOCAL_REMOVER_MODE === "white" ? "product-white" : "remove-bg"}`;
};

export function HomePage() {
  const { status } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewClientId] = useState(getPreviewClientId);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [resultPreview, setResultPreview] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [compareValue, setCompareValue] = useState(52);
  const [selectedActions, setSelectedActions] = useState<ActionId[]>(defaultActions);
  const removerUrl = buildRemoverUrl();
  const previewToken = status === "ready" ? undefined : undefined;

  useEffect(() => {
    if (DISABLE_PREVIEW_LIMIT) clearPreviewStorage();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % showcaseSlides.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  const selectedActionSet = useMemo(() => new Set(selectedActions), [selectedActions]);
  const currentSlide = showcaseSlides[activeSlide];
  const beforeImage = sourcePreview || fallbackProduct;
  const afterImage = resultPreview || sourcePreview || fallbackProduct;
  const comingSoonActions = actionOptions.filter((action) => selectedActionSet.has(action.id) && !action.supported);

  const resetResult = () => {
    if (resultPreview) URL.revokeObjectURL(resultPreview);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setResultPreview(null);
    setDownloadUrl(null);
  };

  const setFile = (file: File | null) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadState("idle");
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

  const toggleAction = (action: ActionId) => {
    setSelectedActions((current) => {
      if (current.includes(action)) {
        const next = current.filter((item) => item !== action);
        return next.length > 0 ? next : current;
      }
      return [...current, action];
    });
  };

  const getWorkflowMode = () => {
    if (selectedActionSet.has("white-background") || selectedActionSet.has("remove-background") || selectedActionSet.has("daraz-ready") || selectedActionSet.has("shopify-ready")) {
      return "WHITE_BACKGROUND";
    }
    if (selectedActionSet.has("enhancement") || selectedActionSet.has("meta-ads-ready")) return "SHADOW_ENHANCEMENT";
    return "PRODUCT_STUDIO";
  };

  const processLocally = (file: File) =>
    new Promise<Blob>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const outputSize = selectedActionSet.has("resize") ? 1200 : Math.max(image.width, image.height);
        canvas.width = outputSize;
        canvas.height = outputSize;
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to create image preview"));
          return;
        }
        context.fillStyle = selectedActionSet.has("white-background") || selectedActionSet.has("remove-background") ? "#ffffff" : "#f8fbf8";
        context.fillRect(0, 0, outputSize, outputSize);
        const shouldFit = selectedActionSet.has("resize") || selectedActionSet.has("auto-crop") || selectedActionSet.has("auto-center") || selectedActionSet.has("daraz-ready") || selectedActionSet.has("shopify-ready");
        const maxDraw = shouldFit ? outputSize * 0.76 : outputSize;
        const scale = shouldFit ? Math.min(maxDraw / image.width, maxDraw / image.height) : Math.min(outputSize / image.width, outputSize / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = shouldFit || selectedActionSet.has("auto-center") ? (outputSize - width) / 2 : 0;
        const y = shouldFit || selectedActionSet.has("auto-center") ? (outputSize - height) / 2 : 0;
        if (selectedActionSet.has("enhancement") || selectedActionSet.has("meta-ads-ready")) {
          context.filter = "brightness(1.08) contrast(1.05) saturate(1.08)";
        }
        context.shadowColor = selectedActionSet.has("remove-background") || selectedActionSet.has("white-background") ? "rgba(20, 83, 45, 0.16)" : "transparent";
        context.shadowBlur = selectedActionSet.has("remove-background") || selectedActionSet.has("white-background") ? 34 : 0;
        context.shadowOffsetY = selectedActionSet.has("remove-background") || selectedActionSet.has("white-background") ? 26 : 0;
        context.drawImage(image, x, y, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error("Unable to export PNG"));
        }, "image/png");
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to load the selected image"));
      };
      image.src = objectUrl;
    });

  const createPreview = async () => {
    if (!selectedFile) return;
    setUploadState("working");
    setUploadError(null);
    try {
      if (!DISABLE_PREVIEW_LIMIT) {
        await customerApi.claimWebPreview(previewToken, {
          fileName: selectedFile.name,
          contentType: selectedFile.type || "image/png",
          previewClientId,
          selectedActions
        });
      }

      const hasOnlySupportedPreview = comingSoonActions.length === 0;
      const blob =
        removerUrl && hasOnlySupportedPreview && selectedActionSet.has("remove-background")
          ? await fetch(removerUrl, {
              method: "POST",
              body: selectedFile,
              headers: { "Content-Type": selectedFile.type || "image/png" }
            }).then((response) => {
              if (!response.ok) throw new Error(`Background removal failed (${response.status})`);
              return response.blob();
            })
          : await processLocally(selectedFile);

      resetResult();
      const nextUrl = URL.createObjectURL(blob);
      setResultPreview(nextUrl);
      setDownloadUrl(nextUrl);
      setUploadState("done");
    } catch (err) {
      setUploadState("error");
      setUploadError(err instanceof Error ? err.message : "Unable to process the image");
    }
  };

  const selectedMeta = useMemo(() => {
    if (!selectedFile) return null;
    const size = selectedFile.size > 1024 * 1024
      ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`;
    return `${selectedFile.type || "image"} - ${size}`;
  }, [selectedFile]);

  return (
    <div className="home-page premium-home">
      <section className="hero-grid premium-hero">
        <div className="hero-copy">
          <p className="eyebrow">Pakistan ecommerce photo studio</p>
          <h1>Upload once. Choose the product edits you need.</h1>

          <div className={`upload-card premium-upload ${dragActive ? "upload-card-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
            <div className="upload-card-head">
              <div>
                <span className="upload-icon">+</span>
                <p className="upload-title">{dragActive ? "Drop your product photo" : "Upload product photo"}</p>
                <p className="upload-copy">PNG, JPG, or WebP. Pick actions before creating a preview.</p>
              </div>
              {DISABLE_PREVIEW_LIMIT && <span className="test-badge">Preview limit off</span>}
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
              <label className="button button-secondary choose-file-button">
                Choose file
                <input type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
              </label>
              <button type="button" className="button" onClick={createPreview} disabled={!selectedFile || uploadState === "working"}>
                {uploadState === "working" ? "Processing..." : "Create preview"}
              </button>
            </div>

            <div className="action-picker" aria-label="Select product photo actions">
              {actionOptions.map((action) => (
                <label key={action.id} className={`action-option ${selectedActionSet.has(action.id) ? "selected" : ""}`}>
                  <input type="checkbox" checked={selectedActionSet.has(action.id)} onChange={() => toggleAction(action.id)} />
                  <span>{action.label}</span>
                  {!action.supported && <small>Coming soon</small>}
                </label>
              ))}
            </div>

            <div className="selected-actions-summary">
              <span>Payload actions: {selectedActions.join(", ")}</span>
              <span>Workflow mode: {getWorkflowMode()}</span>
            </div>
            {comingSoonActions.length > 0 && (
              <p className="coming-soon-note">
                {comingSoonActions.map((action) => action.label).join(", ")} will use mock/coming-soon preview treatment for now.
              </p>
            )}
            {uploadError && <p className="form-error-panel">{uploadError}</p>}
            {downloadUrl && (
              <a href={downloadUrl} download="ai-product-photo.png" className="text-link">
                Download preview
              </a>
            )}
          </div>

          <div className="badge-row">
            {["Daraz", "Shopify", "WooCommerce", "Facebook", "Instagram"].map((badge) => (
              <span className="market-badge" key={badge}>{badge}</span>
            ))}
          </div>
          <div className="payment-row">
            <span>JazzCash</span>
            <span>Bank Transfer</span>
            <span>PKR 1,500 starter</span>
          </div>
        </div>

        <aside className="showcase-panel premium-showcase" aria-label="AI feature showcase">
          <div className={`showcase-preview showcase-tone-${currentSlide.tone}`}>
            <span className="before-chip">{currentSlide.title}</span>
            <span className="after-chip">Live showcase</span>
            {currentSlide.id === "product-video" || selectedActionSet.has("product-video") ? (
              <div className="video-preview-card" aria-label="Animated product video preview">
                <span className="video-product" />
                <span className="video-timeline" />
              </div>
            ) : (
              <img src={afterImage} alt={`${currentSlide.title} product preview`} />
            )}
            <div className="showcase-caption">
              <strong>{currentSlide.title}</strong>
              <span>{currentSlide.detail}</span>
            </div>
          </div>
          <div className="slider-dots" aria-label="Service showcase controls">
            {showcaseSlides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                className={index === activeSlide ? "active" : ""}
                onClick={() => setActiveSlide(index)}
                aria-label={`Show ${slide.title}`}
              />
            ))}
          </div>
          <div className="feature-card-grid compact-feature-grid">
            {serviceCards.map(([label, href, action]) => (
              <Link to={href} className={`feature-card ${selectedActionSet.has(action) ? "selected" : ""}`} key={label}>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="section comparison-section">
        <div className="section-heading">
          <p className="eyebrow">Before and after</p>
          <h2>Drag the slider to compare original vs marketplace-ready.</h2>
        </div>
        <div className="interactive-compare" style={{ "--compare": `${compareValue}%` } as CSSProperties & Record<"--compare", string>}>
          <img className="compare-before" src={beforeImage} alt="Original product before AI editing" />
          <div className="compare-after-wrap">
            <img src={afterImage} alt="Product after AI editing" />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={compareValue}
            onChange={(event) => setCompareValue(Number(event.target.value))}
            aria-label="Before and after comparison"
          />
          <span className="compare-handle" aria-hidden="true" />
        </div>
      </section>

      <section className="section marketplace-export">
        <div className="section-heading">
          <p className="eyebrow">Marketplace exports</p>
          <h2>One workflow, every channel your customers already use.</h2>
        </div>
        <div className="export-grid">
          {["Daraz listing images", "Shopify product photos", "Meta ad creatives", "Social media posts"].map((item) => (
            <article className="export-card" key={item}>
              <strong>{item}</strong>
              <span>Clean crops, centered products, and channel-safe sizes.</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
