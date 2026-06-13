import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePackages } from "../lib/packages";
import { customerApi } from "../services/customerApi";

const svgData = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const sampleImage = (
  label: string,
  background: string,
  foreground: string,
  shape: "bottle" | "bag" | "pouch" | "leaf" | "accessory" | "circle" | "rect" = "rect",
  mood: "clean" | "busy" = "clean"
) =>
  svgData(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 520">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${background}"/>
          <stop offset="1" stop-color="#ffffff"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#12352b" flood-opacity=".2"/>
        </filter>
      </defs>
      <rect width="720" height="520" fill="url(#bg)"/>
      <circle cx="585" cy="90" r="82" fill="#ffffff" opacity=".48"/>
      <circle cx="110" cy="428" r="120" fill="${foreground}" opacity=".10"/>
      ${
        mood === "busy"
          ? `<g opacity=".28"><rect x="112" y="352" width="320" height="18" rx="9" fill="#8d9a90"/><rect x="520" y="326" width="102" height="22" rx="11" fill="#d1b06a"/><circle cx="184" cy="146" r="56" fill="#d4d9d5"/><circle cx="606" cy="172" r="46" fill="#f0c2cf"/></g>`
          : ""
      }
      ${
        shape === "circle"
          ? `<circle cx="360" cy="252" r="122" fill="${foreground}" filter="url(#shadow)"/>`
          : shape === "bag"
            ? `<path d="M236 180h248l-18 198H254l-18-198Zm54-34c0-30 18-52 46-52s46 22 46 52" fill="${foreground}" filter="url(#shadow)"/><path d="M298 214h124" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".58"/>`
            : shape === "pouch"
              ? `<path d="M272 156h176l24 44-18 188H266l-16-188 22-44Z" fill="${foreground}" filter="url(#shadow)"/><rect x="306" y="208" width="108" height="72" rx="18" fill="#fff" opacity=".5"/>`
              : shape === "leaf"
                ? `<path d="M236 316c34-98 124-164 244-178-4 128-42 212-116 258-64 40-124 18-128-80Z" fill="${foreground}" filter="url(#shadow)"/><path d="M300 348c36-56 80-102 134-140" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".38"/>`
              : shape === "accessory"
                  ? `<rect x="258" y="170" width="188" height="170" rx="42" fill="${foreground}" filter="url(#shadow)"/><path d="M300 244h120c16 0 28 12 28 28 0 18-14 32-32 32h-72c-26 0-42 14-54 32" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".56"/><circle cx="434" cy="308" r="18" fill="#fff" opacity=".56"/><circle cx="390" cy="220" r="14" fill="#fff" opacity=".44"/>`
                    : `<rect x="245" y="135" width="230" height="250" rx="42" fill="${foreground}" filter="url(#shadow)"/><rect x="288" y="174" width="144" height="72" rx="24" fill="#fff" opacity=".55"/>`
      }
      <text x="42" y="72" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#17221e">${label}</text>
    </svg>
  `);

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
    image: sampleImage("Beauty", "#f8d9e5", "#d14e83", "bottle", "busy")
  },
  {
    title: "Fashion",
    subtitle: "Apparel and accessory visuals that feel editorial, not flat.",
    image: sampleImage("Fashion", "#efe5d5", "#8f5f3d", "bag")
  },
  {
    title: "Agriculture",
    subtitle: "Fresh farm and crop product imagery for supply sellers.",
    image: sampleImage("Agriculture", "#dff1da", "#3c8648", "leaf")
  },
  {
    title: "Packaged Goods",
    subtitle: "Retail packs, pouches, and boxes made cleaner for ecommerce.",
    image: sampleImage("Packaged", "#fff0c7", "#cf9b24", "pouch")
  },
  {
    title: "Electronics Accessories",
    subtitle: "Cables, chargers, and small tech add-ons with crisp edges.",
    image: sampleImage("Accessories", "#dcecff", "#2f6fb9", "accessory")
  }
];

const roadmapNow = ["background removal", "white background", "transparent PNG"];
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
          <h1>Upload one product photo and turn it into a better selling image.</h1>
          <p className="section-lead">
            Turn basic product photos into clean marketplace-ready images with AI-powered background removal.
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
          <div className="showcase-panel showcase-panel-glow">
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
              <p className="upload-dropzone-title">{dragActive ? "Drop the image here" : "Drag and drop a product photo"}</p>
              <p className="upload-dropzone-copy">
                PNG, JPG, or WebP. Free preview is checked first, then the product image is cleaned for the seller view.
              </p>
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
                <strong>Raw upload</strong>
                <p>Messy table light, uneven background, and a photo that needs cleanup.</p>
              </article>
              <article className="compare-card compare-card-after">
                <span>After</span>
                <img src={heroAfterImage} alt="Clean ecommerce product photo after transformation" />
                <strong>Seller-ready result</strong>
                <p>Cleaner edges, stronger contrast, and a product image that feels ready to list.</p>
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
          <h2>Background removal is the foundation. More creative styles follow.</h2>
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
          <h2>Upload, transform, and keep the buying flow simple.</h2>
        </div>
        <div className="metric-strip">
          <article>
            <strong>1</strong>
            <span>Upload a product photo or send one through WhatsApp later.</span>
          </article>
          <article>
            <strong>2</strong>
            <span>Preview the cleaned result before you spend credits.</span>
          </article>
          <article>
            <strong>3</strong>
            <span>Download the final image or return for more styles.</span>
          </article>
          <article>
            <strong>4</strong>
            <span>Return for more styles or try advanced studio outputs.</span>
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
            <p>Background removal, white background, flat lay, lifestyle, virtual models, and product video are all approved roadmap priorities.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
