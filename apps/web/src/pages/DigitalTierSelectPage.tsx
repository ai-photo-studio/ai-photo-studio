// R9.2-P6C-CUSTOMER-MVP-FLOW: server offers -> ORIGINAL/2HD/4HD selection ->
// immutable FixedOrder. Loading offers is a GET (mount/refresh-safe); order
// creation happens only on the explicit "Create order" button click.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type DigitalOfferSummary } from "../services/customerApi";
import { type CustomerUseCaseId } from "../lib/printUseCases";
import { printCropRequired } from "../lib/printSuitability";
import ProductChoiceStage, { type ProductChoiceKey } from "../components/ProductChoiceStage";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Restored Original",
  HD_2X: "2x HD",
  HD_4X: "4x Ultra HD"
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  ORIGINAL: "Original resolution -- basic sharing",
  HD_2X: "Sharper detail for sharing and display",
  HD_4X: "Recommended for printing and larger displays",
  HD_6X: "Large enlargement -- larger prints",
  HD_8X: "High-resolution wall/display enlargement",
  HD_10X: "Extra-large enlargement",
  HD_12X: "Maximum enlargement tier"
};

const TIER_BADGES: Record<string, string> = {
  HD_2X: "MOST POPULAR",
  HD_4X: "BEST FOR PRINTING"
};

type SavedTierState = {
  selected: string;
  product: "DIGITAL" | "PRINT_DIGITAL" | null;
  useCaseId: CustomerUseCaseId | null;
  printSize: string;
  quantity: number;
  printLines?: Array<{ printSize: string; quantity: number }>;
  address: { recipientName: string; phone: string; addressLine1: string; city: string; countryCode: string };
};

// Same rationale as the multi-image cart's CartConfigurePage: Back
// navigation (Review -> Configure) remounts this page fresh, so React
// state alone does not survive it. Session-only, browser-local, never
// sent to the server -- the server-authoritative order-creation call still
// re-validates everything in full.
const storageKey = (draftId: string): string => `restoration-tier-select:${draftId}`;

function readSavedState(draftId: string): SavedTierState | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(draftId));
    return raw ? (JSON.parse(raw) as SavedTierState) : null;
  } catch {
    return null;
  }
}

function writeSavedState(draftId: string, state: SavedTierState): void {
  try {
    window.sessionStorage.setItem(storageKey(draftId), JSON.stringify(state));
  } catch {
    // Best-effort only.
  }
}

export function DigitalTierSelectPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const saved = draftId ? readSavedState(draftId) : null;
  const [offers, setOffers] = useState<DigitalOfferSummary[] | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(saved?.selected ?? null);
  const [product, setProduct] = useState<"DIGITAL" | "PRINT_DIGITAL" | null>(saved?.product ?? null);
  const [useCaseId, setUseCaseId] = useState<CustomerUseCaseId | null>(saved?.useCaseId ?? "SMALL_PRINT");
  const [printCatalog, setPrintCatalog] = useState<Awaited<ReturnType<typeof customerApi.getPrintCatalog>>>([]);
  const [printSize, setPrintSize] = useState(saved?.printSize ?? "");
  const [quantity, setQuantity] = useState(saved?.quantity ?? 1);
  const [printLines, setPrintLines] = useState<Array<{ printSize: string; quantity: number }>>(saved?.printLines ?? []);
  const [address, setAddress] = useState(saved?.address ?? { recipientName: "", phone: "", addressLine1: "", city: "", countryCode: "PK" });
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number | null; height: number | null }>({ width: null, height: null });
  const stageValue = searchParams.get("stage");
  const [showQuality, setShowQuality] = useState(stageValue ? stageValue === "quality" : saved?.product != null);
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

  // Persist so Back-navigation from Review, or an accidental reload,
  // restores exactly what the customer had chosen -- same rationale as
  // CartConfigurePage's identical pattern for the multi-image flow.
  useEffect(() => {
    if (!draftId || !selected) return;
    writeSavedState(draftId, { selected, product, useCaseId, printSize, quantity, printLines, address });
  }, [draftId, selected, product, useCaseId, printSize, quantity, printLines, address]);

  useEffect(() => { if (product === "PRINT_DIGITAL") void customerApi.getPrintCatalog().then((items) => { const currency = offers?.[0]?.currency || "PKR"; const marketItems = items.filter((item) => item.currency === currency); setPrintCatalog(marketItems); if (!printSize && marketItems[0]) { setPrintSize(marketItems[0].size); setQuantity(marketItems[0].minimumQuantity); setPrintLines([{ printSize: marketItems[0].size, quantity: marketItems[0].minimumQuantity }]); } }).catch(() => setPrintCatalog([])); }, [product, offers, printSize]);
  useEffect(() => { if (!draftId) return; void customerApi.getRestorationDraft(token || undefined, draftId, getGuestOwnershipToken(draftId) || undefined).then((draft) => setSourceDimensions({ width: draft.originalWidth, height: draft.originalHeight })).catch(() => setSourceDimensions({ width: null, height: null })); }, [draftId, token]);

  useEffect(() => {
    const stage = searchParams.get("stage");
    if (stage) setShowQuality(stage === "quality");
  }, [searchParams]);

  // Switching back to Digital-only clears print-only selection state so a
  // stale size/quantity/address never leaks into a later Print+Digital
  // order; createOrder() already guards on `product` too, this is belt-
  // and-suspenders for the visible form state.
  useEffect(() => {
    if (product !== "DIGITAL") return;
    setPrintSize("");
    setQuantity(1);
    setPrintLines([]);
    setAddress({ recipientName: "", phone: "", addressLine1: "", city: "", countryCode: "PK" });
  }, [product]);

  const createOrder = async () => {
    if (!draftId || !selected) return;
    setCreating(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(draftId);
      if (!product) return;
       const order = await customerApi.createFixedOrder(token || undefined, { draftId, tier: selected, product, printSize: product === "PRINT_DIGITAL" ? printSize : undefined, quantity: product === "PRINT_DIGITAL" ? quantity : undefined, printLines: product === "PRINT_DIGITAL" ? (printLines.length ? printLines : [{ printSize, quantity }]) : undefined, deliveryAddress: product === "PRINT_DIGITAL" ? address : undefined }, guestToken || undefined);
      if (guestToken) setGuestOwnershipToken(order.orderNo, guestToken);
      navigate(`/orders/${order.orderNo}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the order");
    } finally {
      setCreating(false);
    }
  };

  const selectProduct = (key: ProductChoiceKey) => {
    const nextProduct = key === "digital" ? "DIGITAL" : "PRINT_DIGITAL";
    setProduct(nextProduct);
    setUseCaseId(nextProduct === "DIGITAL" ? "MOBILE_SOCIAL" : "SMALL_PRINT");
    setSearchParams({ stage: "quality" });
    setShowQuality(true);
    window.scrollTo(0, 0);
  };

  const selectedPrintLines = printLines.length ? printLines : [{ printSize, quantity }];
  const cropRequired = product === "PRINT_DIGITAL" && selectedPrintLines.some((line) => printCropRequired(sourceDimensions.width, sourceDimensions.height, line.printSize));

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading pricing...</p></div></section>;

  if (!showQuality) {
    return <ProductChoiceStage
      selected={product === "DIGITAL" ? "digital" : product === "PRINT_DIGITAL" ? "print" : null}
      onSelect={selectProduct}
      onContinue={() => { setShowQuality(true); window.scrollTo(0, 0); }}
      busy={creating}
      error={error}
    />;
  }

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Step 2 of 3 · Image quality</p>
        <h1>Choose image quality</h1>
        <p>{product === "PRINT_DIGITAL" ? "Choose the quality for your digital copy, then configure your approved print sizes and delivery." : "Choose the quality that fits how you will enjoy your restored photo."}</p>
      </div>

      {unavailableReason && <div className="state-panel state-panel-error"><p>{unavailableReason}</p></div>}
      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      {offers && (
        <>
          <div role="radiogroup" aria-label="Image quality" className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {offers.map((offer) => (
              <article
                key={offer.tier}
                role="radio"
                aria-checked={selected === offer.tier}
                tabIndex={0}
                className={`card ${selected === offer.tier ? "card-selected" : ""}`}
                style={{ border: selected === offer.tier ? "2px solid var(--accent)" : undefined, cursor: "pointer" }}
                onClick={() => setSelected(offer.tier)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(offer.tier); } }}
              >
                 <h3>{TIER_LABELS[offer.tier] ?? offer.label}</h3>
                 <p className="helper-text">{TIER_DESCRIPTIONS[offer.tier] ?? offer.label}</p>
                 {TIER_BADGES[offer.tier] && <span className="status-pill">{TIER_BADGES[offer.tier]}</span>}
                 <strong className="quality-price">{offer.currency} {(offer.amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: offer.currency === "PKR" ? 0 : 2, maximumFractionDigits: 2 })}</strong>
              </article>
            ))}
          </div>

          {product === "PRINT_DIGITAL" && selected === "HD_4X" && (
            <div className="state-panel state-panel-info"><p>4x Ultra HD is recommended for most prints.</p></div>
          )}
          {product === "PRINT_DIGITAL" && (selected === "ORIGINAL" || selected === "HD_2X") && (
            <div className="state-panel state-panel-warning"><p>Lower image quality may reduce print quality, especially at larger print sizes. Continue with this quality at your own choice.</p></div>
          )}

            {product === "PRINT_DIGITAL" && (() => {
             const lines = printLines.length ? printLines : [{ printSize, quantity }];
             const printItem = printCatalog.find((entry) => entry.size === lines[0]?.printSize);
             const digitalOffer = offers?.find((offer) => offer.tier === selected);
             const printSubtotals = lines.map((line) => { const item = printCatalog.find((entry) => entry.size === line.printSize); return item && Number.isSafeInteger(line.quantity) && line.quantity >= item.minimumQuantity ? item.unitAmountMinor * line.quantity : null; });
             const printSubtotalMinor = printSubtotals.every((value) => value !== null) ? printSubtotals.reduce((sum, value) => sum + (value ?? 0), 0) : null;
            // Estimated only: the server (quotePrint / FixedOrder creation)
            // is the sole authority on the final total, computed fresh from
            // its own PriceBook + print catalog, never from this value.
             const deliveryAmountMinor = Math.max(...lines.map((line) => printCatalog.find((entry) => entry.size === line.printSize)?.deliveryAmountMinor ?? 0));
             const estimatedTotalMinor =
               printSubtotalMinor !== null && digitalOffer
                 ? digitalOffer.amountMinor + printSubtotalMinor + deliveryAmountMinor
                : null;
            return (
              <div className="state-panel">
                 <div className="stack">
                   {lines.map((line, lineIndex) => {
                     const lineItem = printCatalog.find((entry) => entry.size === line.printSize);
                     const lineMinimum = lineItem?.minimumQuantity ?? 1;
                     return <div className="field-grid" key={`${line.printSize}-${lineIndex}`}>
                       <label>Print size<select value={line.printSize} onChange={(event) => { const item = printCatalog.find((entry) => entry.size === event.target.value); const next = [...lines]; next[lineIndex] = { printSize: event.target.value, quantity: item?.minimumQuantity ?? 1 }; setPrintLines(next); setPrintSize(next[0].printSize); setQuantity(next[0].quantity); }}>
                         {printCatalog.map((item) => <option key={item.size} value={item.size}>{item.size} — {item.currency} {(item.unitAmountMinor / 100).toFixed(2)}{item.blocker ? ` (${item.blocker})` : ""}</option>)}
                       </select></label>
                       <label>Quantity<input type="number" min={lineMinimum} max={10} value={line.quantity} onChange={(event) => { const next = [...lines]; next[lineIndex] = { ...next[lineIndex], quantity: Number(event.target.value) }; setPrintLines(next); setPrintSize(next[0].printSize); setQuantity(next[0].quantity); }} />{line.quantity < lineMinimum && <small className="field-error">Minimum quantity for this size is {lineMinimum}.</small>}</label>
                       {lineIndex > 0 && <button type="button" className="button button-ghost" onClick={() => { const next = lines.filter((_, index) => index !== lineIndex); setPrintLines(next); }}>Remove line</button>}
                     </div>;
                   })}
                   {lines.length < 10 && <button type="button" className="button button-secondary" onClick={() => setPrintLines([...lines, { printSize: printCatalog[0]?.size || printSize, quantity: printCatalog[0]?.minimumQuantity || 1 }])}>Add another print size</button>}
                 </div>
                 <div className="field-grid">
                  <label>Recipient name<input value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} /></label>
                  <label>Phone<input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} /></label>
                  <label>Address<input value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} /></label>
                  <label>City<input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></label>
                </div>
                {(printItem || digitalOffer) && (
                  <dl className="order-summary">
                    {digitalOffer && <div><dt>Image quality ({TIER_LABELS[digitalOffer.tier] ?? digitalOffer.label})</dt><dd>{digitalOffer.currency} {(digitalOffer.amountMinor / 100).toFixed(2)}</dd></div>}
                     {lines.map((line, lineIndex) => { const item = printCatalog.find((entry) => entry.size === line.printSize); return item ? <div key={`${line.printSize}-summary-${lineIndex}`}><dt>Print {lineIndex + 1} · {line.printSize} × {line.quantity}</dt><dd>{item.currency} {((item.unitAmountMinor * line.quantity) / 100).toFixed(2)}</dd></div> : null; })}
                    {printSubtotalMinor !== null && <div><dt>Print subtotal</dt><dd>{printItem?.currency} {(printSubtotalMinor / 100).toFixed(2)}</dd></div>}
                     <div><dt>Delivery</dt><dd>{printItem ? `${printItem.currency} ${(deliveryAmountMinor / 100).toFixed(2)}` : "Calculated by server"}</dd></div>
                    {estimatedTotalMinor !== null && <div><dt><strong>Estimated Total</strong></dt><dd><strong>{digitalOffer?.currency} {(estimatedTotalMinor / 100).toFixed(2)}</strong></dd></div>}
                  </dl>
                )}
                 <p className="helper-text">The final order total is calculated and confirmed by the server on the Review page.</p>
                 {cropRequired && <div className="state-panel state-panel-warning"><p>This image does not match the selected print aspect ratio. Choose a different print size to avoid cropping important parts of the photo.</p></div>}
               </div>
            );
          })()}
          </>
       )}

      <div className="button-row journey-actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
            disabled={!selected || !product || creating || !offers || cropRequired || (product === "PRINT_DIGITAL" && (selectedPrintLines.some((line) => !line.printSize || !Number.isSafeInteger(line.quantity) || line.quantity < (printCatalog.find((item) => item.size === line.printSize)?.minimumQuantity ?? 1) || line.quantity > 10) || !address.recipientName || !address.phone || !address.addressLine1 || !address.city))}
          onClick={() => void createOrder()}
        >
          {creating ? "Preparing review..." : "Continue to Review"}
        </button>
        <button type="button" className="button button-secondary compact-refresh" onClick={() => void load()}>
          Refresh
        </button>
        <button type="button" className="button button-ghost" onClick={() => { setSearchParams({ stage: "product" }); setShowQuality(false); window.scrollTo(0, 0); }}>
          Back to Product
        </button>
      </div>
    </section>
  );
}
