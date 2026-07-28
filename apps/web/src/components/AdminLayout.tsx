import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { adminApi } from "../services/adminApi";

export function AdminLayout() {
  const navigate = useNavigate();

  const logout = () => {
    void adminApi.logout().finally(() => adminApi.clearSession());
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Admin commercial workspace</p>
          <strong>{adminApi.getProfile()?.email || "AI Photo Studio WhatsApp"}</strong>
        </div>
        <div className="button-row">
          <span className="pill">{adminApi.getProfile()?.role || "ADMIN"}</span>
          <button type="button" className="button button-small button-secondary" onClick={logout}>
            Log out
          </button>
        </div>
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
        <NavLink to="/admin/users" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Users
        </NavLink>
        <NavLink to="/admin/jobs" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Jobs
        </NavLink>
        <NavLink to="/admin/providers" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Providers
        </NavLink>
        <NavLink to="/admin/storage" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Storage
        </NavLink>
        <NavLink to="/admin/logs" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Logs
        </NavLink>
        <NavLink to="/admin/system" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          System
        </NavLink>
        <NavLink to="/admin/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Settings
        </NavLink>
        <NavLink to="/admin/orders" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Orders
        </NavLink>
        <NavLink to="/admin/restorations" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Restorations
        </NavLink>
        <NavLink to="/admin/failed-jobs" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Failed Jobs
        </NavLink>
        <Link to="/" className="nav-link">
          Public site
        </Link>
        <button type="button" className="nav-link nav-link-button" onClick={logout}>
          Log out
        </button>
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
