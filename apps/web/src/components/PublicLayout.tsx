import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { RestorationUploadController, useRestorationUpload } from "./RestorationUploadController";

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
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand" aria-label="ThanNow home">
          <img src="/assets/thannow-logo.png" alt="ThanNow" className="brand-logo" />
        </Link>

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
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer" id="footer">
        <div className="section-shell footer-grid">
          <div className="footer-brand">
            <Link to="/" className="brand" aria-label="ThanNow home">
              <img src="/assets/thannow-logo.png" alt="ThanNow" className="brand-logo" />
            </Link>
            <p>Restore, upscale and preserve the human memories that matter most.</p>
          </div>
          <div>
            <h4>Services</h4>
            <a href={hrefFor("#memories")}>Photo Restoration</a>
            <a href={hrefFor("#upscale")}>Upscaling</a>
            <a href={hrefFor("#printing")}>Printing</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href={hrefFor("#how")}>Our Process</a>
            <Link to="/pricing">Pricing</Link>
            <Link to="/orders">My Orders</Link>
          </div>
          <div className="footer-cta">
            <h4>Start Restoring</h4>
            <p>Bring a precious photo back to life today.</p>
            <button type="button" className="btn btn-primary btn-full upload-trigger" onClick={openRestorationUpload}>Upload Photo</button>
          </div>
        </div>
        <div className="footer-bottom section-shell">
          <span>Copyright ThanNow. All rights reserved.</span>
          <span>Serving customers across Pakistan</span>
        </div>
      </footer>
    </div>
  );
}
