import { Link, useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">AI photo restoration</p>
          <h1>Upload. Restore. Download. Print.</h1>
          <p className="section-lead">
            One image at a time. Pay only for the resolution you need.
            From PKR 250.
          </p>
        </div>

        <div className="hero-cta">
          <div className="upload-prompt" style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <span className="upload-icon" style={{ fontSize: "3rem", display: "block", marginBottom: "1rem" }}>+</span>
            <p className="upload-title">Restore your photos</p>
            <p className="upload-copy">Upload one or multiple images. AI analysis, preview, and resolution selection included.</p>
            <div className="button-row" style={{ marginTop: "1.5rem", justifyContent: "center" }}>
              <button type="button" className="button" onClick={() => navigate("/restore/new")}>
                Start Restoration
              </button>
              <Link to="/pricing" className="button button-secondary">View Pricing</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-features">
        <div className="feature-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1rem", marginTop: "2rem" }}>
          <article className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <h3>Single Image</h3>
            <p>Upload one photo. Get AI-powered analysis, resolution selection (Original/2HD/4HD), payment, and download.</p>
          </article>
          <article className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <h3>Multiple Images</h3>
            <p>Upload many photos at once. Preview all with analysis, then choose a bulk package (Starter/Pro/Business/Dealer).</p>
          </article>
          <article className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <h3>Print Ready</h3>
            <p>Download at your chosen resolution or order prints directly from the restored master image.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
