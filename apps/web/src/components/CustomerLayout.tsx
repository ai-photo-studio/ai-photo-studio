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
          <NavLink to="/wallet" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Wallet
          </NavLink>
          <NavLink to="/payments" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Payments
          </NavLink>
          <NavLink to="/subscription" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Subscription
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
            <p className="helper-text">Your customer workspace is protected with JWT session persistence.</p>
          </div>
          <div className="button-row">
            <Link to="/pricing" className="button button-small button-secondary">
              Explore packages
            </Link>
            <Link to="/wallet" className="button button-small">
              Open wallet
            </Link>
          </div>
        </section>
        <Outlet />
      </main>
    </div>
  );
}
