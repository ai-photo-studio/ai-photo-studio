import { Link } from "react-router-dom";

export function BackgroundRemovalPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Background Removal</p>
        <h1>Remove backgrounds from product photos instantly.</h1>
        <p className="section-lead">
          Our AI-powered background removal creates clean, transparent PNGs ready for any ecommerce platform.
        </p>
      </div>

      <div className="hero">
        <div>
          <h2>How it works</h2>
          <ol className="feature-list">
            <li>Upload your product photo</li>
            <li>AI detects and removes the background</li>
            <li>Get a clean, transparent PNG in seconds</li>
          </ol>
          <Link to="/" className="button">
            Try it now
          </Link>
        </div>
        <div className="showcase-panel">
          <img src="https://images.unsplash.com/photo-1555527770-2df52954a47e?f=auto&q=80&w=800" alt="Product with background removal" />
        </div>
      </div>

      <div className="section-heading">
        <h2>Perfect for all product categories</h2>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <h3>Beauty Products</h3>
          <p>Clean cosmetics and skincare photos with precise edge detection.</p>
        </article>
        <article className="feature-card">
          <h3>Fashion Items</h3>
          <p>Hangers, mannequins, and complex textures handled perfectly.</p>
        </article>
        <article className="feature-card">
          <h3>Electronics</h3>
          <p>Straight lines and reflective surfaces processed accurately.</p>
        </article>
        <article className="feature-card">
          <h3>Food Products</h3>
          <p>Irregular shapes and organic forms with natural edges.</p>
        </article>
      </div>
    </section>
  );
}