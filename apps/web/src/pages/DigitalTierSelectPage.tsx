// R9.2-P6C-CUSTOMER-MVP-FLOW: server offers -> ORIGINAL/2HD/4HD selection ->
// immutable FixedOrder. Loading offers is a GET (mount/refresh-safe); order
// creation happens only on the explicit "Create order" button click.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type DigitalOfferSummary } from "../services/customerApi";
import { type CustomerUseCaseId } from "../lib/printUseCases";
import { minimumPrintTier, printCropRequired } from "../lib/printSuitability";
import ProductChoiceStage, { type ProductChoiceKey } from "../components/ProductChoiceStage";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Restored Original",
  HD_2X: "2x HD",
  HD_4X: "4x Ultra HD",
  HD_6X: "6x Super HD",
  HD_8X: "8x Extreme HD",
  HD_10X: "10x Gallery HD",
  HD_12X: "12x Master HD"
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  ORIGINAL: "Original resolution -- basic sharing",
  HD_2X: "Sharper detail for sharing and display",
  HD_4X: "Recommended for printing and larger displays",
  HD_6X: "Great for table frames and medium prints",
  HD_8X: "Excellent for large prints and wall frames",
  HD_10X: "Best for canvas and premium wall art",
  HD_12X: "For the biggest print sizes and premium output"
};

const TIER_IMAGES: Record<string, string> = {
  HD_2X: "/assets/quality-tiers/2x-hd-family.webp",
  HD_4X: "/assets/quality-tiers/4x-ultra-hd-family.webp",
  HD_6X: "/assets/quality-tiers/6x-super-hd-table-frame.webp",
  HD_8X: "/assets/quality-tiers/8x-extreme-hd-wall-frame.webp",
  HD_10X: "/assets/quality-tiers/10x-gallery-hd-triple-canvas-wedding.webp",
  HD_12X: "/assets/quality-tiers/12x-master-hd-triple-canvas-family.webp"
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
  address: { recipientName: string; phone: string; addressLine1: string; city: string; region: string; countryCode: string };
  printStep?: "config" | "delivery";
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
  const [address, setAddress] = useState(saved?.address ?? { recipientName: "", phone: "", addressLine1: "", city: "", region: "", countryCode: "PK" });
  const [printStep, setPrintStep] = useState<"config" | "delivery">(saved?.printStep ?? "config");
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
     writeSavedState(draftId, { selected, product, useCaseId, printSize, quantity, printLines, address, printStep });
  }, [draftId, selected, product, useCaseId, printSize, quantity, printLines, address, printStep]);

  useEffect(() => { if (product === "PRINT_DIGITAL") void customerApi.getSinglePrintCatalog().then((items) => { const currency = offers?.[0]?.currency || "PKR"; setPrintCatalog(items.filter((item) => item.currency === currency)); }).catch(() => setPrintCatalog([])); }, [product, offers]);
  useEffect(() => { if (!draftId) return; void customerApi.getRestorationDraft(token || undefined, draftId, getGuestOwnershipToken(draftId) || undefined).then((draft) => setSourceDimensions({ width: draft.originalWidth, height: draft.originalHeight })).catch(() => setSourceDimensions({ width: null, height: null })); }, [draftId, token]);

  useEffect(() => {
    if (product !== "PRINT_DIGITAL" || !offers || !printSize) {
      if (product === "PRINT_DIGITAL" && !printSize) setSelected(null);
      return;
    }
    const lines = printLines.length ? printLines : [{ printSize, quantity }];
    const tiers = lines.map((line) => minimumPrintTier(sourceDimensions.width, sourceDimensions.height, line.printSize));
    const order = ["ORIGINAL", "HD_2X", "HD_4X", "HD_6X", "HD_8X", "HD_10X", "HD_12X"];
    const required = tiers.filter(Boolean).sort((a, b) => order.indexOf(b as string) - order.indexOf(a as string))[0] ?? "ORIGINAL";
    setSelected(required);
  }, [product, offers, printLines, printSize, quantity, sourceDimensions]);

  useEffect(() => {
    const stage = searchParams.get("stage");
    setShowQuality(stage === "quality");
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
     setAddress({ recipientName: "", phone: "", addressLine1: "", city: "", region: "", countryCode: "PK" });
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
       navigate(`/orders/${order.orderNo}/payment`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the order");
    } finally {
      setCreating(false);
    }
  };

  const continueToDelivery = () => {
    if (product !== "PRINT_DIGITAL") return;
    if (cropRequired || !printSize || !Number.isSafeInteger(quantity) || quantity < 1) return;
    setPrintStep("delivery");
    window.scrollTo(0, 0);
  };

  const selectProduct = (key: ProductChoiceKey) => {
    const nextProduct = key === "digital" ? "DIGITAL" : "PRINT_DIGITAL";
    setProduct(nextProduct);
    setPrintStep("config");
    setUseCaseId(nextProduct === "DIGITAL" ? "MOBILE_SOCIAL" : "SMALL_PRINT");
  };

  const selectedPrintLines = printLines.length ? printLines : [{ printSize, quantity }];
  const cropRequired = product === "PRINT_DIGITAL" && selectedPrintLines.some((line) => printCropRequired(sourceDimensions.width, sourceDimensions.height, line.printSize));

  if (loading) return <section className="page-stack"><div className="state-panel"><p>Loading pricing...</p></div></section>;

  if (!showQuality) {
    return <ProductChoiceStage
      selected={product === "DIGITAL" ? "digital" : product === "PRINT_DIGITAL" ? "print" : null}
      onSelect={selectProduct}
      onContinue={() => { if (!product) return; setSearchParams({ stage: "quality" }); setShowQuality(true); window.scrollTo(0, 0); }}
      busy={creating}
      error={error}
    />;
  }

  if (product === "PRINT_DIGITAL" && printStep === "delivery") {
    const validPakistanPhone = /^(?:\+92|0)3\d{9}$/.test(address.phone.replace(/[\s-]/g, ""));
    const deliveryItem = printCatalog.find((entry) => entry.size === printSize);
    const deliveryEnhancement = selected === "ORIGINAL" ? 0 : offers?.find((offer) => offer.tier === selected)?.amountMinor ?? 0;
    const deliveryPrint = (deliveryItem?.unitAmountMinor ?? 0) * quantity;
    const deliveryCharge = deliveryItem?.deliveryAmountMinor ?? 0;
    return <section className="page-stack">
      <div className="section-heading"><p className="eyebrow">Step 3 of 4 · Delivery details</p><h1>Where should we deliver?</h1><p>Your print configuration is saved. Add delivery details to continue to payment.</p></div>
      <div className="card delivery-details-card"><div className="field-grid"><label>Full recipient name<input value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} /></label><label>Mobile number<input type="tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} /></label><label>Address line<input value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} /></label><label>City<input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></label><label>Province / Region<input value={address.region} onChange={(e) => setAddress({ ...address, region: e.target.value })} /></label></div></div>
      <div className="card"><dl className="order-summary"><div><dt>Print</dt><dd>{deliveryItem ? `${deliveryItem.currency} ${(deliveryPrint / 100).toLocaleString()}` : "Select a size"}</dd></div><div><dt>Upscale required for this print</dt><dd>{deliveryEnhancement ? `${TIER_LABELS[selected || ""]} — ${offers?.[0]?.currency || "PKR"} ${(deliveryEnhancement / 100).toLocaleString()}` : "Not required — your image is suitable"}</dd></div><div><dt>Delivery</dt><dd>{deliveryItem ? `${deliveryItem.currency} ${(deliveryCharge / 100).toLocaleString()}` : "Calculated by server"}</dd></div><div><dt><strong>Estimated total</strong></dt><dd><strong>{deliveryItem ? `${deliveryItem.currency} ${((deliveryPrint + deliveryEnhancement + deliveryCharge) / 100).toLocaleString()}` : "Calculated by server"}</strong></dd></div></dl></div>
      <div className="button-row journey-actions"><button type="button" className="button" disabled={!address.recipientName || !validPakistanPhone || !address.addressLine1 || !address.city || !address.region} onClick={() => void createOrder()}>{creating ? "Preparing payment..." : "Continue to Payment"}</button><button type="button" className="button button-secondary" onClick={() => setPrintStep("config")}>Back to Print Configuration</button></div>
    </section>;
  }

  return (
    <section className="page-stack">
       <div className="section-heading">
        <p className="eyebrow">Step 2 of 3 · {product === "PRINT_DIGITAL" ? "Print configuration" : "Image quality"}</p>
        <h1>{product === "PRINT_DIGITAL" ? "Configure your print" : "Choose image quality"}</h1>
        <p>{product === "PRINT_DIGITAL" ? "Choose a print size and quantity. Enhancement is calculated automatically." : "Choose the quality that fits how you will enjoy your restored photo."}</p>
      </div>

      {unavailableReason && <div className="state-panel state-panel-error"><p>{unavailableReason}</p></div>}
      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      {offers && (
        <>
           {product !== "PRINT_DIGITAL" && <div role="radiogroup" aria-label="Image quality" className="quality-tier-grid">
             {offers.map((offer) => (
               <article
                key={offer.tier}
                role="radio"
                aria-checked={selected === offer.tier}
                tabIndex={0}
                 className={`quality-tier-card${selected === offer.tier ? " is-selected" : ""}`}
                 data-tier={offer.tier}
                 onClick={() => setSelected(offer.tier)}
                 onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(offer.tier); } }}
               >
                 <div className="quality-tier-topline">
                   <span className="quality-tier-radio" aria-hidden="true" />
                   {offer.tier === "ORIGINAL" && <span className="quality-tier-badge">ORIGINAL QUALITY</span>}
                   {TIER_BADGES[offer.tier] && <span className="quality-tier-recommended">{TIER_BADGES[offer.tier]}</span>}
                  </div>
                 <div className={`quality-tier-preview${offer.tier === "ORIGINAL" ? " quality-tier-before-after" : ""}`}>
                   {offer.tier === "ORIGINAL" ? <><img src="/assets/quality-tiers/original-before.webp" alt="Original photo before restoration" /><img src="/assets/quality-tiers/original-after.webp" alt="Original photo after restoration" /></> : <img src={TIER_IMAGES[offer.tier]} alt={`${TIER_LABELS[offer.tier] ?? offer.label} preview`} loading="lazy" />}
                  </div>
                 <div className="quality-tier-content">
                   <h3>{TIER_LABELS[offer.tier] ?? offer.label}</h3>
                   <p className="quality-tier-usage">{offer.tier === "ORIGINAL" ? "Best for mobile sharing" : TIER_DESCRIPTIONS[offer.tier] ?? offer.label}</p>
                   <strong className="quality-price">{offer.currency} {(offer.amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: offer.currency === "PKR" ? 0 : 2, maximumFractionDigits: 2 })}</strong>
                   <button type="button" className="quality-tier-select" onClick={(event) => { event.stopPropagation(); setSelected(offer.tier); }}>{selected === offer.tier ? "Selected" : "Select"}</button>
                   <span className="quality-tier-download">↓ Digital Download Only</span>
                  </div>
               </article>
            ))}
           </div>}

             {product === "PRINT_DIGITAL" && printSize && (
             <div className="state-panel state-panel-info"><p><strong>Automatic enhancement:</strong> {selected ? `${TIER_LABELS[selected]} will be used when required by the selected print size.` : "calculating from your source image..."}</p></div>
           )}

              {product === "PRINT_DIGITAL" && (() => {
              const item = printCatalog.find((entry) => entry.size === printSize);
              const enhancement = selected === "ORIGINAL" ? 0 : offers?.find((offer) => offer.tier === selected)?.amountMinor ?? 0;
              const printSubtotal = item ? item.unitAmountMinor * quantity : 0;
              return <div className="state-panel print-configuration-panel">
                <div className="print-size-grid" role="radiogroup" aria-label="Print size">
                  {printCatalog.filter((entry) => !entry.blocker && entry.currency === "PKR").map((entry) => <button type="button" role="radio" aria-checked={printSize === entry.size} className={`print-size-card${printSize === entry.size ? " is-selected" : ""}`} key={entry.size} onClick={() => { setPrintSize(entry.size); setQuantity(1); setPrintLines([{ printSize: entry.size, quantity: 1 }]); }}><span className="print-size-visual" aria-hidden="true" /><strong>{entry.size}</strong><span>{entry.currency} {(entry.unitAmountMinor / 100).toLocaleString()}</span><small>{entry.size === "4x6" ? "Desk and wallet frames" : entry.size === "24x36" ? "Statement wall display" : "Frame-ready print"}</small></button>)}
                </div>
                {printSize && <><div className="quantity-stepper"><span>Quantity</span><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>−</button><strong>{quantity}</strong><button type="button" aria-label="Increase quantity" onClick={() => setQuantity(Math.min(10, quantity + 1))} disabled={quantity >= 10}>+</button></div>
                <dl className="order-summary"><div><dt>Print</dt><dd>{item ? `${item.currency} ${(printSubtotal / 100).toLocaleString()}` : "Select a size"}</dd></div><div><dt>Upscale required for this print</dt><dd>{enhancement > 0 ? `${TIER_LABELS[selected || ""]} — ${offers?.[0]?.currency || "PKR"} ${(enhancement / 100).toLocaleString()}` : "Not required — your image is suitable"}</dd></div><div><dt>Estimated subtotal</dt><dd><strong>{item ? `${item.currency} ${((printSubtotal + enhancement) / 100).toLocaleString()}` : "Calculated after selection"}</strong></dd></div></dl>
                <p className="helper-text">Delivery details are collected on the next step. Final pricing is confirmed by the server.</p>
                {cropRequired && <div className="state-panel state-panel-warning"><p>This print size does not match your photo shape. Choose another size to avoid cropping.</p></div>}</>}
              </div>;
            })()}
          </>
       )}

      <div className="button-row journey-actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
            disabled={!selected || !product || creating || !offers || cropRequired || (product === "PRINT_DIGITAL" && (!printSize || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10))}
          onClick={() => product === "PRINT_DIGITAL" ? continueToDelivery() : void createOrder()}
        >
          {creating ? "Preparing..." : product === "PRINT_DIGITAL" ? "Continue to Delivery" : "Continue to Payment"}
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
