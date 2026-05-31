import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { adminApi } from "../services/adminApi";

export function AdminOrders() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    adminApi.orders().then((res) => setRows(res.items || [])).catch(() => setRows([]));
  }, []);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Orders</h2>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              {["Order No", "Customer", "Package", "Amount", "Payment", "Order", "Images", "Created", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 10 }}>{r.orderNo}</td>
                <td style={{ padding: 10 }}>{r.customer?.whatsappNumber || "-"}</td>
                <td style={{ padding: 10 }}>{r.package?.name || "-"}</td>
                <td style={{ padding: 10 }}>{String(r.total)} {r.currency}</td>
                <td style={{ padding: 10 }}><StatusBadge value={r.paymentStatus} /></td>
                <td style={{ padding: 10 }}><StatusBadge value={r.orderStatus} /></td>
                <td style={{ padding: 10 }}>{r.images?.length || 0}</td>
                <td style={{ padding: 10 }}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={{ padding: 10 }}><Link to={`/admin/orders/${r.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
