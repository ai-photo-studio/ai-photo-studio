import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type MemoryPackageSummary } from "../services/customerApi";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function RestorationUploadExperience({ open, onClose, packageCode: requestedPackageCode = null }: { open: boolean; onClose: () => void; packageCode?: string | null }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [packages, setPackages] = useState<MemoryPackageSummary[]>([]);
  const [packageCode, setPackageCode] = useState<string | null>(requestedPackageCode);
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

  useEffect(() => { setPackageCode(requestedPackageCode); setFiles([]); setUploadError(null); }, [requestedPackageCode]);
  useEffect(() => { if (open && requestedPackageCode) void customerApi.getMemoryPackages().then(setPackages).catch(() => setPackages([])); }, [open, requestedPackageCode]);

  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  if (!open) return null;

  const addSelectedFiles = (selected: FileList | null) => {
    setUploadError(null);
    // `selected` is a live reference to the input's own FileList -- it must
    // be converted to a plain array BEFORE the input's value is reset,
    // otherwise resetting `.value` also empties this same live list out
    // from under us.
    const incoming = selected ? Array.from(selected) : [];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (incoming.length === 0) return;
    for (const candidate of incoming) {
      if (!ALLOWED_TYPES.includes(candidate.type)) {
        setUploadError("Choose a JPG, PNG, or WEBP image.");
        return;
      }
      if (candidate.size > MAX_FILE_BYTES) {
        setUploadError("Image must be 10 MB or smaller.");
        return;
      }
    }
    // Single synchronous event handler (not called concurrently), so the
    // `files` closure value is authoritative here -- no functional updater
    // needed, which keeps this one linear decision instead of splitting
    // state across two setState calls.
    const selectedPackage = packages.find((item) => item.code === packageCode);
    const limit = selectedPackage ? selectedPackage.maxImages : 1;
    if (files.length + incoming.length > limit) {
      if (!token && !packageCode && files.length === 0 && incoming.length > 0) {
        setFiles([incoming[0]]);
        setActiveIndex(0);
      }
      setUploadError(selectedPackage ? `This package accepts up to ${limit} photos.` : "Single Photo accepts one image. Choose a Memory Package for multiple photos.");
      return;
    }
    setFiles([...files, ...incoming]);
    setActiveIndex(Math.min(activeIndex, files.length + incoming.length - 1));
  };

  const removeFileAt = (index: number) => {
    setUploadError(null);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((current) => Math.max(0, Math.min(current, files.length - 2)));
  };

  const continueFromModal = async () => {
    if (files.length === 0 || uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    setUploadError(null);
    try {
      const draftIds = await Promise.all(files.map(async (file) => {
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
        // Client-observed facts only (never sent to or trusted from any
        // server field) so Preview can show a real file name/size -- neither
        // is persisted server-side. Best-effort only; Preview tolerates its
        // absence (e.g. after a refresh/direct navigation).
        try {
          window.sessionStorage.setItem(
            `restoration-draft-source-file:${draft.id}`,
            JSON.stringify({ name: file.name, size: file.size, type: file.type })
          );
        } catch {
          // sessionStorage unavailable -- Preview simply omits these fields.
        }
        return draft.id;
      }));
      onClose();
      // Exactly one image keeps the existing, extensively-tested
      // single-image route/behavior byte-for-byte -- this is not a new
      // code path, it is the same one that has always run for one image.
      // Two or more images navigate to the new cart flow instead.
      if (packageCode) {
        const selectedPackage = packages.find((item) => item.code === packageCode);
        if (!selectedPackage || draftIds.length < selectedPackage.minImages || draftIds.length > selectedPackage.maxImages) throw new Error(`Upload ${selectedPackage?.minImages ?? 2} photos for this package.`);
        navigate(`/restore-package/${packageCode}/${draftIds.join(",")}/preview`, { replace: true });
      } else if (draftIds.length === 1) {
        navigate(`/restore-mvp/${draftIds[0]}/preview`, { replace: true });
      } else {
        navigate(`/restore-cart/${draftIds.join(",")}/preview`, { replace: true });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload the image");
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  return (
    <div className="upload-modal open" role="dialog" aria-modal="true" aria-label="Upload Your Photo">
      <div className="modal-backdrop" onClick={onClose} />
      <section className="modal-panel">
        <button ref={closeButtonRef} className="modal-close" type="button" aria-label="Close" onClick={onClose}>x</button>
        <span className="eyebrow">START RESTORATION</span>
        <h2 id="uploadTitle">{packageCode ? "Upload photos" : "Upload photo"}</h2>
        <p>{packageCode ? "Memory package photos · JPG, PNG or WEBP · 10 MB each" : "Add one photo to start your restoration."}</p>
        <label className={`drop-zone${files.length ? " upload-dropzone-compact" : ""}`} htmlFor="photoInput">
          <span className="drop-icon">+</span>
           <strong>{files.length ? "Add another photo" : packageCode ? "Add photos" : "Add photo"}</strong>
             <small>{files.length ? "Camera or gallery" : packageCode ? `Photo 1–${packages.find((item) => item.code === packageCode)?.maxImages ?? 2}` : "Camera or gallery · JPG, PNG or WEBP"}</small>
          <input
            ref={fileInputRef}
            id="photoInput"
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={(event) => addSelectedFiles(event.target.files)}
          />
        </label>
        {files.length > 0 && (
          <div className="upload-preview-stack">
            <div className="upload-main-preview">
              <img src={previewUrls[activeIndex]} alt="Uploaded photo preview" />
              <span className="upload-ready-badge">Ready</span>
              {files.length === 1 && <button type="button" className="upload-main-remove" aria-label={`Remove ${files[activeIndex]?.name || "uploaded photo"}`} onClick={() => removeFileAt(activeIndex)}>Remove</button>}
            </div>
            {files.length > 0 && <div className={`selected-files-list upload-photo-list${files.length === 1 ? " upload-photo-list-single" : ""}`} aria-label="Uploaded photos">
              {files.map((file, index) => (
                <div className={`selected-preview${activeIndex === index ? " selected-preview-active" : ""}`} key={`${file.name}-${index}`}>
                  <button type="button" className="upload-thumbnail-button" onClick={() => setActiveIndex(index)} aria-label={`View ${file.name}`}>
                    <img src={previewUrls[index]} alt="Uploaded photo preview" />
                  </button>
                  {files.length > 1 && <button type="button" className="upload-remove-button" aria-label={`Remove ${file.name}`} onClick={() => removeFileAt(index)}>×</button>}
                </div>
              ))}
               {packageCode && files.length < (packages.find((item) => item.code === packageCode)?.maxImages ?? 1) && <button type="button" className="upload-add-tile" onClick={() => fileInputRef.current?.click()} aria-label="Add another photo">+</button>}
            </div>}
            {packageCode && files.length === 1 && <button type="button" className="upload-add-tile upload-add-tile-single" onClick={() => fileInputRef.current?.click()} aria-label="Add another photo">+ <span>Add</span></button>}
          </div>
        )}
        {packageCode && files.length > 0 && files.length < (packages.find((item) => item.code === packageCode)?.maxImages ?? 1) && <>
          <button type="button" className="button button-secondary upload-add-more" onClick={() => fileInputRef.current?.click()}>
             Add more photos — {(packages.find((item) => item.code === packageCode)?.maxImages ?? 1) - files.length} remaining
          </button>
           <p className="upload-remaining">{(packages.find((item) => item.code === packageCode)?.maxImages ?? 1) - files.length} remaining</p>
        </>}
        {uploadError && <div className="state-panel state-panel-error"><p>{uploadError}</p></div>}
        <button aria-label="Continue to Restoration" className="btn btn-primary btn-full" type="button" disabled={files.length === 0 || uploading} onClick={() => void continueFromModal()}>
           {uploading ? "Uploading..." : packageCode ? `Review package (${files.length})` : files.length > 1 ? `Continue (${files.length} photos)` : "Continue"}
        </button>
      </section>
    </div>
  );
}
