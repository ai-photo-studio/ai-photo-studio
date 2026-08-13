import type { ReactNode } from "react";
import "../styles/product-choice.css";

export type ProductChoiceKey = "digital" | "print";

type ProductChoiceStageProps = {
  selected: ProductChoiceKey | null;
  onSelect: (product: ProductChoiceKey) => void;
  onContinue?: () => void;
  busy?: boolean;
  error?: string | null;
};

type IconName = "download" | "printer" | "cloud" | "infinity" | "shield" | "diamond" | "truck" | "check";

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "download") return <svg {...common}><path d="M12 3v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 20h14" /></svg>;
  if (name === "printer") return <svg {...common}><path d="M7 8V3h10v5" /><path d="M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /><path d="M18 11h.01" /></svg>;
  if (name === "cloud") return <svg {...common}><path d="M7 18a4 4 0 0 1-.3-8A6 6 0 0 1 18 8.6 4.5 4.5 0 0 1 18.5 18" /><path d="M12 11v8" /><path d="m9 16 3 3 3-3" /></svg>;
  if (name === "infinity") return <svg {...common}><path d="M18.5 7.5c-2.8 0-4.5 4.5-6.5 4.5S8.3 7.5 5.5 7.5a4.5 4.5 0 0 0 0 9c2.8 0 4.5-4.5 6.5-4.5s3.7 4.5 6.5 4.5a4.5 4.5 0 0 0 0-9Z" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "diamond") return <svg {...common}><path d="M3 8 7 3h10l4 5-9 13L3 8Z" /><path d="M3 8h18" /><path d="m7 3 5 18 5-18" /></svg>;
  if (name === "truck") return <svg {...common}><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.7L16.5 9" /></svg>;
}

function Feature({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <div className="tn-product-feature"><span className="tn-product-feature__icon"><Icon name={icon} size={25} /></span><span>{children}</span></div>;
}

export default function ProductChoiceStage({ selected, onSelect, onContinue, busy = false, error = null }: ProductChoiceStageProps) {
  return <main className="tn-product-page">
    <section className="tn-product-hero" aria-labelledby="tn-product-title">
      <div className="tn-product-hero__copy"><span className="tn-product-eyebrow">CHOOSE PRODUCT</span><h1 id="tn-product-title">Choose your product</h1><p>Choose the finish that fits your memory. Keep it digital, or receive premium prints delivered to your door.</p></div>
      <div className="tn-product-hero__gallery"><img src="/thannow/product-choice/hero-memory-gallery.webp" alt="A collection of Pakistani family memories shown as old photographs, restored portraits, wedding pictures, albums, tabletop frames and wall frames" loading="eager" decoding="async" /></div>
    </section>
    <section className="tn-product-options" aria-label="Choose a ThanNow product">
      <button type="button" className={`tn-product-card tn-product-card--digital${selected === "digital" ? " is-selected" : ""}`} onClick={() => onSelect("digital")} aria-pressed={selected === "digital"}>
        <span className="tn-product-card__top"><span className="tn-product-card__title-group"><span className="tn-product-card__round-icon tn-product-card__round-icon--green"><Icon name="download" size={31} /></span><span><strong className="tn-product-card__title">Digital Download</strong><span className="tn-product-pill tn-product-pill--green">DIGITAL ONLY</span></span></span><span className={`tn-product-selected${selected === "digital" ? " is-visible" : ""}`}><Icon name="check" size={28} /></span></span>
        <span className="tn-product-card__body tn-product-card__body--digital"><span className="tn-product-card__copy">Restore or upscale your photo and download it when ready.<br /><br />Perfect for mobile, tablet, laptop, sharing and keepsakes.</span><img className="tn-product-card__art" src="/thannow/product-choice/digital-devices.webp" alt="Pakistani family photograph displayed on a mobile phone, tablet and laptop for digital download" loading="eager" decoding="async" /></span>
        <span className="tn-product-features tn-product-features--green"><Feature icon="cloud">High resolution<br />digital file</Feature><Feature icon="infinity">Download<br />anytime</Feature><Feature icon="shield">Secure and<br />private</Feature></span>
      </button>
      <button type="button" className={`tn-product-card tn-product-card--print${selected === "print" ? " is-selected" : ""}`} onClick={() => onSelect("print")} aria-pressed={selected === "print"}>
        <span className="tn-product-card__top"><span className="tn-product-card__title-group"><span className="tn-product-card__round-icon tn-product-card__round-icon--purple"><Icon name="printer" size={31} /></span><span><strong className="tn-product-card__title">Print + Digital<br />Home Delivery</strong><span className="tn-product-pill tn-product-pill--purple">DIGITAL + PRINT + DELIVERY</span></span></span><span className={`tn-product-selected tn-product-selected--purple${selected === "print" ? " is-visible" : ""}`}><Icon name="check" size={28} /></span></span>
        <span className="tn-product-card__body tn-product-card__body--print"><span className="tn-product-card__copy">Restore your photo once, receive the digital copy, and order premium prints delivered to your door.</span><img className="tn-product-card__art tn-product-card__art--print" src="/thannow/product-choice/print-home-delivery.webp" alt="Pakistani family photograph presented as a face-safe three panel canvas, with a photo printer, tabletop frames and a ThanNow home delivery box" loading="eager" decoding="async" /></span>
        <span className="tn-product-features tn-product-features--purple"><Feature icon="diamond">Premium<br />print quality</Feature><Feature icon="truck">Delivered<br />to your door</Feature><Feature icon="cloud">Digital copy<br />included</Feature><Feature icon="shield">Safe and secure<br />delivery</Feature></span>
      </button>
    </section>
    {error ? <p className="tn-product-error" role="alert">{error}</p> : null}
    {onContinue ? <div className="tn-product-actions"><button type="button" className="tn-product-continue" onClick={onContinue} disabled={!selected || busy}>{busy ? "Please wait..." : "Continue"}<span aria-hidden="true">→</span></button></div> : null}
  </main>;
}
