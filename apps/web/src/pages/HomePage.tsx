import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePackages } from "../lib/packages";
import { customerApi } from "../services/customerApi";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";

const features = [
  { title: "Background Removal", path: "/background-removal" },
  { title: "Auto Crop", path: "/features#auto-crop" },
  { title: "Auto Center", path: "/features#auto-center" },
  { title: "AI Enhancement", path: "/features#ai-enhancement" },
  { title: "Product Classifier", path: "/features#classifier" },
  { title: "Flat Lay", path: "/flat-lay" },
  { title: "Lifestyle Scenes", path: "/lifestyle-scenes" },
  { title: "Virtual Models", path: "/virtual-models" },
  { title: "Product Videos", path: "/product-videos" },
  { title: "Batch Processing", path: "/features#batch" },
  { title: "Credit System", path: "/pricing" },
  { title: "API Ready", path: "/features#api" },
  { title: "Admin Analytics", path: "/features#analytics" }
];

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
  const { token, status } = useAuth();
  const { packages, loading, error } = usePackages();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewClientId] = useState(getPreviewClientId);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [resultPreview, setResultPreview] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const removerUrl = buildRemoverUrl();
  const previewToken = status === "ready" && token ? token : undefined;

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
    <div className="landing-page page-stack">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>Remove backgrounds from product photos.</h1>
          <p className="section-lead">
            Upload a product image and get a clean, transparent background in seconds.
          </p>
          <div className="hero-actions">
            <label className="button button-upload">
              Upload product photo
              <input type="file" accept="image/*" onChange={onFileChange} className="sr-only" />
            </label>
            <Link to="/pricing" className="button button-secondary">
              See pricing
            </Link>
          </div>
        </div>

        <div className="landing-hero-panel">
          <div className="showcase-panel">
            <p className="eyebrow">Upload area</p>
            <div
              className="upload-dropzone"
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              <p className="upload-dropzone-title">{dragActive ? "Drop the product photo here" : "Drag and drop a product photo"}</p>
              <p className="upload-dropzone-copy">PNG, JPG, or WebP. Free preview available.</p>
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

          <div className="showcase-panel">
            <p className="eyebrow">Before / After</p>
            <BeforeAfterSlider beforeSrc={beforeImage} afterSrc={afterImage} />
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <h2>All AI Features</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <Link to={feature.path} className="text-link">Learn more →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <h2>Pricing</h2>
        </div>

        {loading ? (
          <div className="state-panel">
            <p>Loading plans...</p>
          </div>
        ) : error ? (
          <div className="state-panel state-panel-error">
            <p>{error}</p>
          </div>
        ) : packages.length > 0 ? (
          <div className="pricing-grid pricing-grid-wide">
            {packages.slice(0, 3).map((pkg) => (
              <article key={pkg.id} className="pricing-card pricing-card-featured">
                <div className="pricing-card-top">
                  <h2>{pkg.name}</h2>
                  <p className="price">
                    {pkg.currency} {pkg.price}
                  </p>
                </div>
                <p>{pkg.description || "A credit bundle for polished ecommerce imagery."}</p>
                <Link to="/signup" className="button button-block">
                  Get started
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="state-panel">
            <p>Plan details will appear here once the catalog is populated.</p>
          </div>
        )}
      </section>

      <section className="whatsapp-cta">
        <div>
          <h2>Get started now.</h2>
          <p>Upload a product photo and get a clean, marketplace-ready image in seconds.</p>
        </div>
        <div className="hero-actions">
          <Link to="/signup" className="button">
            Start now
          </Link>
          <Link to="/pricing" className="button button-secondary">
            See pricing
          </Link>
        </div>
      </section>
    </div>
  );
}