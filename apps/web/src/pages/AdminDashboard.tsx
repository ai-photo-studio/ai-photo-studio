import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import { formatNumber } from "../lib/format";
import type { AdminDashboardResponse, AdminStatsResponse } from "../lib/portal-types";

export function AdminDashboard() {
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [dashboardResponse, statsResponse] = await Promise.all([adminApi.dashboard(), adminApi.stats()]);
        if (!cancelled) {
          setDashboard(dashboardResponse);
          setStats(statsResponse);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dashboardCards = dashboard
    ? [
        ["Today Orders", dashboard.todayOrders],
        ["Today Revenue", dashboard.todayRevenue],
        ["Pending Payments", dashboard.pendingPayments],
        ["Processing Orders", dashboard.processingOrders],
        ["Completed Orders", dashboard.completedOrders],
        ["Failed Orders", dashboard.failedOrders],
        ["Failed Jobs", dashboard.failedJobs],
        ["Images Today", dashboard.imagesProcessedToday]
      ]
    : [];

  const metricCards = stats
    ? [
        ["Queue Depth", stats.queueDepth],
        ["Active Workers", stats.activeWorkers],
        ["Avg Duration", `${formatNumber(stats.performance.averageProcessingDurationMs)} ms`],
        ["Payment Approvals", stats.commercial.paymentApprovals],
        ["Wallet Usage", `${formatNumber(stats.commercial.totalLifetimeSpent)} spent`],
        ["Queue Failures", stats.failureTracking.queueFailures]
      ]
    : [];

  return (
    <section className="page-stack">
      <div className="section-heading section-heading-row">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Commercial readiness overview.</h1>
        </div>
        <div className="button-row">
          <Link to="/admin/payments" className="button button-small button-secondary">
            Review payments
          </Link>
          <Link to="/admin/wallets" className="button button-small">
            View wallets
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="state-panel">
          <p>Loading dashboard metrics...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            {dashboardCards.map(([label, value]) => (
              <article key={String(label)} className="metric-card">
                <span>{label}</span>
                <strong>{String(value)}</strong>
              </article>
            ))}
          </div>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Operational metrics</p>
              <h2>Queue and commercial health</h2>
            </div>
            <div className="metric-grid">
              {metricCards.map(([label, value]) => (
                <article key={String(label)} className="metric-card">
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Provider mix</p>
              <h2>Current AI provider breakdown</h2>
            </div>
            <div className="provider-grid">
              {stats?.providerBreakdown.map((row) => (
                <div key={row.providerName} className="provider-card">
                  <strong>{row.providerName}</strong>
                  <p>{formatNumber(row.count)} jobs</p>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
