export function AdminLogsPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin logs</p>
        <h1>Audit actions, login history, and credit changes.</h1>
      </div>
      <div className="card">
        <p className="helper-text">Audit logs are captured for all admin actions including payment approvals, order retries, and credit adjustments. Access logs via Railway logs or the admin API.</p>
        <p className="helper-text" style={{ marginTop: "0.5rem" }}>
          View live logs: <code>railway logs --service api --tail 100</code>
        </p>
      </div>
    </section>
  );
}