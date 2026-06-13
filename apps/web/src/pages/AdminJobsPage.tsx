import { useEffect, useState } from "react";
import { adminApi } from "../services/adminApi";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";

type JobItem = {
  id: string;
  queueName: string;
  jobName: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  order?: {
    orderNo: string;
  };
};

export function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminApi.jobs();
      setJobs(response.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin jobs</p>
        <h1>Queue monitoring and retry controls.</h1>
      </div>

      {loading ? (
        <div className="state-panel">
          <p>Loading jobs...</p>
        </div>
      ) : error ? (
        <div className="state-panel state-panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <div className="admin-card-grid">
          {(jobs || []).map((job) => (
            <article key={job.id} className="card admin-record-card">
              <div className="card-top">
                <div>
                  <p className="eyebrow">{job.queueName}</p>
                  <h3>{job.jobName}</h3>
                  {job.order && <span className="helper-text">Order: {job.order.orderNo}</span>}
                </div>
                <StatusBadge value={job.status} />
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Attempts</dt>
                  <dd>{job.attempts}/{job.maxAttempts}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{job.startedAt ? formatDateTime(job.startedAt) : "—"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(job.createdAt)}</dd>
                </div>
                {job.errorMessage && (
                  <div className="detail-full">
                    <dt>Error</dt>
                    <dd className="form-error-panel" style={{ marginTop: "0.5rem" }}>
                      {job.errorMessage}
                    </dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}