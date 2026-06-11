import { Link, NavLink, Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Photo Studio</strong>
            <small>WhatsApp-first product imagery</small>
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
          <strong>AI Photo Studio WhatsApp</strong>
          <p>Public customer website foundation for a WhatsApp-led product photography workflow.</p>
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
