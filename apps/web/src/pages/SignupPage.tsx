import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function SignupPage() {
  const { register, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
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
      await register(name, email, password);
      navigate(from, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Unable to create your account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-grid">
      <div className="auth-copy card">
        <p className="eyebrow">Create account</p>
        <h1>Start your customer journey now.</h1>
        <p>
          Create a login for the public website. We&apos;ll keep the session around so the customer area can open
          without repeating the login flow.
        </p>
        {selectedPlan && (
          <div className="pill">Selected package: {selectedPlan}</div>
        )}
        <Link to="/pricing" className="text-link">
          Review pricing
        </Link>
      </div>
      <form className="auth-form card" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
        </label>
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
            placeholder="At least 6 characters"
            minLength={6}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="button button-block" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
        <p className="helper-text">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </section>
  );
}
