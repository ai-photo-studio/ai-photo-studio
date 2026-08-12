// R9.2-P6C-CUSTOMER-MVP-FLOW: signed original preview. Read-only on mount
// and on refresh -- issues a GET only, never a write. Moving to tier
// selection is an explicit button action.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi, type RestorationDraftSummary } from "../services/customerApi";
import { aspectRatioOrientation, displayAspectRatio } from "../lib/printSuitability";

export function OriginalPreviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<(RestorationDraftSummary & { previewUrl: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!draftId) return;
    setLoading(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(draftId);
      const data = await customerApi.getRestorationDraft(token || undefined, draftId, guestToken || undefined);
      if (!mounted.current) return;
      setDraft(data);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to load the preview");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [draftId, token]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading preview...</p></div></section>;
  if (error || !draft) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error || "Draft not found"}</p></div></section>;

  // Best-effort only, from the browser's own File object at selection time
  // -- the server never stores/returns a file name or byte size, so these
  // two fields are simply omitted (not guessed) when unavailable, e.g.
  // after a refresh or a direct navigation to this URL.
  let sourceFile: { name: string; size: number; type: string } | null = null;
  try {
    const raw = window.sessionStorage.getItem(`restoration-draft-source-file:${draft.id}`);
    if (raw) sourceFile = JSON.parse(raw);
  } catch {
    sourceFile = null;
  }

  const width = draft.originalWidth;
  const height = draft.originalHeight;
  let aspectRatioLabel: string | null = null;
  let orientationLabel: string | null = null;
  if (width && height) {
    aspectRatioLabel = displayAspectRatio(width, height);
    orientationLabel = aspectRatioOrientation(width, height);
  }
  const formatLabel = draft.originalMimeType ? draft.originalMimeType.replace("image/", "").toUpperCase() : null;
  const fileSizeLabel = sourceFile ? `${(sourceFile.size / 1024).toFixed(0)} KB` : null;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Preview</p>
        <h1>Preview &amp; Analysis</h1>
        <p>Your original photo is uploaded once and stored securely. Review its details, then choose the restoration quality you need.</p>
      </div>

      <div className="card">
        <img
          src={draft.previewUrl}
          alt="Uploaded original"
          style={{ display: "block", maxWidth: "100%", maxHeight: "480px", width: "auto", height: "auto", objectFit: "contain", margin: "0 auto", borderRadius: "var(--radius)" }}
        />
        <div className="stack" style={{ marginTop: "1rem" }}>
          <strong>Uploaded original</strong>
          <dl className="order-summary">
            {sourceFile && <div><dt>File name</dt><dd>{sourceFile.name}</dd></div>}
            {formatLabel && <div><dt>Format</dt><dd>{formatLabel}</dd></div>}
            {fileSizeLabel && <div><dt>File size</dt><dd>{fileSizeLabel}</dd></div>}
            {width && height && <div><dt>Dimensions</dt><dd>{width} × {height} px</dd></div>}
            {aspectRatioLabel && <div><dt>Aspect ratio</dt><dd>{aspectRatioLabel}</dd></div>}
            {orientationLabel && <div><dt>Orientation</dt><dd>{orientationLabel}</dd></div>}
          </dl>
        </div>
      </div>

      <div className="button-row" style={{ marginTop: "1rem" }}>
          <button
           aria-label="Choose Product & Image Quality"
          type="button"
          className="button"
          onClick={() => navigate(`/restore-mvp/${draft.id}/tiers`)}
        >
           Continue / Choose Product
        </button>
        <button type="button" className="button button-secondary" onClick={() => void load()}>
          Refresh
        </button>
        <button type="button" className="button button-ghost" onClick={() => navigate("/?upload=1")}>Back to Upload</button>
      </div>
    </section>
  );
}
