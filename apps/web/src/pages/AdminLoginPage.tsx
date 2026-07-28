import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { adminApi } from "../services/adminApi";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(adminApi.getProfile()?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const from = (location.state as { from?: string } | null)?.from || "/admin/dashboard";

  if (adminApi.getToken()) {
    return <Navigate to={from} replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await adminApi.login(email.trim(), password);
      adminApi.setSession(session);
      setSuccess(true);
      window.setTimeout(() => navigate(from, { replace: true }), 500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save admin token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-hero card">
        <p className="eyebrow">Enterprise admin</p>
        <h1>Dedicated admin authentication.</h1>
        <p>Enter your admin token to open the enterprise portal without affecting customer sessions.</p>
      </div>
      <form className="auth-form card" onSubmit={submit}>
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">Admin login</p>
          <h2>Open the portal</h2>
        </div>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter admin password"
            autoComplete="current-password"
          />
        </label>
        {success && <div className="form-success">Admin token saved. Redirecting...</div>}
        {error && <div className="form-error-panel">{error}</div>}
        <button type="submit" className="button button-block" disabled={loading || !email.trim() || !password.trim()}>
          {loading ? "Opening portal..." : "Enter portal"}
        </button>
      </form>
    </section>
  );
}