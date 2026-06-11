import { Link } from "react-router-dom";
import { usePackages } from "../lib/packages";

const features = [
  {
    title: "WhatsApp-first workflow",
    text: "Keep the messaging-led ordering flow your team already uses, while adding a clean web entry point for customers."
  },
  {
    title: "Clear package discovery",
    text: "Help shoppers compare options fast with a pricing preview that mirrors the live API package list."
  },
  {
    title: "Fast onboarding",
    text: "Let first-time customers create an account in seconds and continue to the protected customer area later."
  }
];

export function HomePage() {
  const { packages, loading, error } = usePackages();
  const preview = packages.slice(0, 3);

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Phase B public website</p>
          <h1>Turn WhatsApp product shoots into a polished customer experience.</h1>
          <p className="hero-text">
            The backend already powers orders and packages. This public site adds a friendly storefront so customers can
            discover packages, sign up, and sign in before the dashboard and checkout arrive.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="button">
              Start free
            </Link>
            <Link to="/pricing" className="button button-secondary">
              View pricing
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="metric-card">
            <span>Live API</span>
            <strong>/api/packages</strong>
            <p>Connected pricing preview with route-safe auth storage.</p>
          </div>
          <div className="metric-card metric-card-accent">
            <span>Customer access</span>
            <strong>JWT protected</strong>
            <p>Signup, login, and session persistence are ready for the future dashboard.</p>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading">
          <p className="eyebrow">Features</p>
          <h2>Simple SaaS structure, tuned for the current phase.</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="card">
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Pricing preview</p>
            <h2>See live packages before checkout arrives.</h2>
          </div>
          <Link to="/pricing" className="text-link">
            See all packages
          </Link>
        </div>
        {loading ? (
          <div className="state-panel">
            <p>Loading packages from the API...</p>
          </div>
        ) : error ? (
          <div className="state-panel state-panel-error">
            <p>{error}</p>
          </div>
        ) : (
          <div className="pricing-grid">
            {preview.map((pkg) => (
              <article key={pkg.id} className="pricing-card">
                <div className="pricing-card-top">
                  <p className="eyebrow">{pkg.code}</p>
                  <h3>{pkg.name}</h3>
                </div>
                <p className="price">
                  {pkg.currency} {pkg.price}
                </p>
                <p>{pkg.description || "A flexible package ready for customer onboarding."}</p>
                <Link to="/signup" className="button button-secondary button-block">
                  Get started
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="cta-band">
        <div>
          <p className="eyebrow">Ready to launch</p>
          <h2>Build trust first, then add the dashboard and checkout.</h2>
        </div>
        <Link to="/signup" className="button">
          Create account
        </Link>
      </section>
    </div>
  );
}
