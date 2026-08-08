// R9.2-P6C-CUSTOMER-MVP-FLOW: server offers -> ORIGINAL/2HD/4HD selection ->
// immutable FixedOrder. Loading offers is a GET (mount/refresh-safe); order
// creation happens only on the explicit "Create order" button click.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type DigitalOfferSummary } from "../services/customerApi";

export function DigitalTierSelectPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DigitalOfferSummary[] | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [product, setProduct] = useState<"DIGITAL" | "PRINT_DIGITAL">("DIGITAL");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!draftId) return;
    setLoading(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(draftId);
      const result = await customerApi.getRestorationDraftOffers(token || undefined, draftId, guestToken || undefined);
      if (!mounted.current) return;
      if (Array.isArray(result)) {
        setOffers(result);
        setUnavailableReason(null);
        if (!selected && result.length > 0) setSelected(result[0].tier);
      } else {
        setOffers(null);
        setUnavailableReason(result.reason);
      }
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to load pricing");
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

  const createOrder = async () => {
    if (!draftId || !selected) return;
    setCreating(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(draftId);
      const order = await customerApi.createFixedOrder(token || undefined, { draftId, tier: selected }, guestToken || undefined);
      if (guestToken) setGuestOwnershipToken(order.orderNo, guestToken);
      navigate(`/orders/${order.orderNo}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the order");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading pricing...</p></div></section>;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Choose product and quality</p>
        <h1>Choose your restoration</h1>
        <p>Digital prices are server-approved. Print pricing remains unavailable until an authoritative catalog is active.</p>
      </div>

      <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <button type="button" className={`card product-choice ${product === "DIGITAL" ? "card-selected" : ""}`} onClick={() => setProduct("DIGITAL")}>
          <h3>Digital Download</h3><p>Restore your photo and download it when ready.</p>
        </button>
        <button type="button" className={`card product-choice ${product === "PRINT_DIGITAL" ? "card-selected" : ""}`} onClick={() => setProduct("PRINT_DIGITAL")}>
          <h3>Print + Digital Download</h3><p>Restore your photo, receive the digital copy, and order home delivery.</p>
          <span className="status-pill">PRINT CATALOG REQUIRED</span>
        </button>
      </div>

      {product === "PRINT_DIGITAL" && <div className="state-panel"><p>Print selection and delivery pricing are not yet available. Choose Digital Download to continue safely.</p></div>}

      {unavailableReason && <div className="state-panel state-panel-error"><p>{unavailableReason}</p></div>}
      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      {offers && (
        <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {offers.map((offer) => (
            <article
              key={offer.tier}
              className={`card ${selected === offer.tier ? "card-selected" : ""}`}
              style={{ border: selected === offer.tier ? "2px solid var(--accent)" : undefined, cursor: "pointer" }}
              onClick={() => setSelected(offer.tier)}
            >
               <h3>{offer.tier === "HD_2X" ? "2x HD" : offer.tier === "HD_4X" ? "4x Ultra HD" : "Original"}</h3>
               <p className="helper-text">{offer.tier === "HD_4X" ? "Best for printing and large displays" : offer.tier === "HD_2X" ? "Sharp detail for sharing and display" : "Basic sharing at original resolution"}</p>
               {offer.tier === "HD_2X" && <span className="status-pill">MOST POPULAR</span>}
              <strong>{offer.currency} {(offer.amountMinor / 100).toFixed(2)}</strong>
            </article>
          ))}
        </div>
      )}

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
          disabled={!selected || creating || !offers || product !== "DIGITAL"}
          onClick={() => void createOrder()}
        >
          {creating ? "Preparing review..." : "Review & Checkout"}
        </button>
        <button type="button" className="button button-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
    </section>
  );
}
