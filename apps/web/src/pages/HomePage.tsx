import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";

const LOCAL_REMOVER_URL = import.meta.env.VITE_LOCAL_REMOVER_URL || "";
const LOCAL_REMOVER_MODE = import.meta.env.VITE_LOCAL_REMOVER_MODE || "remove-bg";
const DISABLE_PREVIEW_LIMIT = import.meta.env.VITE_DISABLE_PREVIEW_LIMIT === "true";
const PREVIEW_CLIENT_STORAGE_KEY = "aps-preview-client-id";

const fallbackProduct = "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=80";

const serviceCards = [
  ["Remove background", "/background-removal"],
  ["Brightness / enhance", "/enhancement"],
  ["Auto crop", "/enhancement"],
  ["Auto center", "/enhancement"],
  ["Flat lay", "/flat-lay"],
  ["Lifestyle scenes", "/lifestyle"],
  ["Virtual model", "/virtual-model"],
  ["Product video", "/videos"],
  ["Batch processing", "/pricing"],
  ["Daraz ready", "/pricing"],
  ["Shopify ready", "/pricing"],
  ["Meta ads ready", "/pricing"]
] as const;

const showcaseSlides = [
  { title: "Original image", detail: "Start with any product shot from your phone.", tone: "original" },
  { title: "Background removed", detail: "Cut out the product for clean transparent exports.", tone: "cutout" },
  { title: "White background", detail: "Generate catalog-safe white photos for marketplaces.", tone: "white" },
  { title: "Auto crop", detail: "Frame every product consistently for listings.", tone: "crop" },
  { title: "Brightness / enhancement", detail: "Lift shadows and sharpen details without reshooting.", tone: "enhance" },
  { title: "Flat lay", detail: "Create premium overhead compositions for stores.", tone: "flatlay" },
  { title: "Lifestyle scene", detail: "Place products into tasteful commercial scenes.", tone: "lifestyle" },
  { title: "Virtual model", detail: "Preview apparel and accessories with model-style output.", tone: "model" },
  { title: "Product video", detail: "Prepare motion-ready product visuals for reels.", tone: "video" },
  { title: "Meta ad creative", detail: "Build campaign-ready visuals for Facebook and Instagram.", tone: "meta" },
  { title: "Daraz ready image", detail: "Export centered, clean, marketplace-ready photos.", tone: "daraz" }
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

  const currentSlide = showcaseSlides[activeSlide];
  const beforeImage = sourcePreview || fallbackProduct;
  const afterImage = resultPreview || sourcePreview || fallbackProduct;

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

  const clearFile = () => {
    setFile(null);
  };

  const processLocally = (file: File) =>
    new Promise<Blob>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 1200;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to create image preview"));
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size, size);
        const scale = Math.min(900 / image.width, 900 / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (size - width) / 2;
        const y = (size - height) / 2;
        context.shadowColor = "rgba(20, 83, 45, 0.16)";
        context.shadowBlur = 34;
        context.shadowOffsetY = 26;
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

  const removeBackground = async () => {
    if (!selectedFile) return;
    setUploadState("working");
    setUploadError(null);
    try {
      if (!DISABLE_PREVIEW_LIMIT) {
        await customerApi.claimWebPreview(previewToken, {
          fileName: selectedFile.name,
          contentType: selectedFile.type || "image/png",
          previewClientId
        });
      }
      const blob = removerUrl
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
    return `${selectedFile.type || "image"} · ${size}`;
  }, [selectedFile]);

  return (
    <div className="home-page premium-home">
      <section className="hero-grid premium-hero">
        <div className="hero-copy">
          <p className="eyebrow">Pakistan ecommerce photo studio</p>
          <h1>Premium AI product photos in seconds.</h1>
          <p className="section-lead">
            Remove backgrounds, clean up lighting, center products, and export marketplace-ready images for Daraz,
            Shopify, WooCommerce, Facebook, and Instagram.
          </p>

          <div className={`upload-card premium-upload ${dragActive ? "upload-card-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
            <div className="upload-card-head">
              <div>
                <span className="upload-icon">+</span>
                <p className="upload-title">{dragActive ? "Drop your product photo" : "Upload product photo"}</p>
                <p className="upload-copy">PNG, JPG, or WebP. Unlimited previews while testing.</p>
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
              <label className="button button-secondary">
                Choose file
                <input type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
              </label>
              <button type="button" className="button" onClick={removeBackground} disabled={!selectedFile || uploadState === "working"}>
                {uploadState === "working" ? "Processing..." : "Create preview"}
              </button>
            </div>
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
            <img src={afterImage} alt={`${currentSlide.title} product preview`} />
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
            {serviceCards.map(([label, href]) => (
              <Link to={href} className="feature-card" key={label}>
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
