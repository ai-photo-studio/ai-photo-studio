import { useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";

const LOCAL_REMOVER_URL = import.meta.env.VITE_LOCAL_REMOVER_URL || "";
const LOCAL_REMOVER_MODE = import.meta.env.VITE_LOCAL_REMOVER_MODE || "remove-bg";

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
        context.clearRect(0, 0, size, size);
        const scale = Math.min(900 / image.width, 900 / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (size - width) / 2;
        const y = (size - height) / 2;
        context.shadowColor = "rgba(17, 75, 60, 0.18)";
        context.shadowBlur = 34;
        context.shadowOffsetY = 28;
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
            headers: {
              "Content-Type": selectedFile.type || "image/png"
            }
          }).then((response) => {
            if (!response.ok) throw new Error(`Background removal failed (${response.status})`);
            return response.blob();
          })
        : await processLocally(selectedFile);
      if (resultPreview) URL.revokeObjectURL(resultPreview);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const nextUrl = URL.createObjectURL(blob);
      setResultPreview(nextUrl);
      setDownloadUrl(nextUrl);
      setUploadState("done");
    } catch (err) {
      setUploadState("error");
      setUploadError(err instanceof Error ? err.message : "Unable to process the image");
    }
  };

  const beforeImage = sourcePreview || "https://images.unsplash.com/photo-1555527770-2df52954a47e?f=auto&q=80&w=800";
  const afterImage = resultPreview || "https://images.unsplash.com/photo-1555527770-2df52954a47e?f=auto&q=80&w=800";

  return (
    <div className="landing-page">
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Photo Studio</strong>
            <small>AI product photography</small>
          </span>
        </Link>
        <nav className="site-nav">
          <Link to="/pricing" className="nav-link">Pricing</Link>
          <Link to="/login" className="nav-link">Login</Link>
          <Link to="/signup" className="button">Sign Up</Link>
        </nav>
      </header>

      <main className="site-main">
        <section className="hero">
          <div className="hero-container">
            <h1>Remove backgrounds from product photos</h1>
            <p className="section-lead">
              Upload a product image and get a clean, transparent background in seconds.
            </p>
            <div className="upload-card" onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
              <div className="upload-content">
                <p className="upload-title">{dragActive ? "Drop the product photo here" : "Drag and drop a product photo"}</p>
                <p className="upload-copy">PNG, JPG, or WebP. Free preview available.</p>
                <div className="button-row">
                  <label className="button button-secondary">
                    Choose file
                    <input type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
                  </label>
                  <button type="button" className="button" onClick={removeBackground} disabled={!selectedFile || uploadState === "working"}>
                    {uploadState === "working" ? "Processing..." : "Process image"}
                  </button>
                </div>
                {uploadError && <p className="form-error-panel">{uploadError}</p>}
              </div>
            </div>

            <div className="example-thumbnails">
              <img src="https://images.unsplash.com/photo-1555527770-2df52954a47e?f=auto&q=80&w=400" alt="Example 1" />
              <img src="https://images.unsplash.com/photo-1567428588258-93b0b5f0c217?f=auto&q=80&w=400" alt="Example 2" />
              <img src="https://images.unsplash.com/photo-1596461404720?f=auto&q=80&w=400" alt="Example 3" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-container">
            <h2>Features</h2>
            <div className="feature-grid">
              <Link to="/background-removal" className="feature-item">Background Removal</Link>
              <Link to="/features" className="feature-item">Auto Crop</Link>
              <Link to="/features" className="feature-item">Auto Center</Link>
              <Link to="/features" className="feature-item">AI Enhancement</Link>
              <Link to="/features" className="feature-item">Product Classifier</Link>
              <Link to="/features" className="feature-item">Flat Lay</Link>
              <Link to="/features" className="feature-item">Lifestyle Scenes</Link>
              <Link to="/features" className="feature-item">Virtual Models</Link>
              <Link to="/features" className="feature-item">Product Videos</Link>
              <Link to="/features" className="feature-item">Batch Processing</Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-container">
            <h2>Before / After</h2>
            <div className="before-after">
              <div className="compare-panel">
                <span className="label">Before</span>
                <img src={beforeImage} alt="Before" />
              </div>
              <div className="compare-panel">
                <span className="label">After</span>
                <img src={afterImage} alt="After" />
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-container">
            <h2>Pricing</h2>
            <div className="pricing-grid">
              <div className="pricing-card">
                <h3>Starter</h3>
                <p className="price">$9<span className="unit">/month</span></p>
                <p>100 credits/month</p>
                <Link to="/signup" className="button">Get started</Link>
              </div>
              <div className="pricing-card">
                <h3>Pro</h3>
                <p className="price">$29<span className="unit">/month</span></p>
                <p>500 credits/month</p>
                <Link to="/signup" className="button">Get started</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-container">
            <h2>FAQ</h2>
            <details className="faq-item">
              <summary>How do I get started?</summary>
              <p>Upload a product photo and use our AI tools to remove backgrounds or enhance images.</p>
            </details>
            <details className="faq-item">
              <summary>What credits are used for?</summary>
              <p>Each credit processes one product photo. Use them for any feature in our studio.</p>
            </details>
          </div>
        </section>

        <footer className="site-footer">
          <p>&copy; 2026 AI Photo Studio. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}