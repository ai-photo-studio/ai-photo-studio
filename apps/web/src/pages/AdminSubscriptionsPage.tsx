import { useEffect, useState } from "react";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../lib/format";
import type { AdminSubscriptionRecord } from "../lib/portal-types";
import { adminApi } from "../services/adminApi";

type ResponseData = {
  items: AdminSubscriptionRecord[];
  total: number;
  page: number;
  limit: number;
};

export function AdminSubscriptionsPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.subscriptions(`page=${page}&limit=10`);
      setData(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load subscriptions");
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
        <p className="eyebrow">Admin subscriptions</p>
        <h1>Review plan usage and monthly reset windows.</h1>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading subscriptions...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : (
        <>
          <div className="admin-card-grid">
            {(data?.items || []).map((subscription) => {
              const usage = subscription.usage[0] || null;
              return (
                <article key={subscription.id} className="card admin-record-card">
                  <div className="card-top">
                    <div>
                      <p className="eyebrow">{subscription.user.email}</p>
                      <h3>{subscription.package.name}</h3>
                    </div>
                    <StatusBadge value={subscription.status} />
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Limit</dt><dd>{formatNumber(subscription.monthlyCreditLimit)}</dd></div>
                    <div><dt>Used</dt><dd>{formatNumber(subscription.monthlyCreditsUsed)}</dd></div>
                    <div><dt>Reserved</dt><dd>{formatNumber(subscription.monthlyCreditsReserved)}</dd></div>
                    <div><dt>Reset</dt><dd>{formatDateTime(subscription.nextResetAt)}</dd></div>
                  </dl>
                  {usage && (
                    <p className="helper-text">
                      Usage period: {formatDateTime(usage.periodStart)} - {formatDateTime(usage.periodEnd)}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {data && <Pagination page={page} total={data.total} limit={data.limit} onPageChange={setPage} />}
        </>
      )}
    </section>
  );
}
