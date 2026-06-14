import { Link } from "react-router-dom";

export function ProductVideosPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Product Videos</p>
        <h1>Create engaging product videos.</h1>
        <p className="section-lead">
          Turn static product photos into short, scroll-stopping videos for TikTok, Instagram, and Facebook.
        </p>
      </div>

      <div className="hero">
        <div>
          <h2>Video Features</h2>
          <ul className="feature-list">
            <li>360-degree product spins</li>
            <li>Smooth camera movements</li>
            <li>Background animation effects</li>
            <li>Social media optimized formats</li>
          </ul>
          <Link to="/signup" className="button">
            Create videos
          </Link>
        </div>
        <div className="showcase-panel">
          <div style={{ position: "relative", paddingBottom: "56.25%" }}>
            <img src="https://images.unsplash.com/photo-1555527770-2df52954a47e?f=auto&q=80&w=800" alt="Product video preview" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "3rem", color: "white", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>▶</div>
          </div>
        </div>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <h3>TikTok Content</h3>
          <p>Vertical videos optimized for TikTok's algorithm.</p>
        </article>
        <article className="feature-card">
          <h3>Instagram Reels</h3>
          <p>Engaging loops for Instagram Shopping.</p>
        </article>
        <article className="feature-card">
          <h3>Facebook Ads</h3>
          <p>Professional product showcase videos.</p>
        </article>
      </div>
    </section>
  );
}