import { Link, useNavigate } from "react-router-dom";
import { HeroCompareSlider } from "../components/HeroCompareSlider";

// ThanNow human-memory homepage (Premium Hero V2).
// The comparison hero is a rotating, customer-draggable Then/Now slider over
// the approved 10 Premium Hero V2 concepts. Upload CTAs route to the existing
// restoration flow (/restore/new); no pricing/processing is fabricated here.
export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="thannow-home">
      <section className="hero-section premium-home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Then and Now Photo Studio</p>
          <h1>Bring Your Precious Memories Back to Life</h1>
          <p className="section-lead">
            AI-powered restoration, upscaling and premium printing for the moments that matter most.
          </p>
        </div>

        <div className="hero-media">
          <HeroCompareSlider />
          <Link className="hero-upload" to="/restore/new">Upload Photo</Link>
        </div>

        <div className="button-row">
          <Link className="button" to="/restore/new">Upload Photo and View Pricing</Link>
          <button type="button" className="button button-secondary" onClick={() => navigate("/restore/new")}>Restore Photo</button>
          <Link to="/pricing" className="button button-ghost">See Pricing</Link>
        </div>
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
