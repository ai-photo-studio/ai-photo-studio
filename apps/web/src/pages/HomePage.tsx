import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePackages } from "../lib/packages";
import { customerApi } from "../services/customerApi";

const canvasData = (draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) => {
  if (typeof document === "undefined") return "";
  const width = 720;
  const height = 520;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  draw(ctx, width, height);
  return canvas.toDataURL("image/png");
};

const drawProductScene = (
  label: string,
  palette: { bg: string; accent: string; secondary: string; surface: string },
  variant: "beauty" | "fashion" | "agriculture" | "packaged" | "accessory"
) =>
  canvasData((ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.bg);
    gradient.addColorStop(1, "#ffffff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const softGlow = ctx.createRadialGradient(width * 0.76, height * 0.18, 40, width * 0.76, height * 0.18, 220);
    softGlow.addColorStop(0, "rgba(255,255,255,0.9)");
    softGlow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = softGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(width * 0.16, height * 0.79, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.secondary;
    ctx.beginPath();
    ctx.arc(width * 0.82, height * 0.48, 96, 0, Math.PI * 2);
    ctx.fill();

    const shadow = (x: number, y: number, w: number, h: number, radius = 24) => {
      ctx.save();
      ctx.shadowColor = "rgba(23, 34, 30, 0.18)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = palette.surface;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
      ctx.restore();
    };

    if (variant === "beauty") {
      shadow(194, 112, 162, 300, 28);
      shadow(356, 272, 184, 122, 28);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(236, 156, 34, 48);
      ctx.fillStyle = "#fefefe";
      ctx.fillRect(232, 126, 42, 58);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(220, 208, 86, 184);
      ctx.fillRect(392, 304, 144, 90);
      ctx.beginPath();
      ctx.ellipse(466, 350, 64, 38, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.38;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (variant === "fashion") {
      shadow(220, 140, 270, 228, 28);
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.moveTo(260, 160);
      ctx.lineTo(450, 160);
      ctx.lineTo(486, 350);
      ctx.lineTo(224, 350);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f8f0e6";
      ctx.fillRect(294, 198, 120, 84);
      ctx.strokeStyle = "rgba(255,255,255,0.72)";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(288, 194);
      ctx.lineTo(416, 194);
      ctx.stroke();
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(354, 186, 22, Math.PI, 0);
      ctx.stroke();
    } else if (variant === "agriculture") {
      shadow(178, 166, 310, 190, 32);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(184, 238, 298, 92);
      ctx.fillStyle = "#e6d2b4";
      ctx.fillRect(214, 170, 238, 84);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 6; i += 1) {
        const x = 240 + i * 34;
        const y = 192 + (i % 2) * 18;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = palette.secondary;
      ctx.beginPath();
      ctx.arc(494, 302, 54, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant === "packaged") {
      shadow(226, 132, 232, 258, 32);
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.moveTo(248, 156);
      ctx.lineTo(430, 156);
      ctx.lineTo(454, 374);
      ctx.lineTo(224, 374);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(286, 222, 112, 58, 18);
      ctx.fill();
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(282, 198);
      ctx.lineTo(418, 198);
      ctx.stroke();
    } else {
      shadow(230, 166, 198, 170, 34);
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.roundRect(252, 188, 184, 124, 34);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(296, 248);
      ctx.lineTo(392, 248);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(424, 306, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(382, 210, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(23,34,30,0.92)";
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillText(label, 42, 72);
  });

const sellerSegments = [
  { title: "Daraz", copy: "Marketplace-ready listing photos that stand out in crowded search results." },
  { title: "Shopify", copy: "Branded storefront visuals that keep product pages consistent and sharp." },
  { title: "WooCommerce", copy: "Catalog images that fit store themes, variant sets, and product grids." },
  { title: "Facebook", copy: "Social selling creatives that feel clean enough for paid and organic posts." },
  { title: "WhatsApp", copy: "Fast seller-to-buyer sharing with simple upload and delivery loops." }
];

const productExamples = [
  {
    title: "Beauty",
    subtitle: "Skincare and cosmetic photos with a premium shelf-ready look.",
    image: drawProductScene("Beauty", { bg: "#f8d9e5", accent: "#d14e83", secondary: "#f4a8bf", surface: "#fff8fb" }, "beauty")
  },
  {
    title: "Fashion",
    subtitle: "Apparel and accessory visuals that feel editorial, not flat.",
    image: drawProductScene("Fashion", { bg: "#efe5d5", accent: "#8f5f3d", secondary: "#d7b08d", surface: "#fffaf5" }, "fashion")
  },
  {
    title: "Agriculture",
    subtitle: "Fresh farm and crop product imagery for supply sellers.",
    image: drawProductScene("Agriculture", { bg: "#dff1da", accent: "#3c8648", secondary: "#a8d48f", surface: "#f7fff4" }, "agriculture")
  },
  {
    title: "Packaged Goods",
    subtitle: "Retail packs, pouches, and boxes made cleaner for ecommerce.",
    image: drawProductScene("Packaged Goods", { bg: "#fff0c7", accent: "#cf9b24", secondary: "#edcf6a", surface: "#fffaf0" }, "packaged")
  },
  {
    title: "Electronics Accessories",
    subtitle: "Cables, chargers, and small tech add-ons with crisp edges.",
    image: drawProductScene("Accessories", { bg: "#dcecff", accent: "#2f6fb9", secondary: "#8ab8e8", surface: "#f5fbff" }, "accessory")
  }
];

const roadmapNow = ["background removal", "white background"];
const roadmapNext = ["flat lay", "lifestyle scenes", "virtual models", "product video"];

const faqs = [
  {
    question: "Who is this for?",
    answer:
      "It is built for ecommerce sellers on Daraz, Shopify, WooCommerce, Facebook, and WhatsApp who need stronger product photos."
  },
  {
    question: "What can I do first?",
    answer:
      "Start with free background removal, then move into clean white-background outputs and paid credit bundles."
  },
  {
    question: "What studio styles are available?",
    answer:
      "Background removal and white background are live now. Flat lay, lifestyle scenes, virtual models, and product video are approved roadmap priorities coming soon."
  },
  {
    question: "Can I use it for different categories?",
    answer:
      "Yes. The product supports beauty, fashion, agriculture products, packaged goods, and electronics accessories."
  }
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

export function HomePage() {
  const { token, status } = useAuth();
  const { packages, loading, error } = usePackages();
  const packagePreview = packages.slice(0, 3);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewClientId] = useState(getPreviewClientId);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [resultPreview, setResultPreview] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [comparePosition, setComparePosition] = useState(58);
  const removerUrl = buildRemoverUrl();
  const previewToken = status === "ready" && token ? token : undefined;

  useEffect(() => {
    return () => {
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
      if (resultPreview) URL.revokeObjectURL(resultPreview);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl, resultPreview, sourcePreview]);

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

  const heroBeforeImage = sourcePreview || productExamples[0].image;
  const heroAfterImage = resultPreview || productExamples[0].image;

  return (
    <div className="landing-page page-stack">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">AI Product Photo Studio for Ecommerce Sellers</p>
          <h1>Upload one product photo and get a cleaner, seller-ready image.</h1>
          <p className="section-lead">
            Made for Daraz, Shopify, WooCommerce, Facebook, and WhatsApp sellers who want better product photos without a studio setup.
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
          <div className="trial-strip" aria-label="Free preview limits">
            <article className="trial-card">
              <strong>Guest</strong>
              <span>1 free preview</span>
            </article>
            <article className="trial-card">
              <strong>New account</strong>
              <span>3 preview credits</span>
            </article>
            <article className="trial-card">
              <strong>Finals</strong>
              <span>Credits unlock full resolution</span>
            </article>
          </div>
          <div className="channel-grid">
            {sellerSegments.map((segment) => (
              <article key={segment.title} className="channel-card">
                <strong>{segment.title}</strong>
                <span>{segment.copy}</span>
              </article>
            ))}
          </div>
          <p className="hero-footnote">
            Built for Daraz, Shopify, WooCommerce, Facebook, and WhatsApp sellers who need cleaner product visuals.
          </p>
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
              <p className="upload-dropzone-copy">PNG, JPG, or WebP. See a preview first, then unlock the full image with credits.</p>
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
              <p className="helper-text">{removerUrl ? "Free preview is ready." : "Free preview is available."}</p>
            </div>
          </div>

          <div className="showcase-panel">
            <p className="eyebrow">Product transformation</p>
            <div className="before-after-grid">
              <article className="compare-card compare-card-before">
                <span>Before</span>
                <img src={heroBeforeImage} alt="Original ecommerce product photo" />
                <h4>Raw upload</h4>
                <p>Untouched seller photo with clutter, shadows, or an uneven background.</p>
              </article>
              <article className="compare-card compare-card-after">
                <span>After</span>
                <img src={heroAfterImage} alt="Clean ecommerce product photo after transformation" />
                <h4>Seller-ready result</h4>
                <p>Cleaner edges, stronger framing, and a product image ready to list.</p>
              </article>
            </div>
            {(sourcePreview || resultPreview) && (
              <div className="compare-preview">
                <div className="preview-grid">
                  <figure className="preview-card">
                    <img src={sourcePreview || ""} alt="Selected original upload preview" />
                    <figcaption>Original</figcaption>
                  </figure>
                  <figure className="preview-card preview-card-result">
                    <img src={resultPreview || sourcePreview || ""} alt="Processed result preview" />
                    <figcaption>Result</figcaption>
                  </figure>
                </div>
                {downloadUrl && (
                  <a className="button button-secondary" href={downloadUrl} download="product-photo.png">
                    Download PNG
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <p className="eyebrow">Approved customer segments</p>
          <h2>Built for the channels ecommerce sellers actually use.</h2>
        </div>
        <div className="channel-grid channel-grid-light">
          {sellerSegments.map((segment) => (
            <article key={segment.title} className="channel-card channel-card-light">
              <strong>{segment.title}</strong>
              <span>{segment.copy}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <p className="eyebrow">Product examples</p>
          <h2>Examples by ecommerce category, not generic mockups.</h2>
        </div>
        <div className="example-grid">
          {productExamples.map((item) => (
            <article key={item.title} className="example-card example-card-tall">
              <img className="example-image" src={item.image} alt={`${item.title} ecommerce photography example`} />
              <h3>{item.title}</h3>
              <p>{item.subtitle}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card roadmap-teaser">
        <div className="section-heading">
          <p className="eyebrow">Product studio</p>
          <h2>Start with cleanup now. Creative studio styles follow on the roadmap.</h2>
        </div>
        <div className="roadmap-grid">
          <article className="roadmap-card">
            <p className="eyebrow">Available now</p>
            <ul className="roadmap-list">
              {roadmapNow.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="roadmap-card">
            <p className="eyebrow">Coming soon</p>
            <ul className="roadmap-list">
              {roadmapNext.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="section-card metrics-band">
        <div>
          <p className="eyebrow">How it works</p>
          <h2>Upload, preview, and keep the buying flow simple.</h2>
        </div>
        <div className="metric-strip">
          <article>
            <strong>1</strong>
            <span>Upload a product photo and see the first result quickly.</span>
          </article>
          <article>
            <strong>2</strong>
            <span>Preview the cleaned result before spending credits.</span>
          </article>
          <article>
            <strong>3</strong>
            <span>Download the final image or return for more styles.</span>
          </article>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Pricing</p>
            <h2>Choose a credit bundle that matches your workload.</h2>
          </div>
          <Link to="/pricing" className="button button-secondary">
            See all plans
          </Link>
        </div>

        {loading ? (
          <div className="state-panel">
            <p>Loading plans...</p>
          </div>
        ) : error ? (
          <div className="state-panel state-panel-error">
            <p>{error}</p>
          </div>
        ) : packagePreview.length > 0 ? (
          <div className="pricing-grid pricing-grid-wide">
            {packagePreview.map((pkg, index) => (
              <article key={pkg.id} className={`pricing-card pricing-card-featured${index === 1 ? " pricing-card-highlight" : ""}`}>
                <div className="pricing-card-top">
                  <h3>{pkg.name}</h3>
                  <p className="price">
                    {pkg.currency} {pkg.price}
                  </p>
                </div>
                <p>{pkg.description || "A credit bundle for polished ecommerce imagery."}</p>
                <ul className="feature-list">
                  <li>{pkg.creditsIncluded} included credits</li>
                <li>Background removal and white background today</li>
                  <li>More studio styles: flat lay, lifestyle, model, video</li>
                </ul>
                <Link to="/signup" className="button button-block">
                  Buy credits
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

      <section className="section-card">
        <div className="section-heading">
          <p className="eyebrow">FAQ</p>
          <h2>Quick answers for sellers getting ready to launch.</h2>
        </div>
        <div className="faq-grid">
          {faqs.map((faq) => (
            <details key={faq.question} className="faq-card">
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="whatsapp-cta">
        <div>
          <p className="eyebrow">Get started</p>
          <h2>Ready to improve your product photos?</h2>
          <p>
            Upload a product photo and get a clean, marketplace-ready image in seconds.
          </p>
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

      <section className="section-card footer-summary">
        <div className="footer-summary-grid">
          <div>
            <h3>AI Product Photo Studio</h3>
            <p>An ecommerce product photography platform for sellers on Daraz, Shopify, WooCommerce, Facebook, and WhatsApp.</p>
          </div>
          <div>
            <h3>Studio styles</h3>
            <p>Background removal and white background are live now. Flat lay, lifestyle scenes, virtual models, and product video are approved roadmap priorities.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
