import { useEffect, useState } from "react";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatMoney, formatNumber } from "../lib/format";
import type { AdminWalletRecord } from "../lib/portal-types";
import { adminApi } from "../services/adminApi";

type ResponseData = {
  items: AdminWalletRecord[];
  total: number;
  page: number;
  limit: number;
};

export function AdminWalletsPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.wallets(`page=${page}&limit=10`);
      setData(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load wallets");
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
        <p className="eyebrow">Admin wallets</p>
        <h1>Inspect wallet ledgers and balances.</h1>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading wallets...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : (
        <>
          <div className="admin-card-grid">
            {(data?.items || []).map((wallet) => {
              const latestSubscription = wallet.subscriptions[0] || null;
              return (
                <article key={wallet.id} className="card admin-record-card">
                  <div className="card-top">
                    <div>
                      <p className="eyebrow">{wallet.user.email}</p>
                      <h3>{wallet.user.name || wallet.user.email}</h3>
                    </div>
                    <span className="pill">{wallet.currency}</span>
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Balance</dt><dd>{formatMoney(wallet.balance, wallet.currency)}</dd></div>
                    <div><dt>Reserved</dt><dd>{formatMoney(wallet.reservedBalance, wallet.currency)}</dd></div>
                    <div><dt>Spent</dt><dd>{formatMoney(wallet.lifetimeSpent, wallet.currency)}</dd></div>
                    <div><dt>Credited</dt><dd>{formatMoney(wallet.lifetimeCredited, wallet.currency)}</dd></div>
                  </dl>
                  {latestSubscription && (
                    <p className="helper-text">
                      Active plan: {latestSubscription.package.name} · <StatusBadge value={latestSubscription.status} />
                    </p>
                  )}
                  <div className="ledger-list">
                    {(wallet.transactions || []).slice(0, 5).map((transaction) => (
                      <div key={transaction.id} className="ledger-item">
                        <div>
                          <strong>{transaction.type}</strong>
                          <p>{formatDateTime(transaction.createdAt)}</p>
                        </div>
                        <div>
                          <StatusBadge value={transaction.state} />
                          <strong>{formatMoney(transaction.amount, wallet.currency)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
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
