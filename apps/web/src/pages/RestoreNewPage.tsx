import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { customerApi } from "../services/customerApi";
import type { RestorationOrderSummary, RestorationItemRecord } from "../lib/portal-types";

export function RestoreNewPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState<{ file: File; base64: string; name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<{ orderId: string; count: number } | null>(null);

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
    if (!token || files.length === 0) return;
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
      setUploadResults({ orderId: order.id, count });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create restoration order");
    } finally {
      setUploading(false);
    }
  };

  if (uploadResults) {
    setTimeout(() => navigate(`/restore/${uploadResults.orderId}`), 1500);
    return (
      <section className="page-stack">
        <div className="section-heading">
          <p className="eyebrow">Photo Restoration</p>
          <h1>Upload Complete</h1>
        </div>
        <div className="state-panel" style={{ background: "var(--surface)", padding: "2rem", borderRadius: "var(--radius)" }}>
          <p style={{ fontSize: "1.2rem", fontWeight: 600 }}>✅ {uploadResults.count} image(s) uploaded successfully</p>
          <p>Redirecting to restoration order...</p>
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
          <button type="button" className="button" disabled={uploading} onClick={handleUpload}>
            {uploading ? "Uploading..." : `Upload ${files.length} image(s) & Start Restoration`}
          </button>
        </div>
      )}
    </section>
  );
}
