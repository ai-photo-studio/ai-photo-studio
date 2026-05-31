import { Link, Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f5f7fb" }}>
      <header style={{ background: "#111827", color: "#fff", padding: "12px 16px" }}>
        <strong>AI Photo Studio Admin</strong>
      </header>
      <nav style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexWrap: "wrap" }}>
        <Link to="/admin/dashboard">Dashboard</Link>
        <Link to="/admin/orders">Orders</Link>
        <Link to="/admin/failed-jobs">Failed Jobs</Link>
      </nav>
      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
