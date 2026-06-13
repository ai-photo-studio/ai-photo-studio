import { Link, NavLink, Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Product Photo Studio</strong>
            <small>AI product photography for ecommerce sellers</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Home
          </NavLink>
          <NavLink to="/pricing" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Pricing
          </NavLink>
          <NavLink to="/login" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Login
          </NavLink>
          <NavLink to="/signup" className={({ isActive }) => `button button-small${isActive ? " button-active" : ""}`}>
            Get started
          </NavLink>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div>
          <strong>AI Product Photo Studio on WhatsApp</strong>
          <p>Public customer website for ecommerce product photography, starting with background removal and growing into the approved studio roadmap.</p>
        </div>
        <div className="footer-links">
          <Link to="/pricing">Pricing</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/login">Login</Link>
        </div>
      </footer>
    </div>
  );
}
