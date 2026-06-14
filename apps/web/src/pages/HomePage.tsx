import { useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";

const LOCAL_REMOVER_URL = import.meta.env.VITE_LOCAL_REMOVER_URL || "";
const LOCAL_REMOVER_MODE = import.meta.env.VITE_LOCAL_REMOVER_MODE || "remove-bg";

const features = [
  ["Remove Background", "/background-removal"],
  ["AI Enhancement", "/enhancement"],
  ["Auto Crop", "/enhancement"],
  ["Auto Center", "/enhancement"],
  ["White Background", "/background-removal"],
  ["Flat Lay", "/flat-lay"],
  ["Lifestyle Scenes", "/lifestyle"],
  ["Virtual Models", "/virtual-model"],
  ["Product Videos", "/videos"],
  ["Batch Processing", "/pricing"],
  ["Daraz Ready", "/pricing"],
  ["Shopify Ready", "/pricing"],
  ["Meta Ads Ready", "/pricing"]
] as const;

const getPreviewClientId = () => {
  if (typeof window === "undefined") return "preview";
  const storageKey = "aps-preview-client-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(storageKey, next);
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
  const removerUrl = buildRemoverUrl();
  const previewToken = status === "ready" ? undefined : undefined;

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
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] || null;
    if (file) setFile(file);
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
      await customerApi.claimWebPreview(previewToken, {
        fileName: selectedFile.name,
        contentType: selectedFile.type || "image/png",
        previewClientId
      });
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

  const beforeImage = sourcePreview || "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=80";
  const afterImage = resultPreview || "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=80";

  return (
    <div className="home-page">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Pakistan ecommerce photo studio</p>
          <h1>AI product photos for Daraz, Shopify, WooCommerce, Facebook, and Instagram.</h1>
          <p className="section-lead">
            Upload one product photo and create clean marketplace images, white backgrounds, social posts, Meta ad
            creatives, and catalog-ready exports priced in PKR.
          </p>

          <div className={`upload-card ${dragActive ? "upload-card-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
            <div>
              <span className="upload-icon">+</span>
              <p className="upload-title">{selectedFile ? selectedFile.name : dragActive ? "Drop your product photo" : "Upload product photo"}</p>
              <p className="upload-copy">PNG, JPG, or WebP. Preview before checkout.</p>
            </div>
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

          <div className="sample-strip" aria-label="Sample product images">
            {[
              "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=260&q=80",
              "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=260&q=80",
              "https://images.unsplash.com/photo-1563170351-be82bc888aa4?auto=format&fit=crop&w=260&q=80",
              "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=260&q=80"
            ].map((src) => (
              <img key={src} src={src} alt="Product sample" />
            ))}
          </div>

          <div className="badge-row">
            {["Daraz", "Shopify", "WooCommerce", "Facebook", "Instagram"].map((badge) => (
              <span className="market-badge" key={badge}>{badge}</span>
            ))}
          </div>
        </div>

        <aside className="showcase-panel" aria-label="AI feature showcase">
          <div className="showcase-preview">
            <span className="before-chip">Original</span>
            <span className="after-chip">Marketplace ready</span>
            <img src={afterImage} alt="AI processed product preview" />
          </div>
          <div className="feature-card-grid">
            {features.map(([label, href]) => (
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
          <h2>Slide from raw product shot to ready-to-sell visual.</h2>
        </div>
        <div className="before-after-slider">
          <img className="before-image" src={beforeImage} alt="Before AI product editing" />
          <div className="after-image-wrap">
            <img src={afterImage} alt="After AI product editing" />
          </div>
          <span className="slider-handle" aria-hidden="true" />
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

      <section className="section pricing-local">
        <div className="section-heading">
          <p className="eyebrow">Pakistan payments</p>
          <h2>PKR pricing with local payment options.</h2>
        </div>
        <div className="pricing-grid">
          <article className="pricing-card pricing-card-highlight">
            <p className="eyebrow">Starter</p>
            <h3>PKR 1,500</h3>
            <p>50 image credits for new sellers.</p>
            <Link to="/register" className="button button-block">Start in PKR</Link>
          </article>
          <article className="pricing-card">
            <p className="eyebrow">Growth</p>
            <h3>PKR 4,500</h3>
            <p>200 credits for catalog teams and agencies.</p>
            <Link to="/pricing" className="button button-secondary button-block">View packages</Link>
          </article>
        </div>
        <div className="payment-row">
          <span>JazzCash</span>
          <span>Bank Transfer</span>
        </div>
      </section>
    </div>
  );
}
