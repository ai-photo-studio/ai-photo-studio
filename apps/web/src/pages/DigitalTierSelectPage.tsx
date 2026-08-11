// R9.2-P6C-CUSTOMER-MVP-FLOW: server offers -> ORIGINAL/2HD/4HD selection ->
// immutable FixedOrder. Loading offers is a GET (mount/refresh-safe); order
// creation happens only on the explicit "Create order" button click.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type DigitalOfferSummary } from "../services/customerApi";

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

export function DigitalTierSelectPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DigitalOfferSummary[] | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [product, setProduct] = useState<"DIGITAL" | "PRINT_DIGITAL">("DIGITAL");
  const [printCatalog, setPrintCatalog] = useState<Awaited<ReturnType<typeof customerApi.getPrintCatalog>>>([]);
  const [printSize, setPrintSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState({ recipientName: "", phone: "", addressLine1: "", city: "", countryCode: "PK" });
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

  useEffect(() => { if (product === "PRINT_DIGITAL") void customerApi.getPrintCatalog().then((items) => { const currency = offers?.[0]?.currency || "PKR"; const marketItems = items.filter((item) => item.currency === currency); setPrintCatalog(marketItems); if (!printSize && marketItems[0]) { setPrintSize(marketItems[0].size); setQuantity(marketItems[0].minimumQuantity); } }).catch(() => setPrintCatalog([])); }, [product, offers, printSize]);

  // Switching back to Digital-only clears print-only selection state so a
  // stale size/quantity/address never leaks into a later Print+Digital
  // order; createOrder() already guards on `product` too, this is belt-
  // and-suspenders for the visible form state.
  useEffect(() => {
    if (product !== "DIGITAL") return;
    setPrintSize("");
    setQuantity(1);
    setAddress({ recipientName: "", phone: "", addressLine1: "", city: "", countryCode: "PK" });
  }, [product]);

  const createOrder = async () => {
    if (!draftId || !selected) return;
    setCreating(true);
    setError(null);
    try {
      const guestToken = getGuestOwnershipToken(draftId);
      const order = await customerApi.createFixedOrder(token || undefined, { draftId, tier: selected, product, printSize: product === "PRINT_DIGITAL" ? printSize : undefined, quantity: product === "PRINT_DIGITAL" ? quantity : undefined, deliveryAddress: product === "PRINT_DIGITAL" ? address : undefined }, guestToken || undefined);
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
        <p className="eyebrow">Choose product &amp; image quality</p>
        <h1>Choose your product and image quality</h1>
        <p>Image quality and print totals are server-owned. Choose one product, then one image quality.</p>
      </div>

      {unavailableReason && <div className="state-panel state-panel-error"><p>{unavailableReason}</p></div>}
      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}

      {offers && (
        <>
          <h2 className="section-subheading">1. Choose product</h2>
          <div role="radiogroup" aria-label="Product" className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <button type="button" role="radio" aria-checked={product === "DIGITAL"} className={`card product-choice ${product === "DIGITAL" ? "card-selected" : ""}`} onClick={() => setProduct("DIGITAL")}>
              <h3>Digital Download</h3><p>Restore or upscale your photo and download it when ready.</p>
            </button>
            <button type="button" role="radio" aria-checked={product === "PRINT_DIGITAL"} className={`card product-choice ${product === "PRINT_DIGITAL" ? "card-selected" : ""}`} onClick={() => setProduct("PRINT_DIGITAL")}>
              <h3>Print + Digital — Home Delivery</h3><p>Restore your photo once, receive the digital copy, and order home delivery.</p>
            </button>
          </div>

          <h2 className="section-subheading">2. Choose image quality</h2>
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
                <strong>{offer.currency} {(offer.amountMinor / 100).toFixed(2)}</strong>
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
            const printItem = printCatalog.find((entry) => entry.size === printSize);
            const minimumQuantity = printItem?.minimumQuantity ?? 1;
            const belowMinimum = Number.isSafeInteger(quantity) && quantity < minimumQuantity;
            const digitalOffer = offers?.find((offer) => offer.tier === selected);
            const validQuantity = Number.isSafeInteger(quantity) && quantity >= minimumQuantity;
            const printSubtotalMinor = printItem && validQuantity ? printItem.unitAmountMinor * quantity : null;
            // Estimated only: the server (quotePrint / FixedOrder creation)
            // is the sole authority on the final total, computed fresh from
            // its own PriceBook + print catalog, never from this value.
            const estimatedTotalMinor =
              printSubtotalMinor !== null && printItem?.deliveryAmountMinor != null && digitalOffer
                ? digitalOffer.amountMinor + printSubtotalMinor + printItem.deliveryAmountMinor
                : null;
            return (
              <div className="state-panel">
                <div className="field-grid">
                  <label>
                    Print size
                    <select value={printSize} onChange={(event) => { const item = printCatalog.find((entry) => entry.size === event.target.value); setPrintSize(event.target.value); if (item) setQuantity(item.minimumQuantity); }}>
                      {printCatalog.map((item) => <option key={item.size} value={item.size}>{item.size} — {item.currency} {(item.unitAmountMinor / 100).toFixed(2)}{item.blocker ? ` (${item.blocker})` : ""}</option>)}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input type="number" min={minimumQuantity} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
                    {belowMinimum && <small className="field-error">Minimum quantity for this size is {minimumQuantity}.</small>}
                  </label>
                  <label>Recipient name<input value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} /></label>
                  <label>Phone<input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} /></label>
                  <label>Address<input value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} /></label>
                  <label>City<input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></label>
                </div>
                {(printItem || digitalOffer) && (
                  <dl className="order-summary">
                    {digitalOffer && <div><dt>Image quality ({TIER_LABELS[digitalOffer.tier] ?? digitalOffer.label})</dt><dd>{digitalOffer.currency} {(digitalOffer.amountMinor / 100).toFixed(2)}</dd></div>}
                    {printItem && <div><dt>Print unit price</dt><dd>{printItem.currency} {(printItem.unitAmountMinor / 100).toFixed(2)}</dd></div>}
                    {printItem && <div><dt>Quantity</dt><dd>{quantity}</dd></div>}
                    {printSubtotalMinor !== null && <div><dt>Print subtotal</dt><dd>{printItem?.currency} {(printSubtotalMinor / 100).toFixed(2)}</dd></div>}
                    <div><dt>Delivery</dt><dd>{printItem?.deliveryAmountMinor != null ? `${printItem.currency} ${(printItem.deliveryAmountMinor / 100).toFixed(2)}` : "Calculated by server"}</dd></div>
                    {estimatedTotalMinor !== null && <div><dt><strong>Estimated Total</strong></dt><dd><strong>{digitalOffer?.currency} {(estimatedTotalMinor / 100).toFixed(2)}</strong></dd></div>}
                  </dl>
                )}
                <p className="helper-text">The final order total is calculated and confirmed by the server on the Review page.</p>
              </div>
            );
          })()}
        </>
      )}

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
          disabled={!selected || creating || !offers || (product === "PRINT_DIGITAL" && (!printSize || !Number.isSafeInteger(quantity) || !address.recipientName || !address.phone || !address.addressLine1 || !address.city))}
          onClick={() => void createOrder()}
        >
          {creating ? "Preparing review..." : "Continue to Review"}
        </button>
        <button type="button" className="button button-secondary" onClick={() => void load()}>
          Refresh
        </button>
        <button type="button" className="button button-ghost" onClick={() => navigate(`/restore-mvp/${draftId}/preview`)}>
          Back to Preview
        </button>
      </div>
    </section>
  );
}
