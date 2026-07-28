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
        <h1>Simple, transparent pricing for teams of all sizes.</h1>
        <p className="section-lead">
          Credits power all features. Use them for background removal, flat lays, virtual models, and more.
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
          {packages.map((pkg, index) => {
            const features = toFeatureList(pkg.includesJson);
            return (
              <article key={pkg.id} className={`pricing-card pricing-card-featured${index === Math.floor(packages.length / 2) ? " pricing-card-highlight" : ""}`}>
                <div className="pricing-card-top">
                  <p className="eyebrow">{pkg.code}</p>
                  <h2>{pkg.name}</h2>
                </div>
                <p className="price">
                  {pkg.currency} {pkg.price}
                </p>
                <p>{pkg.description || "A credit bundle for ecommerce product photography."}</p>
                <ul className="feature-list">
                  <li>{pkg.creditsIncluded} included credits</li>
                  <li>Background removal and white background today</li>
                  <li>More studio styles: flat lay, lifestyle, model, video</li>
                  {features.slice(0, 3).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <Link to="/signup" className="button button-secondary button-block">
                    Get started
                  </Link>
                  <Link to="/login" className="button button-ghost button-block">
                    Buy now
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="section-heading">
        <h2>FAQ about pricing</h2>
      </div>

      <div className="faq-grid">
        <details className="faq-card">
          <summary>How do credits work?</summary>
          <p>Each credit processes one product photo. Credits never expire and can be used for any feature.</p>
        </details>
        <details className="faq-card">
          <summary>Do you offer discounts for bulk purchases?</summary>
          <p>Yes, we offer volume discounts for teams and enterprises. Contact us for custom pricing.</p>
        </details>
        <details className="faq-card">
          <summary>Can I upgrade or downgrade anytime?</summary>
          <p>You can purchase additional credits at any time. Your existing credits remain available.</p>
        </details>
      </div>
    </section>
  );
}