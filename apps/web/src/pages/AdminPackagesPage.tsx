import { useEffect, useState } from "react";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { formatMoney, formatNumber } from "../lib/format";
import type { PackageSummary } from "../lib/api";
import { adminApi } from "../services/adminApi";

type ResponseData = {
  items: PackageSummary[];
  total: number;
  page: number;
  limit: number;
};

const toFeatures = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => String(item)) : []);

export function AdminPackagesPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.packages(`page=${page}&limit=12`);
      setData(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load packages");
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
        <p className="eyebrow">Admin packages</p>
        <h1>Inspect the live package catalog.</h1>
      </div>

      {loading ? (
        <div className="state-panel"><p>Loading packages...</p></div>
      ) : error ? (
        <div className="state-panel state-panel-error"><p>{error}</p></div>
      ) : (
        <>
          <div className="admin-card-grid">
            {(data?.items || []).map((pkg) => {
              const features = toFeatures(pkg.includesJson);
              return (
                <article key={pkg.id} className="card admin-record-card">
                  <div className="card-top">
                    <div>
                      <p className="eyebrow">{pkg.code}</p>
                      <h3>{pkg.name}</h3>
                    </div>
                    <div className="pill-row">
                      <StatusBadge value={pkg.active ? "ACTIVE" : "INACTIVE"} />
                      {pkg.featured && <span className="pill">Featured</span>}
                    </div>
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Price</dt><dd>{formatMoney(pkg.price, pkg.currency)}</dd></div>
                    <div><dt>Images</dt><dd>{pkg.maxImages ? formatNumber(pkg.maxImages) : "Unlimited"}</dd></div>
                    <div><dt>Credits</dt><dd>{formatNumber(pkg.creditsIncluded || 0)}</dd></div>
                    <div><dt>Monthly limit</dt><dd>{formatNumber(pkg.monthlyCreditLimit || 0)}</dd></div>
                  </dl>
                  {features.length > 0 && <p className="helper-text">{features.slice(0, 4).join(" · ")}</p>}
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
