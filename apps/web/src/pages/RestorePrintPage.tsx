import { useState } from "react";
import { Link, useParams } from "react-router-dom";

const PRODUCTS = [
  ["4x6", "4×6", "500", "Table frame or wallet memory"], ["5x7", "5×7", "700", "Bedside or office desk"],
  ["8x10", "8×10", "1,000", "Family display"], ["a4", "A4", "1,200", "Wall memory print"],
  ["a3", "A3", "2,000", "Feature wall print"], ["canvas", "Canvas", "3,500", "Living room wall"],
  ["frame", "Frame", "5,000", "Ready-to-hang gift"], ["album", "Album", "8,000", "Wedding or family memory book"]
];

export function RestorePrintPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [selected, setSelected] = useState<string | null>(null);
  return <section className="page-stack"><div className="section-heading"><p className="eyebrow">Step 3 · Print</p><h1>Bring your restored memory home.</h1><p>Select a print product. Payment is not collected on this screen.</p></div><div className="print-products">{PRODUCTS.map(([key, size, price, description]) => <button type="button" key={key} className={`print-product-card card ${selected === key ? "card-selected" : ""}`} onClick={() => setSelected(key)}><div className={`print-mockup print-mockup-${key}`}><span>{size}</span></div><div className="print-product-copy"><span className="pill">Home Delivery</span><h3>{key === "frame" || key === "canvas" || key === "album" ? key[0].toUpperCase() + key.slice(1) : `${size} Print`}</h3><p>{description}</p><strong>PKR {price}</strong></div></button>)}</div><div className="print-checkout-bar"><Link className="button button-secondary" to={`/restore/${orderId}`}>Back to Result</Link><button className="button" type="button" disabled={!selected}>Continue</button></div></section>;
}
