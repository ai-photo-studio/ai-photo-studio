import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function AccountPage() {
  const { user } = useAuth();

  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Protected layout</p>
        <h1>Customer account area</h1>
        <p className="section-lead">
          This is a protected placeholder for the future dashboard. It confirms JWT persistence and route protection are working.
        </p>
      </div>

      <div className="card account-card">
        <h2>Signed-in profile</h2>
        <dl className="account-grid">
          <div>
            <dt>Name</dt>
            <dd>{user?.name || "Not provided"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Customer ID</dt>
            <dd>{user?.customerId || "Not linked yet"}</dd>
          </div>
        </dl>
        <p className="helper-text">
          The actual customer dashboard is deferred to the next phase, so this page stays intentionally light.
        </p>
        <Link to="/pricing" className="button button-secondary">
          Explore packages
        </Link>
      </div>
    </section>
  );
}
