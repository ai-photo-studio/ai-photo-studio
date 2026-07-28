import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import { formatNumber } from "../lib/format";
import type { AdminDashboardResponse, AdminStatsResponse } from "../lib/portal-types";

type BusinessMetricsResponse = {
  daily: {
    uploads: number;
    paidOrders: number;
    revenuePKR: number;
    revenueUSD: number;
    replicateCost: number;
    grossMargin: number;
    avgProcessingTimeMs: number;
    printOrders: number;
    repeatCustomers: number;
  };
  totals: {
    totalOrders: number;
    totalPaidOrders: number;
    totalRevenuePKR: number;
    totalRevenueUSD: number;
    totalReplicateCost: number;
    totalCustomers: number;
  };
  conversion: {
    uploadToPaid: number;
  };
  storage: {
    totalOriginals: number;
    totalFinals: number;
    totalPreviews: number;
    storageBytes: number;
  };
  queue: {
    queued: number;
    running: number;
    failed: number;
    deadLetter: number;
    completed: number;
  };
  restoreFailures: {
    replicateFailures: number;
    totalRestoreItems: number;
    failedItems: number;
  };
};

export function AdminDashboard() {
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [business, setBusiness] = useState<BusinessMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [dashboardResponse, statsResponse, bizResponse] = await Promise.all([
          adminApi.dashboard(),
          adminApi.stats(),
          adminApi.businessMetrics()
        ]);
        if (!cancelled) {
          setDashboard(dashboardResponse);
          setStats(statsResponse);
          setBusiness(bizResponse);
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
    return () => { cancelled = true; };
  }, []);

  const dashboardCards = dashboard
    ? [
        ["Today Orders", dashboard.todayOrders],
        ["Today Revenue (PKR)", `PKR ${formatNumber(Number(dashboard.todayRevenue))}`],
        ["Pending Payments", dashboard.pendingPayments],
        ["Processing Orders", dashboard.processingOrders],
        ["Completed Orders", dashboard.completedOrders],
        ["Failed Orders", dashboard.failedOrders],
        ["Failed Jobs", dashboard.failedJobs],
        ["Images Today", dashboard.imagesProcessedToday]
      ]
    : [];

  const bizCards = business
    ? [
        ["Daily Uploads", business.daily.uploads],
        ["Paid Orders (Today)", business.daily.paidOrders],
        ["Conversion Rate", `${business.conversion.uploadToPaid}%`],
        ["Avg Order Value", `PKR ${formatNumber(business.daily.paidOrders > 0 ? Math.round(business.daily.revenuePKR / business.daily.paidOrders) : 0)}`],
        ["Revenue PKR (Today)", `PKR ${formatNumber(business.daily.revenuePKR)}`],
        ["Revenue USD (Today)", `$${business.daily.revenueUSD.toFixed(2)}`],
        ["Replicate Cost (Today)", `$${business.daily.replicateCost.toFixed(4)}`],
        ["Gross Margin", `${business.daily.grossMargin}%`],
        ["Print Orders (Today)", business.daily.printOrders],
        ["Repeat Customers (Today)", business.daily.repeatCustomers],
      ]
    : [];

  const totalCards = business
    ? [
        ["Total Orders", business.totals.totalOrders],
        ["Total Paid", business.totals.totalPaidOrders],
        ["Total Revenue PKR", `PKR ${formatNumber(business.totals.totalRevenuePKR)}`],
        ["Total Revenue USD", `$${business.totals.totalRevenueUSD.toFixed(2)}`],
        ["Total Replicate Cost", `$${business.totals.totalReplicateCost.toFixed(4)}`],
        ["Total Customers", business.totals.totalCustomers],
      ]
    : [];

  const operationCards = business
    ? [
        ["Queue: Queued", business.queue.queued],
        ["Queue: Running", business.queue.running],
        ["Queue: Completed", business.queue.completed],
        ["Queue: Failed", business.queue.failed],
        ["Queue: Dead Letter", business.queue.deadLetter],
        ["Storage: Originals", business.storage.totalOriginals],
        ["Storage: Finals", business.storage.totalFinals],
        ["Storage: Previews", business.storage.totalPreviews],
        ["Restore Failures", business.restoreFailures.failedItems],
        ["Replicate Failures", business.restoreFailures.replicateFailures],
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
          <h1>Beta launch dashboard & business analytics.</h1>
        </div>
        <div className="button-row">
          <Link to="/admin/payments" className="button button-small button-secondary">Review payments</Link>
          <Link to="/admin/wallets" className="button button-small">View wallets</Link>
        </div>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading dashboard metrics...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : (
        <>
          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Daily summary</p>
              <h2>Today's business metrics</h2>
            </div>
            <div className="metric-grid">
              {dashboardCards.map(([label, value]) => (
                <article key={String(label)} className="metric-card">
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Business analytics</p>
              <h2>Commerce & financial metrics</h2>
            </div>
            <div className="metric-grid">
              {bizCards.map(([label, value]) => (
                <article key={String(label)} className="metric-card metric-card-accent">
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Operations</p>
              <h2>Queue, storage, and failure tracking</h2>
            </div>
            <div className="metric-grid">
              {operationCards.map(([label, value]) => (
                <article key={String(label)} className="metric-card">
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Totals</p>
              <h2>Lifetime metrics</h2>
            </div>
            <div className="metric-grid">
              {totalCards.map(([label, value]) => (
                <article key={String(label)} className="metric-card">
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
          </article>

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
