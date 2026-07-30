import { Link, useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <section className="hero-section premium-home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Then and Now Photo Studio</p>
          <h1>Restore old memories. Create clean product photos.</h1>
          <p className="section-lead">
            Two focused tools for treasured family photos and marketplace-ready product images.
          </p>
        </div>

        <div className="home-visual-pair"><div className="home-photo-concept home-photo-aged" aria-label="Old photo concept"><span>Then</span></div><div className="home-photo-concept home-photo-restored" aria-label="Restored photo concept"><span>Now</span></div></div>
        <div className="button-row"><button type="button" className="button" onClick={() => navigate("/restore/new")}>Restore Photo</button><Link to="/background-removal" className="button button-secondary">Remove Background</Link></div>
      </section>

      <section className="home-features">
        <div className="feature-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1rem", marginTop: "2rem" }}>
          <article className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <h3>1. Choose</h3><p>Select a memory or product image and review it before starting.</p>
          </article>
          <article className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <h3>2. Process</h3><p>Pay only for the selected service. Processing remains private.</p>
          </article>
          <article className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <h3>3. Download</h3><p>Download your entitled image directly or continue to print-ready options.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
