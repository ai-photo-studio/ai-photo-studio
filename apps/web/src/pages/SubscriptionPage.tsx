import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../lib/format";
import type { CustomerSubscriptionResponse, PortalSubscriptionRecord } from "../lib/portal-types";
import { customerApi } from "../services/customerApi";

export function SubscriptionPage() {
  const { token, status } = useAuth();
  const [data, setData] = useState<CustomerSubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    if (status !== "ready" || !token) return;

    const load = async () => {
      setLoading(true);
      try {
        const response = await customerApi.subscription(token, page, 10);
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load subscription details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, status, token]);

  const renderSubscription = (subscription: PortalSubscriptionRecord) => {
    const usage = subscription.usage[0] || null;
    return (
      <article key={subscription.id} className="card subscription-card">
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">{subscription.package.code}</p>
          <h3>{subscription.package.name}</h3>
        </div>
        <div className="pill-row">
          <StatusBadge value={subscription.status} />
          <span className="pill">Plan {subscription.planCode}</span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Limit</dt>
            <dd>{formatNumber(subscription.monthlyCreditLimit)}</dd>
          </div>
          <div>
            <dt>Used</dt>
            <dd>{formatNumber(subscription.monthlyCreditsUsed)}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{formatNumber(subscription.monthlyCreditsReserved)}</dd>
          </div>
          <div>
            <dt>Reset</dt>
            <dd>{formatDateTime(subscription.nextResetAt)}</dd>
          </div>
        </dl>
        <p className="helper-text">
          Remaining credits: {formatNumber(Math.max(0, subscription.monthlyCreditLimit - subscription.monthlyCreditsUsed - subscription.monthlyCreditsReserved))}
        </p>
        {usage && (
          <div className="usage-panel">
            <div>
              <span>Spent</span>
              <strong>{formatNumber(usage.creditsSpent)}</strong>
            </div>
            <div>
              <span>Reserved</span>
              <strong>{formatNumber(usage.creditsReserved)}</strong>
            </div>
            <div>
              <span>Completed</span>
              <strong>{formatNumber(usage.jobsCompleted)}</strong>
            </div>
            <div>
              <span>Failed</span>
              <strong>{formatNumber(usage.jobsFailed)}</strong>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Subscription</p>
        <h1>Review plan limits and monthly usage.</h1>
        <p className="section-lead">
          The subscription page uses the current authenticated user and the existing subscription framework from the API.
        </p>
      </div>

      {loading ? (
        <div className="state-panel">
          <p>Loading subscription data...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <span>Plan</span>
              <strong>{data?.summary?.planName || "None"}</strong>
              <p>{data?.summary ? `${data.summary.remainingCredits} remaining credits` : "No active plan yet"}</p>
            </article>
            <article className="metric-card">
              <span>Used this month</span>
              <strong>{formatNumber(data?.summary?.monthlyCreditsUsed || 0)}</strong>
              <p>Resets on {formatDateTime(data?.summary?.nextResetAt || null)}</p>
            </article>
            <article className="metric-card">
              <span>Reserved</span>
              <strong>{formatNumber(data?.summary?.monthlyCreditsReserved || 0)}</strong>
              <p>Currently reserved for active work</p>
            </article>
            <article className="metric-card metric-card-accent">
              <span>Limit</span>
              <strong>{formatNumber(data?.summary?.monthlyCreditLimit || 0)}</strong>
              <p>Plan allowance for the billing cycle</p>
            </article>
          </div>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Active plan</p>
              <h2>{data?.activeSubscription ? data.activeSubscription.package.name : "No active subscription"}</h2>
            </div>
            {data?.activeSubscription ? (
              <dl className="detail-grid">
                <div>
                  <dt>Status</dt>
                  <dd><StatusBadge value={data.activeSubscription.status} /></dd>
                </div>
                <div>
                  <dt>Period start</dt>
                  <dd>{formatDateTime(data.activeSubscription.periodStart)}</dd>
                </div>
                <div>
                  <dt>Period end</dt>
                  <dd>{formatDateTime(data.activeSubscription.periodEnd)}</dd>
                </div>
                <div>
                  <dt>Last reset</dt>
                  <dd>{formatDateTime(data.activeSubscription.lastResetAt)}</dd>
                </div>
              </dl>
            ) : (
              <p className="helper-text">When a package is approved, the active subscription will appear here with live usage stats.</p>
            )}
          </article>

          <div className="subscription-grid">{(data?.items || []).map(renderSubscription)}</div>

          {data && <Pagination page={page} total={data.total} limit={data.limit} onPageChange={setPage} />}
        </>
      )}
    </section>
  );
}
