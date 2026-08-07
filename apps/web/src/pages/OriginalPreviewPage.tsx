import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { restorationDraftApi } from "../services/customerApi";
import type { RestorationDraftRecord } from "../lib/portal-types";
import { ApiError } from "../lib/api";

// R9.2-P1A: protected original preview. This is the customer's UPLOADED
// image only -- never labelled restored, enhanced, or processed, because no
// restoration has happened yet at this stage.
export function OriginalPreviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<RestorationDraftRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const guestToken = getGuestOwnershipToken(draftId) || undefined;
        const result = await restorationDraftApi.getDraft(draftId, token || undefined, guestToken);
        if (!cancelled) setDraft(result);
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiError && loadError.status === 404) {
          setError("This draft could not be found, or you do not have access to it.");
        } else {
          setError("Unable to load your preview right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [draftId, token]);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Original Uploaded Image</h1>
        <p>This is exactly what you uploaded -- free to review before choosing a resolution.</p>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading your preview...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : draft ? (
        <>
          <div className="card" style={{ maxWidth: 640 }}>
            <img
              src={draft.previewUrl}
              alt="Original uploaded image"
              style={{ width: "100%", height: "auto", borderRadius: "var(--radius)", display: "block" }}
            />
          </div>
          <dl className="detail-grid" style={{ marginTop: "1rem" }}>
            <div><dt>Format</dt><dd>{draft.originalMimeType || "Unknown"}</dd></div>
            <div><dt>Dimensions</dt><dd>{draft.originalWidth && draft.originalHeight ? `${draft.originalWidth} x ${draft.originalHeight} px` : "Unknown"}</dd></div>
            <div><dt>File size</dt><dd>{draft.originalFileSizeBytes ? `${(draft.originalFileSizeBytes / 1024).toFixed(0)} KB` : "Unknown"}</dd></div>
          </dl>
          <div className="button-row" style={{ marginTop: "1.5rem" }}>
            <button type="button" className="button" onClick={() => navigate(`/restore/drafts/${draftId}/select`)}>
              Continue -- Choose Resolution
            </button>
            <Link to="/restore/new" className="button button-secondary">
              Upload a Different Image
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
