import { useEffect, useState } from "react";
import { adminApi } from "../services/adminApi";

export function AdminDashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    adminApi.dashboard().then(setData).catch(() => setData(null));
  }, []);

  const cards = data
    ? [
        ["Today Orders", data.todayOrders],
        ["Today Revenue", data.todayRevenue],
        ["Pending Payments", data.pendingPayments],
        ["Processing", data.processingOrders],
        ["Completed", data.completedOrders],
        ["Failed Orders", data.failedOrders],
        ["Failed Jobs", data.failedJobs],
        ["Images Today", data.imagesProcessedToday]
      ]
    : [];

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {cards.map(([label, value]) => (
          <div key={String(label)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{String(value)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
