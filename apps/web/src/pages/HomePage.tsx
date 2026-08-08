import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeroCompareSlider } from "../components/HeroCompareSlider";
import { useAuth } from "../lib/auth";
import { setGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";

// ThanNow locked human-memory homepage (R9.3).
// References the approved UI/DESIGN_LOCK.md direction. Upload CTAs route to
// the existing restoration flow (/restore/new). Image assets under /assets/
// are licence-gated: RenderAsset fall backs to a clean slot until owned images
// are supplied. No unlicensed/hotlinked imagery is ever added.

const ASSETS_BASE = "/assets/";

type AssignedAsset = { fileName: string; alt: string; label: string; sub?: string };

const MEMORIES: AssignedAsset[] = [
  { fileName: "parents-grandparents.jpg", alt: "Parents and grandparents old portrait", label: "Parents and Grandparents", sub: "Cherished moments with those who raised us." },
  { fileName: "wedding-memories.jpg", alt: "Wedding memory portrait", label: "Wedding Memories", sub: "Relive your beautiful day forever." },
  { fileName: "childhood-photos.jpg", alt: "Old childhood portrait", label: "Childhood Photos", sub: "Those precious moments growing up." },
  { fileName: "family-portraits.jpg", alt: "Family portrait", label: "Family Portraits", sub: "Together is our favorite place to be." },
  { fileName: "honoring-loved-ones.jpg", alt: "Portrait honoring a loved one", label: "Honoring Loved Ones", sub: "Remembering and celebrating their lives." }
];

const UPSCALE: AssignedAsset[] = [
  { fileName: "living-room-wall.jpg", alt: "Upscaled family photo displayed on a living room wall", label: "Living Room Wall" },
  { fileName: "office-desk.jpg", alt: "Upscaled portrait on an office desk", label: "Office Desk" },
  { fileName: "bedside-table.jpg", alt: "Upscaled portrait on a bedside table", label: "Bedside Table" },
  { fileName: "hallway-gallery.jpg", alt: "Family images in a hallway gallery", label: "Hallway Gallery" },
  { fileName: "home-entrance.jpg", alt: "Family portrait displayed at a home entrance", label: "Home Entrance" }
];

const PRINT: AssignedAsset[] = [
  { fileName: "framed-wall-art.jpg", alt: "Framed wall art", label: "Framed Wall Art", sub: "Museum quality prints in elegant frames." },
  { fileName: "tabletop-frames.jpg", alt: "Tabletop photo frames", label: "Tabletop Frames", sub: "Beautiful frames for desks, shelves and side tables." },
  { fileName: "print-packages.jpg", alt: "Photo print package", label: "Print Packages", sub: "Multiple sizes for every special memory." },
  { fileName: "gift-prints.jpg", alt: "Gift photo print", label: "Gift Prints", sub: "Thoughtful gifts for family and friends." },
  { fileName: "premium-photo-box.jpg", alt: "Premium photo keepsake box", label: "Premium Photo Box", sub: "Elegant keepsake boxes to treasure forever." }
];

const STEPS = [
  ["Upload Photo", "Upload your old or damaged photo in any common image format."],
  ["AI Restore", "Our AI restores details, colors and clarity, then prepares an upscale."],
  ["Preview and Approve", "Review the restored photo and approve the final result before printing."],
  ["Print and Deliver", "Choose a print size and we prepare it for delivery."]
];

// Print sizes shown as copy only. Per R9.3, never hardcode conflicting price
// amounts; product pricing is surface through the real flow / pricing page.
const PRINT_SIZES = [
  ["4 x 6 inch", "10 x 15 cm"],
  ["5 x 7 inch", "13 x 18 cm"],
  ["8 x 10 inch", "20 x 25 cm"],
  ["11 x 14 inch", "28 x 36 cm"],
  ["16 x 20 inch", "40 x 50 cm"],
  ["20 x 30 inch", "50 x 75 cm"]
];

function RenderAsset({ fileName, alt, label }: { fileName: string; alt: string; label: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return <div className="asset-slot" role="img" aria-label={alt}><span>{label}</span></div>;
  }
  return <img src={`${ASSETS_BASE}${fileName}`} alt={alt} loading="lazy" onError={() => setMissing(true)} />;
}

export function HomePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  const handleFile = (selected: File | undefined | null) => {
    if (selected) setFile(selected);
  };

  const continueFromModal = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read the selected image"));
        reader.readAsDataURL(file);
      });
      const bodyBase64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      const draft = await customerApi.createRestorationDraft(token || undefined, {
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        bodyBase64,
        country: "PK",
        confirmed: true
      });
      if (draft.guestOwnershipToken) setGuestOwnershipToken(draft.id, draft.guestOwnershipToken);
      closeModal();
      navigate(`/restore-mvp/${draft.id}/preview`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload the image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="thannow-home">
      <section className="hero section-shell">
        <div className="hero-copy">
          <span className="eyebrow">AI PHOTO RESTORATION AND PRINTING</span>
          <h1>Bring Your Precious<br />Memories <span>Back to Life</span></h1>
          <p className="hero-intro">AI powered restoration, upscaling and premium printing for the moments that matter most.</p>

          <ul className="check-list">
            <li>Restore damaged, faded and old photos</li>
            <li>Upscale for stunning clarity and detail</li>
            <li>Print on premium quality paper</li>
          </ul>

          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-large upload-trigger" onClick={openModal}>Upload Your Photo</button>
            <a className="btn btn-light btn-large" href="#how">See How It Works</a>
          </div>

          <div className="trust-line">
            <div className="avatars" aria-hidden="true">
              <span>F</span><span>A</span><span>S</span>
            </div>
            <div><strong>Trusted by families across Pakistan</strong><small>Restore, upscale, approve and print in one place.</small></div>
          </div>
        </div>

        <div className="hero-media">
          <HeroCompareSlider />
          <button className="hero-upload upload-trigger" type="button" onClick={openModal}>Upload Photo</button>
        </div>
      </section>

      <section className="section-shell content-section" id="memories">
        <div className="section-heading">
          <h2>Memories We Restore</h2>
          <p>Every photo holds a story. We help you keep it alive.</p>
        </div>
        <div className="five-grid memory-grid">
          {MEMORIES.map((m) => (
            <article className="visual-card" key={m.fileName}>
              <RenderAsset fileName={m.fileName} alt={m.alt} label={m.label} />
              <div><h3>{m.label}</h3><p>{m.sub}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell content-section" id="upscale">
        <div className="section-heading">
          <h2>Upscale and Display Anywhere</h2>
          <p>Restore once, then prepare the image for the place where you want to keep it.</p>
        </div>
        <div className="five-grid display-grid">
          {UPSCALE.map((m) => (
            <article className="visual-card compact" key={m.fileName}>
              <RenderAsset fileName={m.fileName} alt={m.alt} label={m.label} />
              <h3>{m.label}</h3>
            </article>
          ))}
        </div>
        <div className="center-action">
          <button type="button" className="btn btn-primary upload-trigger" onClick={openModal}>Upload and Check Your Photo</button>
        </div>
      </section>

      <section className="section-shell content-section" id="printing">
        <div className="section-heading">
          <h2>Print and Preserve Forever</h2>
          <p>Premium prints and keepsakes made to last for generations.</p>
        </div>
        <div className="five-grid print-grid">
          {PRINT.map((m) => (
            <article className="visual-card" key={m.fileName}>
              <RenderAsset fileName={m.fileName} alt={m.alt} label={m.label} />
              <div><h3>{m.label}</h3><p>{m.sub}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-shell">
          <div className="section-heading"><h2>How It Works</h2></div>
          <div className="steps-grid">
            {STEPS.map(([title, body], i) => (
              <article key={title}>
                <span className="step-icon">{i + 1}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell content-section" id="pricing">
        <div className="section-heading">
          <h2>Choose Your Print Size</h2>
          <p>Simple PKR pricing for premium photo prints.</p>
        </div>
        <div className="price-grid">
          {PRINT_SIZES.map(([size, cm]) => (
            <article key={size}>
              <h3>{size}</h3>
              <small>{cm}</small>
              <span>PKR</span>
              <strong>Current Pricing</strong>
            </article>
          ))}
        </div>
        <div className="center-action">
          <Link className="btn btn-light upload-trigger" to="/restore/new">Upload Photo and View Pricing</Link>
        </div>
      </section>

      <section className="section-shell content-section">
        <div className="section-heading"><h2>Restore, Upscale, Print</h2></div>
        <div className="center-action">
          <button type="button" className="btn btn-primary btn-large upload-trigger" onClick={openModal}>Upload Your Photo</button>
        </div>
      </section>

      <button className="floating-upload upload-trigger" type="button" aria-label="Upload a photo" onClick={openModal}>Upload Photo</button>

      {modalOpen && (
        <div className="upload-modal open" role="dialog" aria-modal="true" aria-labelledby="uploadTitle">
          <div className="modal-backdrop" onClick={closeModal} />
          <section className="modal-panel">
            <button className="modal-close" type="button" aria-label="Close" onClick={closeModal}>x</button>
            <span className="eyebrow">START RESTORATION</span>
            <h2 id="uploadTitle">Upload Your Photo</h2>
            <p>Choose a human portrait, family photo, wedding photo or another personal memory.</p>

            <label className="drop-zone" htmlFor="photoInput">
              <span className="drop-icon">+</span>
              <strong>Click to choose your image</strong>
              <small>JPG, PNG or WEBP</small>
              <input
                ref={fileInputRef}
                id="photoInput"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>

            {file && (
              <div className="selected-preview">
                <div className="selected-fallback" aria-hidden="true">IMG</div>
                <div><strong>{file.name}</strong><small>Ready for restoration</small></div>
              </div>
            )}

            {uploadError && <div className="state-panel state-panel-error"><p>{uploadError}</p></div>}

            <button className="btn btn-primary btn-full" type="button" id="continueButton" disabled={!file || uploading} onClick={() => void continueFromModal()}>
              {uploading ? "Uploading..." : "Continue to Preview"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
