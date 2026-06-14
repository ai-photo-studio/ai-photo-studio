import { Link } from "react-router-dom";

export function LifestyleScenesPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Lifestyle Scenes</p>
        <h1>Place products in realistic environments.</h1>
        <p className="section-lead">
          Show your products in context with AI-generated lifestyle scenes that convert browsers to buyers.
        </p>
      </div>

      <div className="hero">
        <div>
          <h2>Benefits</h2>
          <ul className="feature-list">
            <li>Realistic environmental contexts</li>
            <li>Multiple scene templates</li>
            <li>Seasonal and thematic variations</li>
            <li>Perfect for social media content</li>
          </ul>
          <Link to="/signup" className="button">
            Start creating
          </Link>
        </div>
        <div className="showcase-panel">
          <img src="https://images.unsplash.com/photo-1523381210434-271e09e3d799?f=auto&q=80&w=800" alt="Lifestyle scene" />
        </div>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <h3>Home & Living</h3>
          <p>Products in cozy, aspirational living spaces.</p>
        </article>
        <article className="feature-card">
          <h3>Fashion</h3>
          <p>Clothing and accessories in lifestyle contexts.</p>
        </article>
        <article className="feature-card">
          <h3>Beauty</h3>
          <p>Mirrors, dressing tables, and spa environments.</p>
        </article>
      </div>
    </section>
  );
}