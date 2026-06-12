import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = searchParams.get("plan") || searchParams.get("package");
  const from = useMemo(() => (location.state as { from?: string } | null)?.from || "/orders", [location.state]);

  if (status === "ready" && user) {
    return <Navigate to="/orders" replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Unable to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-grid">
      <div className="auth-copy card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to resume your customer session.</h1>
        <p>
          The login state persists in the browser so customers can come back later and continue from the protected area.
        </p>
        {selectedPlan && <div className="pill">Selected package: {selectedPlan}</div>}
        <Link to="/signup" className="text-link">
          Need an account? Sign up
        </Link>
      </div>
      <form className="auth-form card" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="button button-block" disabled={loading}>
          {loading ? "Signing in..." : "Log in"}
        </button>
        <p className="helper-text">
          New here? <Link to="/signup">Create your account</Link>
        </p>
      </form>
    </section>
  );
}
