import { Link } from "react-router-dom";

export function FlatLayPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Flat Lay Creation</p>
        <h1>Create professional flat lay product photos.</h1>
        <p className="section-lead">
          Arrange your products in perfect overhead compositions with AI-powered styling.
        </p>
      </div>

      <div className="hero">
        <div>
          <h2>Features</h2>
          <ul className="feature-list">
            <li>Multiple layout templates</li>
            <li>Customizable backgrounds</li>
            <li>Automatic product placement</li>
            <li>Social media optimized formats</li>
          </ul>
          <Link to="/signup" className="button">
            Get started
          </Link>
        </div>
        <div className="showcase-panel">
          <img src="https://images.unsplash.com/photo-1555527770-2df52954a47e?f=auto&q=80&w=800" alt="Flat lay product photo" />
        </div>
      </div>

      <div className="section-heading">
        <h2>Perfect for</h2>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <h3>Fashion & Apparel</h3>
          <p>Dress flat lays with accessories and lifestyle elements.</p>
        </article>
        <article className="feature-card">
          <h3>Food & Beverage</h3>
          <p>Recipe ingredients and packaging in beautiful arrangements.</p>
        </article>
        <article className="feature-card">
          <h3>Electronics</h3>
          <p>Accessories and devices in clean, organized layouts.</p>
        </article>
      </div>
    </section>
  );
}