import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "../lib/format";
import type { CustomerWalletResponse } from "../lib/portal-types";
import { customerApi } from "../services/customerApi";
import { StatusBadge } from "../components/StatusBadge";

export function WalletPage() {
  const { token, status } = useAuth();
  const [data, setData] = useState<CustomerWalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (status !== "ready" || !token) return;

    const load = async () => {
      setLoading(true);
      try {
        const response = await customerApi.wallet(token);
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load wallet");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  const wallet = data?.wallet;
  const activeSubscription = data?.activeSubscription || null;

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Customer wallet</p>
        <h1>Track balance, usage, and recent wallet activity.</h1>
        <p className="section-lead">
          This page uses the logged-in customer session and existing API responses to show commercial account status.
        </p>
      </div>

      {loading ? (
        <div className="state-panel">
          <p>Loading wallet details...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <span>Available balance</span>
              <strong>{formatMoney(data?.summary.availableBalance || 0, wallet?.currency || "PKR")}</strong>
              <p>{formatNumber(data?.summary.pendingPayments || 0)} pending payments</p>
            </article>
            <article className="metric-card">
              <span>Reserved balance</span>
              <strong>{formatMoney(wallet?.reservedBalance || 0, wallet?.currency || "PKR")}</strong>
              <p>Held for active processing jobs</p>
            </article>
            <article className="metric-card">
              <span>Total spent</span>
              <strong>{formatMoney(wallet?.lifetimeSpent || 0, wallet?.currency || "PKR")}</strong>
              <p>Lifetime commercial usage</p>
            </article>
            <article className="metric-card metric-card-accent">
              <span>Total credited</span>
              <strong>{formatMoney(wallet?.lifetimeCredited || 0, wallet?.currency || "PKR")}</strong>
              <p>Credits added from approved payments</p>
            </article>
          </div>

          <div className="split-layout">
            <article className="card">
              <div className="section-heading section-heading-tight">
                <p className="eyebrow">Subscription snapshot</p>
                <h2>{activeSubscription ? activeSubscription.package.name : "No active subscription"}</h2>
              </div>
              {activeSubscription ? (
                <div className="stack">
                  <dl className="detail-grid">
                    <div>
                      <dt>Plan code</dt>
                      <dd>{activeSubscription.planCode}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd><StatusBadge value={activeSubscription.status} /></dd>
                    </div>
                    <div>
                      <dt>Monthly limit</dt>
                      <dd>{formatNumber(activeSubscription.monthlyCreditLimit)}</dd>
                    </div>
                    <div>
                      <dt>Used</dt>
                      <dd>{formatNumber(activeSubscription.monthlyCreditsUsed)}</dd>
                    </div>
                    <div>
                      <dt>Reserved</dt>
                      <dd>{formatNumber(activeSubscription.monthlyCreditsReserved)}</dd>
                    </div>
                    <div>
                      <dt>Next reset</dt>
                      <dd>{formatDateTime(activeSubscription.nextResetAt)}</dd>
                    </div>
                  </dl>
                  <p className="helper-text">
                    Remaining credits: {formatNumber(Math.max(0, activeSubscription.monthlyCreditLimit - activeSubscription.monthlyCreditsUsed - activeSubscription.monthlyCreditsReserved))}
                  </p>
                </div>
              ) : (
                <p className="helper-text">A subscription will appear here once the customer has an active plan.</p>
              )}
            </article>

            <article className="card">
              <div className="section-heading section-heading-tight">
                <p className="eyebrow">Wallet summary</p>
                <h2>Current account status</h2>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Balance</dt>
                  <dd>{formatMoney(wallet?.balance || 0, wallet?.currency || "PKR")}</dd>
                </div>
                <div>
                  <dt>Reserved</dt>
                  <dd>{formatMoney(wallet?.reservedBalance || 0, wallet?.currency || "PKR")}</dd>
                </div>
                <div>
                  <dt>Transactions</dt>
                  <dd>{formatNumber(data?.summary.totalTransactions || 0)}</dd>
                </div>
                <div>
                  <dt>Active subscriptions</dt>
                  <dd>{formatNumber(data?.summary.activeSubscriptions || 0)}</dd>
                </div>
              </dl>
              <p className="helper-text">Your commercial wallet, subscription, and processing credit usage are connected to the live API.</p>
            </article>
          </div>

          <article className="card">
            <div className="section-heading section-heading-tight">
              <p className="eyebrow">Transaction history</p>
              <h2>Recent ledger entries</h2>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Balance after</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {(wallet?.transactions || []).map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{formatDateTime(transaction.createdAt)}</td>
                      <td>{transaction.type}</td>
                      <td><StatusBadge value={transaction.state} /></td>
                      <td>{formatMoney(transaction.amount, wallet?.currency || "PKR")}</td>
                      <td>{formatMoney(transaction.balanceAfter, wallet?.currency || "PKR")}</td>
                      <td>
                        {transaction.order?.orderNo || transaction.payment?.providerRef || transaction.referenceType || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
