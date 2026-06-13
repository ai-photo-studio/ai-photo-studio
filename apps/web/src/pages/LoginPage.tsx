import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

type LoginErrors = {
  email?: string;
  password?: string;
};

const validateLogin = (email: string, password: string): LoginErrors => {
  const errors: LoginErrors = {};
  if (!email.trim()) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  return errors;
};

export function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof LoginErrors, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = searchParams.get("plan") || searchParams.get("package");
  const from = useMemo(() => (location.state as { from?: string } | null)?.from || "/orders", [location.state]);
  const errors = validateLogin(email, password);
  const isValid = Object.keys(errors).length === 0;

  if (status === "ready" && user) {
    return <Navigate to="/orders" replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ email: true, password: true });
    const nextErrors = validateLogin(email, password);
    if (Object.keys(nextErrors).length > 0) {
      setError("Please fix the highlighted fields before continuing.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await login(email.trim(), password);
      setSuccess("Welcome back. Opening your account...");
      window.setTimeout(() => navigate(from, { replace: true }), 650);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        if (submitError.code === "INVALID_CREDENTIALS") {
          setError("Email or password is incorrect.");
        } else {
          setError(`${submitError.message} (status ${submitError.status})`);
        }
      } else {
        setError("Unable to log in right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (key: keyof LoginErrors) => (touched[key] ? errors[key] : undefined);

  return (
    <section className="auth-shell">
      <div className="auth-hero card auth-hero-alt">
        <p className="eyebrow">Welcome back</p>
        <h1>Return to a protected customer workspace that feels premium.</h1>
        <p>
          Customers can continue with saved sessions, review active orders, and return to wallet or subscription pages
          without repeating the onboarding flow.
        </p>
        <div className="auth-benefits">
          <article>
            <strong>Persistent session</strong>
            <span>JWT storage keeps the customer signed in across visits.</span>
          </article>
          <article>
            <strong>Protected area</strong>
            <span>{selectedPlan ? `Package context: ${selectedPlan}` : "Orders, wallet, and payments stay gated."}</span>
          </article>
        </div>
        <Link to="/signup" className="text-link">
          Need an account? Sign up
        </Link>
      </div>

      <form className="auth-form card" onSubmit={submit} noValidate>
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">Login</p>
          <h2>Sign in to continue</h2>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, email: true }))}
            placeholder="name@example.com"
            autoComplete="email"
            aria-invalid={Boolean(fieldError("email"))}
            required
          />
          {fieldError("email") && <small className="field-error">{fieldError("email")}</small>}
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, password: true }))}
            placeholder="Your password"
            autoComplete="current-password"
            aria-invalid={Boolean(fieldError("password"))}
            required
          />
          {fieldError("password") && <small className="field-error">{fieldError("password")}</small>}
        </label>

        {success && <div className="form-success">{success}</div>}
        {error && <div className="form-error-panel">{error}</div>}

        <button type="submit" className="button button-block" disabled={loading || !isValid}>
          {loading ? "Signing in..." : "Log in"}
        </button>

        <div className="form-footnote">
          <span>New here?</span>
          <Link to="/signup">Create your account</Link>
        </div>
      </form>
    </section>
  );
}
