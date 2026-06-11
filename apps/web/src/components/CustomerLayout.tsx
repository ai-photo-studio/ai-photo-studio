import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function CustomerLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="site-shell customer-shell">
      <header className="site-header customer-header">
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Photo Studio</strong>
            <small>Customer workspace</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Customer">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Home
          </NavLink>
          <NavLink to="/pricing" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Pricing
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Account
          </NavLink>
          <button type="button" className="button button-small button-ghost" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>
      <main className="site-main">
        <section className="account-banner">
          <div>
            <p className="eyebrow">Signed in</p>
            <h1>{user?.name || user?.email}</h1>
          </div>
          <Link to="/pricing" className="button button-small">
            Explore packages
          </Link>
        </section>
        <Outlet />
      </main>
    </div>
  );
}
