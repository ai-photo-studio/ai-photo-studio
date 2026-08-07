import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { fixedOrderApi, restorationDraftApi } from "../services/customerApi";
import type { DraftOffersResponse } from "../lib/portal-types";
import { ApiError } from "../lib/api";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  HD_2X: "2HD",
  HD_4X: "4HD"
};

const formatOfferPrice = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);

// R9.2-P1A: server-owned digital-tier offers only -- PKR for Pakistan, USD
// for International, never both, never client-invented, never a fabricated
// price when International pricing is unavailable.
export function DigitalTierSelectPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DraftOffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const guestToken = getGuestOwnershipToken(draftId) || undefined;
        const result = await restorationDraftApi.getOffers(draftId, token || undefined, guestToken);
        if (!cancelled) setOffers(result);
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiError && loadError.status === 404) {
          setError("This draft could not be found, or you do not have access to it.");
        } else {
          setError("Unable to load pricing right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [draftId, token]);

  const selectTier = async (tier: string) => {
    if (!draftId || creating) return;
    setCreating(tier);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(draftId) || undefined;
      const order = await fixedOrderApi.createRestorationDigitalOrder(draftId, tier, token || undefined, guestToken);
      if (order.guestOwnershipToken) {
        setGuestOwnershipToken(draftId, order.guestOwnershipToken);
      }
      navigate(`/restore/drafts/${draftId}/review?orderNo=${encodeURIComponent(order.orderNo)}`);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(`${submitError.message} (${submitError.code || submitError.status})`);
      } else {
        setError("Unable to create your order right now.");
      }
    } finally {
      setCreating(null);
    }
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Photo Restoration</p>
        <h1>Choose Your Resolution</h1>
        <p>Prices are server-set for your confirmed market and shown in one currency only.</p>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading offers...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : offers && Array.isArray(offers.offers) ? (
        <div
          className="pricing-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}
        >
          {offers.offers.map((offer) => (
            <article key={offer.tier} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div className="card-top">
                <div>
                  <p className="eyebrow">{formatOfferPrice(offer.amountMinor, offer.currency)}</p>
                  <h3>{TIER_LABELS[offer.tier] || offer.label}</h3>
                </div>
              </div>
              <p>{offer.description}</p>
              <div className="button-row" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="button button-block"
                  disabled={creating !== null}
                  onClick={() => selectTier(offer.tier)}
                >
                  {creating === offer.tier ? "Creating order..." : `Select ${TIER_LABELS[offer.tier] || offer.label}`}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : offers ? (
        <div className="state-panel state-panel-error">
          <p>{offers.offers && "reason" in offers.offers ? offers.offers.reason : "Pricing is not available for your market yet."}</p>
        </div>
      ) : null}
    </section>
  );
}
