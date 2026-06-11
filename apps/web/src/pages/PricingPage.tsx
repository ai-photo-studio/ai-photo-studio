import { Link } from "react-router-dom";
import { usePackages } from "../lib/packages";

const toFeatureList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return [];
};

export function PricingPage() {
  const { packages, loading, error } = usePackages();

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Pricing</p>
        <h1>Choose a package and get started.</h1>
        <p className="section-lead">
          The packages below come straight from the live API. Checkout is intentionally deferred for the next phase.
        </p>
      </div>

      {loading ? (
        <div className="state-panel">
          <p>Loading packages...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <div className="pricing-grid pricing-grid-wide">
          {packages.map((pkg) => {
            const features = toFeatureList(pkg.includesJson);
            return (
              <article key={pkg.id} className="pricing-card pricing-card-featured">
                <div className="pricing-card-top">
                  <p className="eyebrow">{pkg.code}</p>
                  <h2>{pkg.name}</h2>
                </div>
                <p className="price">
                  {pkg.currency} {pkg.price}
                </p>
                <p>{pkg.description || "A package designed for the customer website foundation phase."}</p>
                {features.length > 0 && (
                  <ul className="feature-list">
                    {features.slice(0, 5).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                )}
                <div className="button-row">
                  <Link to="/signup" className="button button-secondary button-block">
                    Get started
                  </Link>
                  <Link to="/login" className="button button-ghost button-block">
                    Buy
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
