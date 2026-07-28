export function AdminProvidersPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Admin providers</p>
        <h1>AI provider configuration and status.</h1>
      </div>
      <div className="card">
        <p className="helper-text">Provider management UI. Current provider: mock. Real providers (photoroom, fal) can be enabled via environment configuration.</p>
      </div>
    </section>
  );
}