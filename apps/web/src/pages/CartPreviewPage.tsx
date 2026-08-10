// R9.5-P5Q-MULTI-IMAGE-UI-CART: Preview step for a 2-10 image cart. The
// existing single-image OriginalPreviewPage/route is untouched -- exactly
// one uploaded image still uses that page. This page only exists for the
// new multi-image branch of the same modal's Continue action.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi, type RestorationDraftSummary } from "../services/customerApi";

type DraftWithPreview = RestorationDraftSummary & { previewUrl: string };

export function CartPreviewPage() {
  const { draftIds: draftIdsParam } = useParams<{ draftIds: string }>();
  const draftIds = (draftIdsParam || "").split(",").filter(Boolean);
  const { token } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Record<string, DraftWithPreview>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        draftIds.map((id) => customerApi.getRestorationDraft(token || undefined, id, getGuestOwnershipToken(id) || undefined).then((data) => [id, data] as const))
      );
      if (!mounted.current) return;
      setDrafts(Object.fromEntries(results));
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to load your photos");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [draftIds.join(","), token]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  if (draftIds.length === 0) {
    return <section className="page-stack"><div className="state-panel state-panel-error"><p>No photos to preview.</p></div></section>;
  }
  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading your photos...</p></div></section>;
  if (error) return <section className="page-stack"><div className="state-panel state-panel-error"><p>{error}</p></div></section>;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Preview</p>
        <h1>Preview your photos</h1>
        <p>{draftIds.length} photos uploaded once and stored securely. Review each one, then choose the restoration quality you need for each.</p>
      </div>

      <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {draftIds.map((id, index) => {
          const draft = drafts[id];
          if (!draft) return null;
          const width = draft.originalWidth;
          const height = draft.originalHeight;
          let aspectRatioLabel: string | null = null;
          let orientationLabel: string | null = null;
          if (width && height) {
            const divisor = gcd(width, height) || 1;
            aspectRatioLabel = `${width / divisor}:${height / divisor}`;
            orientationLabel = width === height ? "Square" : width > height ? "Landscape" : "Portrait";
          }
          const formatLabel = draft.originalMimeType ? draft.originalMimeType.replace("image/", "").toUpperCase() : null;
          return (
            <article className="card" key={id}>
              <p className="eyebrow">Photo {index + 1} of {draftIds.length}</p>
              <img src={draft.previewUrl} alt={`Uploaded original ${index + 1}`} style={{ display: "block", maxWidth: "100%", maxHeight: "220px", objectFit: "contain", margin: "0 auto 12px", borderRadius: "var(--radius)" }} />
              <details>
                <summary>Photo details</summary>
                <dl className="order-summary">
                  {formatLabel && <div><dt>Format</dt><dd>{formatLabel}</dd></div>}
                  {width && height && <div><dt>Dimensions</dt><dd>{width} × {height} px</dd></div>}
                  {aspectRatioLabel && <div><dt>Aspect ratio</dt><dd>{aspectRatioLabel}</dd></div>}
                  {orientationLabel && <div><dt>Orientation</dt><dd>{orientationLabel}</dd></div>}
                </dl>
              </details>
            </article>
          );
        })}
      </div>

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button type="button" className="button" onClick={() => navigate(`/restore-cart/${draftIds.join(",")}/configure`)}>
          Configure Photos
        </button>
        <button type="button" className="button button-secondary" onClick={() => void load()}>Refresh</button>
        <button type="button" className="button button-ghost" onClick={() => navigate("/?upload=1")}>Back to Upload</button>
      </div>
    </section>
  );
}
