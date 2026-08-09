import { useRef, useState } from "react";
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

  if (!open) return null;

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
      navigate(`/restore-mvp/${draft.id}/preview`, { replace: true });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload the image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-modal open" role="dialog" aria-modal="true" aria-labelledby="uploadTitle">
      <div className="modal-backdrop" onClick={onClose} />
      <section className="modal-panel">
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>x</button>
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
            onChange={(event) => setFile(event.target.files?.[0] || null)}
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
