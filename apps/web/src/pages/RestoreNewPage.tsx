import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";
import { usePackages } from "../lib/packages";
import type { PackageSummary } from "../lib/api";

export function RestoreNewPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { packages, loading: pkgLoading } = usePackages();
  const [files, setFiles] = useState<{ file: File; base64: string; name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "package" | "payment" | "complete">("upload");
  const [selectedPackage, setSelectedPackage] = useState<PackageSummary | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const readFile = (file: File): Promise<{ base64: string; name: string; size: number }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({ base64: result.split(",")[1], name: file.name, size: file.size });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const maxSize = 10 * 1024 * 1024;
    const newFiles = [];
    for (const f of Array.from(fileList)) {
      if (!allowed.includes(f.type)) {
        setError(`Unsupported format: ${f.name}. Use JPEG, PNG, or WebP.`);
        continue;
      }
      if (f.size > maxSize) {
        setError(`File too large: ${f.name}. Max 10 MB.`);
        continue;
      }
      try {
        const data = await readFile(f);
        newFiles.push({ file: f, ...data });
      } catch {
        setError(`Failed to read: ${f.name}`);
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleUpload = async () => {
    if (!token) {
      setError("Please log in to upload images for restoration");
      return;
    }
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const order = await customerApi.createRestorationOrder(token, `Restoration - ${files.length} image(s)`);
      let count = 0;
      for (const f of files) {
        try {
          await customerApi.addRestorationItem(token, order.id, f.name, f.file.type || "image/jpeg", f.base64);
          count++;
        } catch (err) {
          setError(`Failed to upload ${f.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      setOrderId(order.id);
      setStep("package");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create restoration order");
    } finally {
      setUploading(false);
    }
  };

  const handleSelectPackage = (pkg: PackageSummary) => {
    setSelectedPackage(pkg);
    setStep("payment");
  };

  const handlePaymentComplete = () => {
    if (orderId) {
      navigate(`/restore/${orderId}`);
    }
  };

  if (step === "package" && orderId) {
    return (
      <section className="page-stack">
        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Choose Your Package</h1>
          <p>Select the download tier that matches your needs.</p>
        </div>

        <div className="pricing-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem", marginTop: "1.5rem"
        }}>
          {packages.map((pkg) => (
            <article key={pkg.id} className="card" style={{ cursor: "pointer" }}
              onClick={() => handleSelectPackage(pkg)}
            >
              <div className="card-top">
                <div>
                  <p className="eyebrow">{pkg.code}</p>
                  <h3>{pkg.name}</h3>
                </div>
              </div>
              <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)", margin: "0.5rem 0" }}>
                {pkg.currency} {pkg.price}
              </p>
              <p>{pkg.description || `${pkg.creditsIncluded || 0} credits included`}</p>
              <div className="button-row" style={{ marginTop: "0.75rem" }}>
                <button type="button" className="button button-block">Select Package</button>
              </div>
            </article>
          ))}
        </div>

        <div style={{ marginTop: "1rem" }}>
          <button type="button" className="button button-secondary" onClick={() => setStep("upload")}>← Back to Upload</button>
        </div>
      </section>
    );
  }

  if (step === "payment") {
    return (
      <section className="page-stack">
        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Payment</h1>
          <p>Selected package: {selectedPackage?.name} ({selectedPackage?.currency} {selectedPackage?.price})</p>
        </div>

        <div className="card" style={{ maxWidth: 500, margin: "1.5rem auto", textAlign: "center", padding: "2rem" }}>
          <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)", marginBottom: "1rem" }}>
            {selectedPackage?.currency} {selectedPackage?.price}
          </p>
          <p style={{ marginBottom: "1.5rem", color: "var(--muted)" }}>
            {selectedPackage?.description || `Package: ${selectedPackage?.name}`}
          </p>
          <div className="button-row" style={{ justifyContent: "center" }}>
            <button type="button" className="button" onClick={handlePaymentComplete}>
              Complete Payment
            </button>
            <button type="button" className="button button-secondary" onClick={() => setStep("package")}>
              ← Change Package
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Upload Photos for Restoration</h1>
        <p>Select or drag & drop images. Supported: JPEG, PNG, WebP (max 10 MB each).</p>
      </div>

      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      <div
        className={`restore-dropzone ${dragOver ? "restore-dropzone-active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("restore-file-input")?.click()}
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
          id="restore-file-input"
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); }}
        />
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          {dragOver ? "Drop images here" : "Drag & drop images here, or click to browse"}
        </p>
      </div>

      {files.length > 0 && (
        <div className="admin-card-grid" style={{ marginTop: "1rem" }}>
          {files.map((f, i) => (
            <article key={i} className="card admin-record-card">
              <div className="card-top">
                <div><h3>{f.name}</h3></div>
              </div>
              <p className="eyebrow">{(f.size / 1024).toFixed(0)} KB</p>
              <div className="button-row">
                <button type="button" className="button button-small button-secondary" onClick={() => removeFile(i)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <button type="button" className="button" disabled={uploading || pkgLoading} onClick={handleUpload}>
            {uploading ? "Uploading..." : `Upload ${files.length} image(s) & Choose Package`}
          </button>
        </div>
      )}
    </section>
  );
}
