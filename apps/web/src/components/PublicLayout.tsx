import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { RestorationUploadController, useRestorationUpload } from "./RestorationUploadController";
import { BrandLogo } from "./BrandLogo";

// ThanNow locked public shell (R9.3). Human-memory restoration journey.
// Header nav links to homepage anchors so that top-level sections remain
// reachable from any page. Auth + upload CTAs reuse existing routes.

const HOME_ANCHORS = [
  ["#memories", "Restoration"],
  ["#upscale", "Upscaling"],
  ["#printing", "Printing"],
  ["#how", "How It Works"],
  ["#pricing", "Pricing"]
];

export function PublicLayout() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";
  const hrefFor = (anchor: string) => (onHome ? anchor : `/${anchor}`);

  return (
    <RestorationUploadController>
      <PublicShell hrefFor={hrefFor} />
    </RestorationUploadController>
  );
}

function PublicShell({ hrefFor }: { hrefFor: (anchor: string) => string }) {
  const { openRestorationUpload } = useRestorationUpload();
  const location = useLocation();
  const journey = /^\/restore-mvp\//.test(location.pathname) || /^\/restore-cart\//.test(location.pathname) || /^\/orders\//.test(location.pathname) || /processing|result|status/.test(location.pathname);
  return (
    <div className={`site-shell${journey ? " journey-shell" : ""}`}>
      <header className="site-header">
        <BrandLogo />

        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>Home</NavLink>
          {HOME_ANCHORS.map(([anchor, label]) => (
            <a key={anchor} href={hrefFor(anchor)}>{label}</a>
          ))}
          <NavLink to="/restore" className="nav-link">Restorations</NavLink>
        </nav>

        <div className="header-actions">
          <Link to="/login" className="btn btn-ghost">Login</Link>
          <Link to="/register" className="btn btn-ghost">Sign Up</Link>
          <button type="button" className="btn btn-primary upload-trigger" onClick={openRestorationUpload}>Get Started</button>
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <NavLink to="/" end>Home</NavLink>
          <a href={hrefFor("#memories")}>Restoration</a>
          <a href={hrefFor("#printing")}>Printing</a>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/restore">Restorations</NavLink>
        </nav>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer" id="footer">
        <div className="section-shell footer-grid">
        <div className="footer-brand">
            <BrandLogo />
            <p>Restore, upscale and preserve the human memories that matter most.</p>
          </div>
          <details open={!journey} className="journey-footer-group"><summary>Services</summary><div>
            <a href={hrefFor("#memories")}>Photo Restoration</a>
            <a href={hrefFor("#upscale")}>Upscaling</a>
            <a href={hrefFor("#printing")}>Printing</a>
          </div></details>
          <details open={!journey} className="journey-footer-group"><summary>Customer Help</summary><div>
            <a href={hrefFor("#how")}>Our Process</a>
            <Link to="/faq">FAQ</Link>
            <Link to="/contact">Contact Us</Link>
            <Link to="/pricing">Pricing</Link>
          </div></details>
          <details open={!journey} className="journey-footer-group"><summary>Policies</summary><div>
            <Link to="/terms">Terms and Conditions</Link>
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/payment-policy">Payment Policy</Link>
            <Link to="/refund-exchange-policy">Refund and Exchange</Link>
            <Link to="/delivery-policy">Delivery Policy</Link>
          </div></details>
          <div className="footer-cta">
            <h4>Start Restoring</h4>
            <p>Bring a precious photo back to life today.</p>
            <button type="button" className="btn btn-primary btn-full upload-trigger" onClick={openRestorationUpload}>Upload Photo</button>
          </div>
        </div>
        <div className="footer-bottom section-shell">
          <span>Copyright ThanNow. All rights reserved.</span>
          <span>ThanNow · Operated by BioTech · <a href="mailto:gisupp@gmail.com">gisupp@gmail.com</a> · <a href="tel:+923354299783">+923354299783</a></span>
        </div>
      </footer>
    </div>
  );
}
