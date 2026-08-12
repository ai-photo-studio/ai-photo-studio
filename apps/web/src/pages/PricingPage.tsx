import { useEffect, useState } from "react";
import { useRestorationUpload } from "../components/RestorationUploadController";
import { customerApi, type DigitalOfferSummary } from "../services/customerApi";

type PrintItem = Awaited<ReturnType<typeof customerApi.getPrintCatalog>>[number];
type MemoryPackage = { code: string; name: string; priceMinor: number; currency: "PKR"; includes: string[]; checkoutReady: boolean; blocker?: string };

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

export function PricingPage() {
  const { openRestorationUpload } = useRestorationUpload();
  const [offers, setOffers] = useState<DigitalOfferSummary[]>([]);
  const [prints, setPrints] = useState<PrintItem[]>([]);
  const [packages, setPackages] = useState<MemoryPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch("/api/digital-catalog?market=PAKISTAN").then((r) => r.ok ? r.json() : Promise.reject(new Error("Restoration pricing unavailable"))),
      fetch("/api/memory-packages").then((r) => r.ok ? r.json() : Promise.reject(new Error("Memory packages unavailable")))
    ]).then(([offerPayload, packagePayload]) => {
      if (!alive) return;
      setOffers(Array.isArray(offerPayload?.data?.offers) ? offerPayload.data.offers : []);
      setPrints(Array.isArray(offerPayload?.data?.printCatalog) ? offerPayload.data.printCatalog : []);
      setPackages(Array.isArray(packagePayload?.data) ? packagePayload.data : []);
    }).catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : "Pricing unavailable"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="page-stack">
      <div className="section-heading"><p className="eyebrow">ThanNow Pricing</p><h1>Restore, preserve and print what matters.</h1><p>Every amount is returned by the server catalog. No browser-computed prices.</p></div>
      {loading && <div className="state-panel"><p>Loading current pricing...</p></div>}
      {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}
      {!loading && !error && <>
        <h2>Restore &amp; Download</h2>
        <div className="pricing-grid">
          {offers.map((offer) => <article className="pricing-card" key={offer.tier}><p className="eyebrow">{offer.tier}</p><h3>{offer.label}</h3><p className="price">{money(offer.amountMinor, offer.currency)}</p><p>{offer.description}</p><small>{offer.priceBookVersion}</small><button type="button" className="button button-secondary button-block" onClick={openRestorationUpload}>Choose this quality</button></article>)}
        </div>
        <h2>Print + Digital</h2>
        <div className="pricing-grid">
           {prints.filter((print) => print.size !== "Triple Canvas").map((print) => <article className="pricing-card" key={print.size}><h3>{print.size}</h3><p className="price">{money(print.unitAmountMinor, print.currency)} each</p><p>Minimum quantity: {print.minimumQuantity}</p><p>Delivery: {money(print.deliveryAmountMinor, print.currency)} per shipment</p><small>{print.catalogVersion}</small></article>)}
           {prints.some((print) => print.size === "Triple Canvas") && <div className="state-panel state-panel-warning"><p>Triple Canvas is not currently orderable because its physical dimensions and fulfilment specifications require confirmation.</p></div>}
        </div>
        <h2>Memory Packages</h2>
        <div className="pricing-grid">
          {packages.map((pkg) => <article className="pricing-card" key={pkg.code}><h3>{pkg.name}</h3><p className="price">{money(pkg.priceMinor, pkg.currency)}</p><ul className="feature-list">{pkg.includes.map((item) => <li key={item}>{item}</li>)}</ul>{pkg.checkoutReady ? <button type="button" className="button button-secondary button-block" onClick={openRestorationUpload}>Start package</button> : <div className="state-panel"><p>{pkg.blocker || "Package fulfilment details required"}</p></div>}</article>)}
        </div>
      </>}
    </section>
  );
}
