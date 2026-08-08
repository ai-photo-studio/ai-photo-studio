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

  useEffect(() => { if (product === "PRINT_DIGITAL") void customerApi.getPrintCatalog().then((items) => { setPrintCatalog(items); if (!printSize && items[0]) { setPrintSize(items[0].size); setQuantity(items[0].minimumQuantity); } }).catch(() => setPrintCatalog([])); }, [product]);

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
        <p className="eyebrow">Choose product and quality</p>
        <h1>Choose your restoration</h1>
        <p>Digital prices and print totals are server-owned. Choose one product and one quality.</p>
      </div>

      <div className="admin-card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <button type="button" className={`card product-choice ${product === "DIGITAL" ? "card-selected" : ""}`} onClick={() => setProduct("DIGITAL")}>
          <h3>Digital Download</h3><p>Restore your photo and download it when ready.</p>
        </button>
        <button type="button" className={`card product-choice ${product === "PRINT_DIGITAL" ? "card-selected" : ""}`} onClick={() => setProduct("PRINT_DIGITAL")}>
          <h3>Print + Digital Download</h3><p>Restore your photo, receive the digital copy, and order home delivery.</p>
        </button>
      </div>

      {product === "PRINT_DIGITAL" && <div className="state-panel"><label>Print size <select value={printSize} onChange={(event) => { const item = printCatalog.find((entry) => entry.size === event.target.value); setPrintSize(event.target.value); if (item) setQuantity(item.minimumQuantity); }}>{printCatalog.map((item) => <option key={item.size} value={item.size}>{item.size} — {item.currency} {(item.unitAmountMinor / 100).toFixed(2)}{item.blocker ? ` (${item.blocker})` : ""}</option>)}</select></label><label>Quantity <input type="number" min={printCatalog.find((item) => item.size === printSize)?.minimumQuantity ?? 1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><div className="field-grid"><label>Recipient name<input value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} /></label><label>Phone<input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} /></label><label>Address<input value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} /></label><label>City<input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></label></div><p>Delivery is calculated once by the server at quote/order time.</p></div>}

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
               <h3>{offer.tier === "HD_2X" ? "2x HD" : offer.tier === "HD_4X" ? "4x Ultra HD" : offer.tier === "ORIGINAL" ? "Restored Original" : offer.label}</h3>
               <p className="helper-text">{offer.tier === "HD_4X" ? "Best for printing and large displays" : offer.tier === "HD_2X" ? "Sharp detail for sharing and display" : "Basic sharing at original resolution"}</p>
               {offer.tier === "HD_2X" && <span className="status-pill">MOST POPULAR</span>}
               {offer.tier === "HD_4X" && <span className="status-pill">BEST FOR PRINTING</span>}
              <strong>{offer.currency} {(offer.amountMinor / 100).toFixed(2)}</strong>
            </article>
          ))}
        </div>
      )}

      <div className="button-row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button"
          disabled={!selected || creating || !offers || (product === "PRINT_DIGITAL" && (!printSize || !Number.isSafeInteger(quantity) || !address.recipientName || !address.phone || !address.addressLine1 || !address.city))}
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
