import { Link, NavLink, Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Photo Studio</strong>
            <small>AI product photography</small>
          </span>
        </Link>
        <nav className="site-nav">
          <NavLink to="/pricing" className="nav-link">Pricing</NavLink>
          <NavLink to="/login" className="nav-link">Login</NavLink>
          <NavLink to="/signup" className="button">Sign Up</NavLink>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>&copy; 2026 AI Photo Studio</p>
      </footer>
    </div>
  );
}