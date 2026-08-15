import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getGuestOwnershipToken, setGuestOwnershipToken } from "../lib/guest";
import { customerApi, type MemoryPackageSummary } from "../services/customerApi";

export function MemoryPackagePreviewPage() {
  const { packageCode, draftIds } = useParams<{ packageCode: string; draftIds: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState<MemoryPackageSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = (draftIds || "").split(",").filter(Boolean);

  useEffect(() => { if (packageCode) void customerApi.getMemoryPackages().then((items) => setPkg(items.find((item) => item.code === packageCode) || null)); }, [packageCode]);

  const reviewPackage = async () => {
    if (!pkg || !packageCode || busy) return;
    setBusy(true); setError(null);
    try {
      const items = ids.map((draftId) => ({ draftId, guestOwnershipToken: getGuestOwnershipToken(draftId) || undefined }));
      const order = await customerApi.createMemoryPackageOrder(token || undefined, { packageCode, items }, items[0]?.guestOwnershipToken);
      if (items[0]?.guestOwnershipToken) setGuestOwnershipToken(order.orderNo, items[0].guestOwnershipToken);
      navigate(`/orders/${order.orderNo}/cart`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to prepare package review"); } finally { setBusy(false); }
  };

  if (!pkg) return <section className="page-stack"><div className="state-panel"><p>Loading package...</p></div></section>;
  return <section className="page-stack">
    <div className="section-heading"><p className="eyebrow">Memory Package</p><h1>Review {pkg.name}</h1><p>{ids.length} photos selected for one package order.</p></div>
    <div className="card package-review-card">
      <h2>{pkg.name}</h2>
      <div className="selected-files-list" aria-label="Package photos">{ids.map((id, index) => <div className="selected-preview" key={id}><span>Photo {index + 1}</span><small>{id.slice(0, 8)}</small></div>)}</div>
      <ul>{pkg.includes.map((line) => <li key={line}>{line}</li>)}</ul>
      <dl className="order-summary"><div><dt>Package price</dt><dd>{pkg.currency} {(pkg.priceMinor / 100).toLocaleString()}</dd></div><div><dt><strong>Total</strong></dt><dd><strong>{pkg.currency} {(pkg.priceMinor / 100).toLocaleString()}</strong></dd></div></dl>
    </div>
    {error && <div className="state-panel state-panel-error"><p>{error}</p></div>}
    <div className="button-row journey-actions"><button type="button" className="button" onClick={() => void reviewPackage()} disabled={busy}>{busy ? "Preparing review..." : "Continue to Review"}</button><button type="button" className="button button-secondary" onClick={() => navigate("/")}>Back</button></div>
  </section>;
}
