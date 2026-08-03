import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { PaymentStatusLabel } from "../components/PaymentStatusLabel";
import { formatDateTime, formatMoney } from "../lib/format";
import {
  FIXED_ORDER_STATUSES,
  FIXED_ORDER_CURRENCIES,
  MARKETS,
  PAYMENT_ATTEMPT_STATUSES,
  type AdminCommerceOrderListItem
} from "../lib/portal-types";
import { adminApi } from "../services/adminApi";

type ResponseData = {
  items: AdminCommerceOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const formatMinor = (amountMinor: string, currency: string) => formatMoney(Number(amountMinor) / 100, currency);

// R9.2-P2R-ADMIN-COMMERCE-FILTER-VALIDATION.
//
// `GET /api/admin/commerce-orders` matches `status`/`market`/`currency`/
// `paymentStatus` by exact equality after its own `.toUpperCase()` (see
// apps/api/src/services/admin-commerce.service.ts), so a typo such as "PAIDD"
// used to be sent verbatim and came back as a silent, unexplained empty list.
// These filters are therefore validated here against the single source of
// truth in `portal-types.ts` -- the same `as const` arrays the union types are
// derived from, never a second copy of the literals. `orderNo` is a
// substring search, not an enum, so it is intentionally not validated.
//
// Normalization is trim + uppercase only, which is safe precisely because the
// server already uppercases the value: "paid", " PAID " and "PAID" are
// unambiguously the same request. Nothing else about the value is rewritten.
const ENUM_FILTERS = {
  status: { label: "order status", values: FIXED_ORDER_STATUSES as readonly string[] },
  market: { label: "market", values: MARKETS as readonly string[] },
  currency: { label: "currency", values: FIXED_ORDER_CURRENCIES as readonly string[] },
  paymentStatus: { label: "payment status", values: PAYMENT_ATTEMPT_STATUSES as readonly string[] }
} as const;

type EnumFilterName = keyof typeof ENUM_FILTERS;

const normalizeFilterValue = (raw: string) => raw.trim().toUpperCase();

/** Returns null when the (trimmed/uppercased) value is empty or a real enum member. */
function filterHint(name: EnumFilterName, raw: string): string | null {
  const normalized = normalizeFilterValue(raw);
  if (!normalized) return null;
  if (ENUM_FILTERS[name].values.includes(normalized)) return null;
  return `No such ${ENUM_FILTERS[name].label}: "${normalized}". Nothing was searched.`;
}

// R9.2-P2R-ADMIN: read-only FixedOrder list. This page issues GET requests
// only -- there is no mutation control anywhere on it (no mark-paid, retry,
// refund, or fulfilment trigger).
export function AdminCommerceOrdersPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [page, setPage] = useState(1);
  const [orderNo, setOrderNo] = useState("");
  const [status, setStatus] = useState("");
  const [market, setMarket] = useState("");
  const [currency, setCurrency] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hints: Record<EnumFilterName, string | null> = {
    status: filterHint("status", status),
    market: filterHint("market", market),
    currency: filterHint("currency", currency),
    paymentStatus: filterHint("paymentStatus", paymentStatus)
  };
  const hasInvalidFilter = Object.values(hints).some((hint) => hint !== null);

  const load = async () => {
    // Invariant: while any enum-backed filter holds a value that is not a real
    // enum member, NO list request is issued at all -- not with the bad value,
    // and not with the bad value silently dropped either (which would show a
    // result set that does not match what the operator typed).
    if (hasInvalidFilter) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (orderNo) params.set("orderNo", orderNo);
      if (normalizeFilterValue(status)) params.set("status", normalizeFilterValue(status));
      if (normalizeFilterValue(market)) params.set("market", normalizeFilterValue(market));
      if (normalizeFilterValue(currency)) params.set("currency", normalizeFilterValue(currency));
      if (normalizeFilterValue(paymentStatus)) params.set("paymentStatus", normalizeFilterValue(paymentStatus));
      const response = await adminApi.commerceOrders(params.toString());
      setData(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load commerce orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    void load();
  };

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin commerce orders</p>
        <h1>Fixed orders, PriceBook snapshots, and payment attempts.</h1>
        <p className="helper-text">Read-only. No action on this page can mark an order paid, retry a provider, refund, or trigger fulfilment.</p>
      </div>

      <form className="card" onSubmit={applyFilters} aria-label="Filter commerce orders">
        <div className="form-grid">
          <label>
            Order number
            <input value={orderNo} onChange={(event) => setOrderNo(event.target.value)} placeholder="FXD-..." />
          </label>
          {/*
            Each enum-backed field keeps an explicit aria-label: the inline
            hint below renders inside the wrapping <label>, so without it the
            field's accessible name would absorb the error text. The error is
            conveyed by aria-describedby + role="alert" instead.
          */}
          <label>
            Status
            <input
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="LOCKED"
              aria-label="Status"
              aria-invalid={hints.status ? true : undefined}
              aria-describedby={hints.status ? "filter-hint-status" : undefined}
            />
            {hints.status ? (
              <span id="filter-hint-status" role="alert" className="helper-text" data-testid="filter-hint-status">
                {hints.status}
              </span>
            ) : null}
          </label>
          <label>
            Market
            <input
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              placeholder="PAKISTAN"
              aria-label="Market"
              aria-invalid={hints.market ? true : undefined}
              aria-describedby={hints.market ? "filter-hint-market" : undefined}
            />
            {hints.market ? (
              <span id="filter-hint-market" role="alert" className="helper-text" data-testid="filter-hint-market">
                {hints.market}
              </span>
            ) : null}
          </label>
          <label>
            Currency
            <input
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              placeholder="PKR"
              aria-label="Currency"
              aria-invalid={hints.currency ? true : undefined}
              aria-describedby={hints.currency ? "filter-hint-currency" : undefined}
            />
            {hints.currency ? (
              <span id="filter-hint-currency" role="alert" className="helper-text" data-testid="filter-hint-currency">
                {hints.currency}
              </span>
            ) : null}
          </label>
          <label>
            Payment status
            <input
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              placeholder="PAID"
              aria-label="Payment status"
              aria-invalid={hints.paymentStatus ? true : undefined}
              aria-describedby={hints.paymentStatus ? "filter-hint-paymentStatus" : undefined}
            />
            {hints.paymentStatus ? (
              <span
                id="filter-hint-paymentStatus"
                role="alert"
                className="helper-text"
                data-testid="filter-hint-paymentStatus"
              >
                {hints.paymentStatus}
              </span>
            ) : null}
          </label>
        </div>
        <div className="button-row" style={{ marginTop: "0.75rem" }}>
          <button type="submit" className="button">Apply filters</button>
        </div>
      </form>

      {loading ? (
        <div className="state-panel" role="status" aria-live="polite"><p>Loading commerce orders...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error" role="alert">
          <p>{error}</p>
          <div className="button-row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="button" onClick={() => void load()}>Retry</button>
          </div>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="state-panel"><p>No commerce orders match these filters.</p></div>
      ) : data ? (
        <>
          <div className="admin-card-grid">
            {data.items.map((order) => (
              <Link key={order.id} to={`/admin/commerce-orders/${order.orderNo}`} className="card admin-record-card">
                <div className="card-top">
                  <div>
                    <p className="eyebrow">{order.orderNo}</p>
                    <h3>{order.type}</h3>
                  </div>
                  <span className="pill">{order.currency}</span>
                </div>
                <dl className="detail-grid">
                  <div><dt>Market</dt><dd>{order.market}</dd></div>
                  <div><dt>Amount</dt><dd>{formatMinor(order.totalAmountMinor, order.currency)}</dd></div>
                  <div><dt>Order status</dt><dd><StatusBadge value={order.status} /></dd></div>
                  <div>
                    <dt>Payment status</dt>
                    <dd>{order.paymentStatus ? <PaymentStatusLabel status={order.paymentStatus} /> : "No attempt yet"}</dd>
                  </div>
                  <div><dt>Created</dt><dd>{formatDateTime(order.createdAt)}</dd></div>
                </dl>
              </Link>
            ))}
          </div>
          <Pagination page={data.page} total={data.total} limit={data.pageSize} onPageChange={setPage} />
        </>
      ) : null}
    </section>
  );
}
