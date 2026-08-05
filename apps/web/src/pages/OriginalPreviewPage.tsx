// R9.2-P6C-CUSTOMER-MVP-FLOW: signed original preview. Read-only on mount
// and on refresh -- issues a GET only, never a write. Moving to tier
// selection is an explicit button action.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken } from "../lib/guest";
import { customerApi, type RestorationDraftSummary } from "../services/customerApi";

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

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Preview</p>
        <h1>Your uploaded photo</h1>
        <p>Read-only. Refresh never writes.</p>
      </div>

      <div className="card">
        <img src={draft.previewUrl} alt="Uploaded original" style={{ maxWidth: "100%", borderRadius: "var(--radius)" }} />
      </div>

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
          onClick={() => navigate(`/restore-mvp/${draft.id}/tiers`)}
        >
          Choose resolution
        </button>
        <button type="button" className="button button-secondary" onClick={() => void load()}>
          Refresh
        </button>
        <Link className="button button-ghost" to="/restore-mvp/new">Upload another</Link>
      </div>
    </section>
  );
}
