import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { setGuestOwnershipToken } from "../lib/guest";
import { customerApi } from "../services/customerApi";

export function RestorationUploadExperience({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const uploadInFlightRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const continueFromModal = async () => {
    if (!file || uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
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
      onClose();
      navigate(`/restore-mvp/${draft.id}/preview`, { replace: true });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload the image");
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  return (
    <div className="upload-modal open" role="dialog" aria-modal="true" aria-labelledby="uploadTitle">
      <div className="modal-backdrop" onClick={onClose} />
      <section className="modal-panel">
        <button ref={closeButtonRef} className="modal-close" type="button" aria-label="Close" onClick={onClose}>x</button>
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
            onChange={(event) => {
              const selected = event.target.files?.[0] || null;
              setUploadError(null);
              if (!selected) { setFile(null); return; }
              if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
                setFile(null);
                setUploadError("Choose a JPG, PNG, or WEBP image.");
                return;
              }
              if (selected.size > 10 * 1024 * 1024) {
                setFile(null);
                setUploadError("Image must be 10 MB or smaller.");
                return;
              }
              setFile(selected);
            }}
          />
        </label>
        {file && <div className="selected-preview"><div className="selected-fallback" aria-hidden="true">IMG</div><div><strong>{file.name}</strong><small>Ready for restoration</small></div></div>}
        {uploadError && <div className="state-panel state-panel-error"><p>{uploadError}</p></div>}
        <button className="btn btn-primary btn-full" type="button" disabled={!file || uploading} onClick={() => void continueFromModal()}>
          {uploading ? "Uploading..." : "Continue to Restoration"}
        </button>
      </section>
    </div>
  );
}
