import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { adminApi } from "../services/adminApi";

export function AdminLayout() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setToken(adminApi.getToken());
  }, []);

  const saveToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    adminApi.setToken(token.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Admin commercial workspace</p>
          <strong>AI Photo Studio WhatsApp</strong>
        </div>
        <form className="admin-token-form" onSubmit={saveToken}>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Admin access token"
            aria-label="Admin access token"
          />
          <button type="submit" className="button button-small">
            Save
          </button>
        </form>
        {saved && <span className="pill">Token saved locally</span>}
      </header>
      <nav className="admin-nav" aria-label="Admin">
        <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Dashboard
        </NavLink>
        <NavLink to="/admin/payments" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Payments
        </NavLink>
        <NavLink to="/admin/wallets" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Wallets
        </NavLink>
        <NavLink to="/admin/subscriptions" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Subscriptions
        </NavLink>
        <NavLink to="/admin/packages" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Packages
        </NavLink>
        <NavLink to="/admin/orders" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Orders
        </NavLink>
        <NavLink to="/admin/failed-jobs" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Failed Jobs
        </NavLink>
        <Link to="/" className="nav-link">
          Public site
        </Link>
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
