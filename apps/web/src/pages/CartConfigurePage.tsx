// R9.5-P5Q-MULTI-IMAGE-UI-CART: per-image restoration quality + delivery
// configuration for a 2-10 image cart, with an optional "Apply to all"
// shortcut. Submits the whole cart in one authoritative
// POST /api/fixed-orders/restoration-cart call -- the server (not this
// page) computes every price, the one order-level delivery charge, and the
// grand total.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type DigitalOfferSummary } from "../services/customerApi";

const TIER_LABELS: Record<string, string> = { ORIGINAL: "Restored Original", HD_2X: "2x HD", HD_4X: "4x Ultra HD" };
const TIER_DESCRIPTIONS: Record<string, string> = {
  ORIGINAL: "Original resolution -- basic sharing",
  HD_2X: "Sharper detail for sharing and display",
  HD_4X: "Recommended for printing and larger displays",
  HD_6X: "Large enlargement -- larger prints",
  HD_8X: "High-resolution wall/display enlargement",
  HD_10X: "Extra-large enlargement",
  HD_12X: "Maximum enlargement tier"
};

type ItemConfig = {
  tier: string;
  product: "DIGITAL" | "PRINT_DIGITAL";
  printSize: string;
  quantity: number;
};

export function CartConfigurePage() {
  const { draftIds: draftIdsParam } = useParams<{ draftIds: string }>();
  const draftIds = (draftIdsParam || "").split(",").filter(Boolean);
  const { token } = useAuth();
  const navigate = useNavigate();
  const [offersByDraft, setOffersByDraft] = useState<Record<string, DigitalOfferSummary[]>>({});
  const [printCatalog, setPrintCatalog] = useState<Awaited<ReturnType<typeof customerApi.getPrintCatalog>>>([]);
  const [configs, setConfigs] = useState<Record<string, ItemConfig>>({});
  const [address, setAddress] = useState({ recipientName: "", phone: "", addressLine1: "", city: "", countryCode: "PK" });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [offerResults, catalog] = await Promise.all([
        Promise.all(draftIds.map((id) => customerApi.getRestorationDraftOffers(token || undefined, id, getGuestOwnershipToken(id) || undefined).then((data) => [id, data] as const))),
        customerApi.getPrintCatalog()
      ]);
      if (!mounted.current) return;
      const byDraft: Record<string, DigitalOfferSummary[]> = {};
      const initialConfigs: Record<string, ItemConfig> = {};
      for (const [id, offers] of offerResults) {
        if (Array.isArray(offers)) {
          byDraft[id] = offers;
          initialConfigs[id] = { tier: offers[0]?.tier ?? "ORIGINAL", product: "DIGITAL", printSize: "", quantity: 1 };
        }
      }
      setOffersByDraft(byDraft);
      setConfigs(initialConfigs);
      setPrintCatalog(catalog.filter((item) => item.currency === "PKR"));
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Unable to load pricing");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [draftIds.join(","), token]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const updateConfig = (draftId: string, patch: Partial<ItemConfig>) => {
    setConfigs((prev) => ({ ...prev, [draftId]: { ...prev[draftId], ...patch } }));
  };

  const applyToAll = (sourceDraftId: string) => {
    const source = configs[sourceDraftId];
    if (!source) return;
    setConfigs((prev) => {
      const next = { ...prev };
      for (const id of draftIds) {
        const offers = offersByDraft[id] || [];
        const hasTier = offers.some((o) => o.tier === source.tier);
        next[id] = { ...next[id], ...(hasTier ? source : { ...source, tier: offers[0]?.tier ?? source.tier }) };
      }
      return next;
    });
  };

  const anyPrint = draftIds.some((id) => configs[id]?.product === "PRINT_DIGITAL");

  const submit = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const items = draftIds.map((id) => {
        const c = configs[id];
        return {
          draftId: id,
          tier: c.tier,
          product: c.product,
          printSize: c.product === "PRINT_DIGITAL" ? c.printSize : undefined,
          quantity: c.product === "PRINT_DIGITAL" ? c.quantity : undefined,
          // Each draft was uploaded anonymously in its own call and may
          // carry its own distinct guest ownership token -- send every
          // item's own token, not just the first draft's.
          guestOwnershipToken: getGuestOwnershipToken(id) || undefined
        };
      });
      // All drafts in one cart share the same guest ownership token store
      // key pattern as the single-image flow -- use the first draft's.
      const guestToken = getGuestOwnershipToken(draftIds[0]);
      const order = await customerApi.createRestorationCartOrder(token || undefined, { items, deliveryAddress: anyPrint ? address : undefined }, guestToken || undefined);
      if (guestToken) setGuestOwnershipToken(order.orderNo, guestToken);
      navigate(`/orders/${order.orderNo}/cart`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the order");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading pricing...</p></div></section>;

  const allConfigured = draftIds.every((id) => {
    const c = configs[id];
    if (!c) return false;
    if (c.product === "DIGITAL") return true;
    return Boolean(c.printSize) && Number.isSafeInteger(c.quantity) && c.quantity > 0;
  });
  const addressReady = !anyPrint || (address.recipientName.trim() && address.phone.trim() && address.addressLine1.trim() && address.city.trim());

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Configure photos</p>
        <h1>Choose restoration and delivery for each photo</h1>
        <p>Each photo can have a different restoration quality and delivery option. Prices are server-owned.</p>
      </div>

      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      {draftIds.map((id, index) => {
        const offers = offersByDraft[id] || [];
        const config = configs[id];
        if (!config) return null;
        const printItem = printCatalog.find((entry) => entry.size === config.printSize);
        const minimumQuantity = printItem?.minimumQuantity ?? 1;
        const belowMinimum = config.product === "PRINT_DIGITAL" && Number.isSafeInteger(config.quantity) && config.quantity < minimumQuantity;
        return (
          <div className="card" key={id} style={{ marginBottom: "1.25rem" }}>
            <h2 className="section-subheading">Photo {index + 1} of {draftIds.length}</h2>

            <p className="helper-text">1. Restoration quality</p>
            <div role="radiogroup" aria-label={`Restoration quality for photo ${index + 1}`} className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {offers.map((offer) => (
                <article
                  key={offer.tier}
                  role="radio"
                  aria-checked={config.tier === offer.tier}
                  tabIndex={0}
                  className={`card ${config.tier === offer.tier ? "card-selected" : ""}`}
                  style={{ border: config.tier === offer.tier ? "2px solid var(--accent)" : undefined, cursor: "pointer", padding: "12px" }}
                  onClick={() => updateConfig(id, { tier: offer.tier })}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); updateConfig(id, { tier: offer.tier }); } }}
                >
                  <h3 style={{ fontSize: "1rem" }}>{TIER_LABELS[offer.tier] ?? offer.label}</h3>
                  <p className="helper-text">{TIER_DESCRIPTIONS[offer.tier] ?? offer.label}</p>
                  <strong>{offer.currency} {(offer.amountMinor / 100).toFixed(2)}</strong>
                </article>
              ))}
            </div>

            {config.product === "PRINT_DIGITAL" && config.tier === "HD_4X" && (
              <div className="state-panel state-panel-info"><p>4x Ultra HD is recommended for most prints.</p></div>
            )}
            {config.product === "PRINT_DIGITAL" && (config.tier === "ORIGINAL" || config.tier === "HD_2X") && (
              <div className="state-panel state-panel-warning"><p>Lower restoration resolution may reduce print quality, especially for larger prints. You can continue with this setting at your own choice.</p></div>
            )}

            <p className="helper-text" style={{ marginTop: "1rem" }}>2. Delivery</p>
            <div role="radiogroup" aria-label={`Delivery for photo ${index + 1}`} className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <button type="button" role="radio" aria-checked={config.product === "DIGITAL"} className={`card product-choice ${config.product === "DIGITAL" ? "card-selected" : ""}`} onClick={() => updateConfig(id, { product: "DIGITAL" })}>
                <h3 style={{ fontSize: "1rem" }}>Digital Download</h3>
              </button>
              <button type="button" role="radio" aria-checked={config.product === "PRINT_DIGITAL"} className={`card product-choice ${config.product === "PRINT_DIGITAL" ? "card-selected" : ""}`} onClick={() => updateConfig(id, { product: "PRINT_DIGITAL", printSize: config.printSize || printCatalog[0]?.size || "", quantity: config.quantity || printCatalog[0]?.minimumQuantity || 1 })}>
                <h3 style={{ fontSize: "1rem" }}>Print + Digital</h3>
              </button>
            </div>

            {config.product === "PRINT_DIGITAL" && (
              <div className="field-grid">
                <label>
                  Print size
                  <select value={config.printSize} onChange={(e) => { const item = printCatalog.find((entry) => entry.size === e.target.value); updateConfig(id, { printSize: e.target.value, quantity: item?.minimumQuantity ?? 1 }); }}>
                    {printCatalog.map((item) => <option key={item.size} value={item.size}>{item.size} — {item.currency} {(item.unitAmountMinor / 100).toFixed(2)}</option>)}
                  </select>
                </label>
                <label>
                  Quantity
                  <input type="number" min={minimumQuantity} value={config.quantity} onChange={(e) => updateConfig(id, { quantity: Number(e.target.value) })} />
                  {belowMinimum && <small className="field-error">Minimum quantity for this size is {minimumQuantity}.</small>}
                </label>
              </div>
            )}

            <div className="button-row" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="button button-secondary" onClick={() => applyToAll(id)}>Apply these settings to all photos</button>
            </div>
          </div>
        );
      })}

      {anyPrint && (
        <div className="card">
          <h2 className="section-subheading">Delivery address</h2>
          <p className="helper-text">One delivery address covers every printed photo in this order. Delivery is charged once, at the highest applicable band.</p>
          <div className="field-grid">
            <label>Recipient name<input value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} /></label>
            <label>Phone<input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} /></label>
            <label>Address<input value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} /></label>
            <label>City<input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></label>
          </div>
        </div>
      )}

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button type="button" className="button" disabled={!allConfigured || !addressReady || creating} onClick={() => void submit()}>
          {creating ? "Preparing review..." : "Continue to Review"}
        </button>
        <button type="button" className="button button-ghost" onClick={() => navigate(`/restore-cart/${draftIds.join(",")}/preview`)}>Back to Preview</button>
      </div>
    </section>
  );
}
