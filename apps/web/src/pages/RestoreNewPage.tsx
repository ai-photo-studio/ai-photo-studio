import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { setGuestOwnershipToken } from "../lib/guest";
import { restorationDraftApi } from "../services/customerApi";
import { ApiError } from "../lib/api";

// R9.2-P1A: free upload, original preview -> tier select -> fixed-order
// review. Stops before payment. No Replicate/Sharp/payment call happens on
// this page or anywhere in this flow.

const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "PK", label: "Pakistan" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "AU", label: "Australia" }
];

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image"));
    reader.readAsDataURL(file);
  });

export function RestoreNewPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [country, setCountry] = useState("PK");
  const [marketConfirmed, setMarketConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === country);
  const marketLabel = country === "PK" ? "Pakistan (PKR)" : `International -- ${selectedCountry?.label || country} (USD)`;

  const chooseFile = useCallback((selected: File | null | undefined) => {
    if (!selected) return;
    setError(null);
    if (!ALLOWED_MIME_TYPES.includes(selected.type)) {
      setError(`Unsupported format: ${selected.name}. Use JPEG, PNG, or WebP.`);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setError(`File too large: ${selected.name}. Max 10 MB.`);
      return;
    }
    setFile(selected);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      chooseFile(event.dataTransfer.files?.[0]);
    },
    [chooseFile]
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const handleUpload = async () => {
    if (!marketConfirmed) {
      setError("Please confirm your country/market before uploading.");
      return;
    }
    if (!file) return;
    if (uploading) return;

    setUploading(true);
    setError(null);
    try {
      const bodyBase64 = await readFileAsBase64(file);
      const draft = await restorationDraftApi.createDraft(
        {
          country,
          marketConfirmed: true,
          fileName: file.name,
          contentType: file.type,
          bodyBase64
        },
        token || undefined
      );
      if (draft.guestOwnershipToken) {
        setGuestOwnershipToken(draft.id, draft.guestOwnershipToken);
      }
      navigate(`/restore/drafts/${draft.id}/preview`);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(`${submitError.message} (${submitError.code || submitError.status})`);
      } else {
        setError("Unable to upload your image right now. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Upload Photos for Restoration</h1>
        <p>Free to upload and preview. Choose your resolution and pay only when you are ready to order.</p>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="section-heading section-heading-tight">
          <h2>1. Confirm your country</h2>
        </div>
        <label className="field">
          <span>Country</span>
          <select
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setMarketConfirmed(false);
            }}
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={marketConfirmed}
            onChange={(event) => setMarketConfirmed(event.target.checked)}
          />
          <span>Confirm market: {marketLabel}</span>
        </label>
      </div>

      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      <div
        className={`restore-dropzone ${dragOver ? "restore-dropzone-active" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        aria-label="Drag and drop your image here, or activate to browse for a file"
        aria-disabled={!marketConfirmed}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFilePicker(); } }}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--line)"}`,
          borderRadius: "var(--radius)",
          padding: "3rem 1rem",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "transparent",
          transition: "all 0.2s"
        }}
      >
        <input
          ref={fileInputRef}
          id="restore-file-input"
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          {dragOver ? "Drop your image here" : "Drag & drop an image here, or click to browse"}
        </p>
        <p className="small text-muted">JPEG, PNG, or WebP -- max 10 MB. Upload and preview are free.</p>
      </div>

      {file && (
        <div className="card admin-record-card" style={{ marginTop: "1rem" }}>
          <div className="card-top">
            <div><h3>{file.name}</h3></div>
          </div>
          <p className="eyebrow">{(file.size / 1024).toFixed(0)} KB</p>
        </div>
      )}

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
          disabled={!file || !marketConfirmed || uploading}
          onClick={handleUpload}
        >
          {uploading ? "Uploading..." : "Upload for Free Preview"}
        </button>
      </div>
    </section>
  );
}
