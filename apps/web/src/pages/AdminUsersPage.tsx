import { useEffect, useState } from "react";
import { adminApi } from "../services/adminApi";
import { formatDateTime } from "../lib/format";
import type { AdminCustomerRecord } from "../lib/portal-types";

type ResponseData = {
  items: AdminCustomerRecord[];
  total: number;
  page: number;
  limit: number;
};

export function AdminUsersPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.customers(`page=${page}&limit=10`);
      setData(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin users</p>
        <h1>Customer overview and management.</h1>
      </div>

      {loading ? (
        <div className="state-panel">
          <p>Loading customers...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <div className="admin-card-grid">
          {(data?.items || []).map((customer) => (
            <article key={customer.id} className="card admin-record-card">
              <div className="card-top">
                <div>
                  <p className="eyebrow">{customer.email}</p>
                  <h3>{customer.name || "Unnamed customer"}</h3>
                </div>
                <span className="status-badge status-active">Active</span>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Phone</dt>
                  <dd>{customer.phone || "—"}</dd>
                </div>
                <div>
                  <dt>Orders</dt>
                  <dd>{customer.orders}</dd>
                </div>
                <div>
                  <dt>Wallet Balance</dt>
                  <dd>{customer.walletBalance} credits</dd>
                </div>
                <div>
                  <dt>Joined</dt>
                  <dd>{formatDateTime(customer.createdAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}