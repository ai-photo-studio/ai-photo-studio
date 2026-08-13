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
import { bestUseCaseResult, ORDERABLE_CUSTOMER_USE_CASES, type CustomerUseCaseId } from "../lib/printUseCases";
import { printCropRequired } from "../lib/printSuitability";

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
  product: "DIGITAL" | "PRINT_DIGITAL" | null;
  useCaseId: CustomerUseCaseId | null;
  printSize: string;
  quantity: number;
  printLines?: Array<{ printSize: string; quantity: number }>;
};

type SavedConfigureState = { configs: Record<string, ItemConfig>; address: { recipientName: string; phone: string; addressLine1: string; city: string; countryCode: string } };

// Back navigation (Review -> Configure) remounts this page fresh -- React
// state alone does not survive that. Session-only, browser-local, never
// sent anywhere: purely so a customer's own in-progress per-image choices
// on THIS device survive going back to adjust something, exactly like the
// single-upload flow's existing sessionStorage use for file metadata.
const storageKey = (draftIds: string[]): string => `restoration-cart-configure:${[...draftIds].sort().join(",")}`;

function readSavedState(draftIds: string[]): SavedConfigureState | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(draftIds));
    return raw ? (JSON.parse(raw) as SavedConfigureState) : null;
  } catch {
    return null;
  }
}

function writeSavedState(draftIds: string[], state: SavedConfigureState): void {
  try {
    window.sessionStorage.setItem(storageKey(draftIds), JSON.stringify(state));
  } catch {
    // Best-effort only -- never blocks the flow if storage is unavailable.
  }
}

export function CartConfigurePage() {
  const { draftIds: draftIdsParam } = useParams<{ draftIds: string }>();
  const draftIds = (draftIdsParam || "").split(",").filter(Boolean);
  const { token } = useAuth();
  const navigate = useNavigate();
  const [offersByDraft, setOffersByDraft] = useState<Record<string, DigitalOfferSummary[]>>({});
  const [printCatalog, setPrintCatalog] = useState<Awaited<ReturnType<typeof customerApi.getPrintCatalog>>>([]);
  const [configs, setConfigs] = useState<Record<string, ItemConfig>>({});
  const [dimensionsByDraft, setDimensionsByDraft] = useState<Record<string, { width: number | null; height: number | null }>>({});
  const [address, setAddress] = useState({ recipientName: "", phone: "", addressLine1: "", city: "", countryCode: "PK" });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [offerResults, catalog, draftResults] = await Promise.all([
        Promise.all(draftIds.map((id) => customerApi.getRestorationDraftOffers(token || undefined, id, getGuestOwnershipToken(id) || undefined).then((data) => [id, data] as const))),
        customerApi.getPrintCatalog(),
        Promise.all(draftIds.map((id) => customerApi.getRestorationDraft(token || undefined, id, getGuestOwnershipToken(id) || undefined).then((draft) => [id, { width: draft.originalWidth, height: draft.originalHeight }] as const)))
      ]);
      if (!mounted.current) return;
      const saved = readSavedState(draftIds);
      const byDraft: Record<string, DigitalOfferSummary[]> = {};
      const initialConfigs: Record<string, ItemConfig> = {};
      for (const [id, offers] of offerResults) {
        if (Array.isArray(offers)) {
          byDraft[id] = offers;
          const savedConfig = saved?.configs[id];
          const savedTierStillOffered = savedConfig && offers.some((o) => o.tier === savedConfig.tier);
          initialConfigs[id] = savedTierStillOffered
            ? savedConfig
             : { tier: offers[0]?.tier ?? "ORIGINAL", product: null, useCaseId: null, printSize: "", quantity: 1, printLines: [] };
        }
      }
      setOffersByDraft(byDraft);
      setConfigs(initialConfigs);
      setDimensionsByDraft(Object.fromEntries(draftResults));
      if (saved?.address) setAddress(saved.address);
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

  // Persist on every change (after the initial load has populated configs)
  // so Back-navigation from Review, or an accidental reload, restores
  // exactly what the customer had chosen -- never re-sent to the server,
  // purely a same-device convenience the server-authoritative submit still
  // re-validates in full.
  useEffect(() => {
    if (loading || Object.keys(configs).length === 0) return;
    writeSavedState(draftIds, { configs, address });
  }, [configs, address, loading, draftIds.join(",")]);

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
  const cropRequired = anyPrint && draftIds.some((id) => {
    const config = configs[id];
    const dimensions = dimensionsByDraft[id];
    const lines = config?.printLines?.length ? config.printLines : config ? [{ printSize: config.printSize, quantity: config.quantity }] : [];
    return lines.some((line) => printCropRequired(dimensions?.width ?? null, dimensions?.height ?? null, line.printSize));
  });

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
           printLines: c.product === "PRINT_DIGITAL" ? (c.printLines?.length ? c.printLines : [{ printSize: c.printSize, quantity: c.quantity }]) : undefined,
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
    if (c.product === "DIGITAL") return Boolean(c.useCaseId);
    if (c.product !== "PRINT_DIGITAL") return false;
    const lines = c.printLines?.length ? c.printLines : [{ printSize: c.printSize, quantity: c.quantity }];
    return Boolean(c.useCaseId) && lines.every((line) => {
      const minimum = printCatalog.find((entry) => entry.size === line.printSize)?.minimumQuantity ?? 1;
      return Boolean(line.printSize) && Number.isSafeInteger(line.quantity) && line.quantity >= minimum && line.quantity <= 10;
    });
  });
  const addressReady = !anyPrint || (address.recipientName.trim() && address.phone.trim() && address.addressLine1.trim() && address.city.trim());

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Configure photos</p>
        <h1>Choose product and image quality for each photo</h1>
        <p>Each photo can have a different product and image quality.</p>
      </div>

      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      {draftIds.map((id, index) => {
        const offers = offersByDraft[id] || [];
        const config = configs[id];
        if (!config) return null;
        return (
          <div className="card" key={id} style={{ marginBottom: "1.25rem" }}>
            <h2 className="section-subheading">Photo {index + 1} of {draftIds.length}</h2>

            <p className="helper-text">1. Choose product</p>
            <div role="radiogroup" aria-label={`Product for photo ${index + 1}`} className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <button type="button" role="radio" aria-checked={config.product === "DIGITAL"} className={`card product-choice ${config.product === "DIGITAL" ? "card-selected" : ""}`} onClick={() => updateConfig(id, { product: "DIGITAL", useCaseId: "MOBILE_SOCIAL" })}>
                <h3 style={{ fontSize: "1rem" }}>Digital Download</h3>
              </button>
              <button type="button" role="radio" aria-checked={config.product === "PRINT_DIGITAL"} className={`card product-choice ${config.product === "PRINT_DIGITAL" ? "card-selected" : ""}`} onClick={() => updateConfig(id, { product: "PRINT_DIGITAL", useCaseId: null, printSize: config.printSize || printCatalog[0]?.size || "", quantity: config.quantity || printCatalog[0]?.minimumQuantity || 1, printLines: config.printLines?.length ? config.printLines : [{ printSize: config.printSize || printCatalog[0]?.size || "", quantity: config.quantity || printCatalog[0]?.minimumQuantity || 1 }] })}>
                <h3 style={{ fontSize: "1rem" }}>Print + Digital</h3>
              </button>
            </div>

            {!config.product ? <p className="helper-text" style={{ marginTop: "1rem" }}>Select a product to continue configuring this photo.</p> : <>
             {config.product === "PRINT_DIGITAL" && <p className="helper-text" style={{ marginTop: "1rem" }}>2. Where would you like to use this photo?</p>}
             {config.product === "PRINT_DIGITAL" && <>
            <div role="radiogroup" aria-label={`Photo use case for photo ${index + 1}`} className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
              {ORDERABLE_CUSTOMER_USE_CASES.filter((useCase) => config.product === "PRINT_DIGITAL" ? useCase.id !== "MOBILE_SOCIAL" : useCase.id === "MOBILE_SOCIAL").map((useCase) => (
                <button key={useCase.id} type="button" role="radio" aria-checked={config.useCaseId === useCase.id} className={`card product-choice ${config.useCaseId === useCase.id ? "card-selected" : ""}`} onClick={() => updateConfig(id, { useCaseId: useCase.id, printSize: useCase.sizes[0] || config.printSize })}>
                  <h3 style={{ fontSize: "1rem" }}>{useCase.label}</h3><p className="helper-text">{useCase.copy}</p><small>{useCase.sizes.length ? useCase.sizes.join(", ") : "Digital sharing"}</small>
                  {(() => { const dimensions = dimensionsByDraft[id]; const suitability = bestUseCaseResult(useCase, dimensions?.width ?? null, dimensions?.height ?? null); return suitability?.result ? <small className="helper-text">Current image: {suitability.result.category} at {suitability.result.effectivePpi} PPI · minimum quality {suitability.requiredTier}</small> : null; })()}
                </button>
              ))}
             </div>
             </>}
             {!config.useCaseId ? <p className="helper-text">Choose a product to continue configuring this photo.</p> : <>
            <p className="helper-text" style={{ marginTop: "1rem" }}>2. Choose image quality</p>
            <div role="radiogroup" aria-label={`Image quality for photo ${index + 1}`} className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
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
              <div className="state-panel state-panel-warning"><p>Lower image quality may reduce print quality, especially for larger prints. You can continue with this setting at your own choice.</p></div>
            )}

            {config.product === "PRINT_DIGITAL" && (
               <div className="stack">
                 {(config.printLines?.length ? config.printLines : [{ printSize: config.printSize, quantity: config.quantity }]).map((line, lineIndex) => {
                   const lineItem = printCatalog.find((entry) => entry.size === line.printSize);
                   const lineMinimum = lineItem?.minimumQuantity ?? 1;
                   return <div className="field-grid" key={`${id}-${lineIndex}`}>
                     <label>Print size<select value={line.printSize} onChange={(e) => { const item = printCatalog.find((entry) => entry.size === e.target.value); const lines = [...(config.printLines?.length ? config.printLines : [{ printSize: config.printSize, quantity: config.quantity }])]; lines[lineIndex] = { printSize: e.target.value, quantity: item?.minimumQuantity ?? 1 }; updateConfig(id, { printLines: lines, printSize: lines[0].printSize, quantity: lines[0].quantity }); }}>
                       {printCatalog.map((item) => <option key={item.size} value={item.size}>{item.size} — {item.currency} {(item.unitAmountMinor / 100).toFixed(2)}</option>)}
                     </select></label>
                     <label>Quantity<input type="number" min={lineMinimum} max={10} value={line.quantity} onChange={(e) => { const lines = [...(config.printLines?.length ? config.printLines : [{ printSize: config.printSize, quantity: config.quantity }])]; lines[lineIndex] = { ...lines[lineIndex], quantity: Number(e.target.value) }; updateConfig(id, { printLines: lines, printSize: lines[0].printSize, quantity: lines[0].quantity }); }} />{line.quantity < lineMinimum && <small className="field-error">Minimum quantity is {lineMinimum}.</small>}</label>
                     {lineIndex > 0 && <button type="button" className="button button-ghost" onClick={() => { const lines = [...(config.printLines || [])]; lines.splice(lineIndex, 1); updateConfig(id, { printLines: lines }); }}>Remove line</button>}
                   </div>;
                 })}
                 {(config.printLines?.length ?? 1) < 10 && <button type="button" className="button button-secondary" onClick={() => updateConfig(id, { printLines: [...(config.printLines?.length ? config.printLines : [{ printSize: config.printSize, quantity: config.quantity }]), { printSize: printCatalog[0]?.size || config.printSize, quantity: printCatalog[0]?.minimumQuantity || 1 }] })}>Add another print size</button>}
               </div>
            )}
            <button type="button" className="button button-ghost" onClick={() => updateConfig(id, { useCaseId: null })}>Back to Use Case</button>
            </>}
            </>}

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

      {cropRequired && <div className="state-panel state-panel-warning"><p>One selected print size does not match its image aspect ratio. Choose a different print size to avoid cropping important parts of the photo.</p></div>}

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button type="button" className="button" disabled={!allConfigured || !addressReady || creating || cropRequired} onClick={() => void submit()}>
          {creating ? "Preparing review..." : "Continue to Review"}
        </button>
        <button type="button" className="button button-ghost" onClick={() => navigate(`/restore-cart/${draftIds.join(",")}/preview`)}>Back to Preview</button>
      </div>
    </section>
  );
}
