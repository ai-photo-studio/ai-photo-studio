import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

type SignupErrors = {
  name?: string;
  email?: string;
  password?: string;
};

const validateSignup = (name: string, email: string, password: string): SignupErrors => {
  const errors: SignupErrors = {};
  if (!name.trim()) errors.name = "Name is required.";
  if (!email.trim()) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8) errors.password = "Use at least 8 characters.";
  return errors;
};

export function SignupPage() {
  const { register, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof SignupErrors, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = searchParams.get("plan") || searchParams.get("package");
  const from = useMemo(() => (location.state as { from?: string } | null)?.from || "/orders", [location.state]);
  const errors = validateSignup(name, email, password);
  const isValid = Object.keys(errors).length === 0;

  if (status === "ready" && user) {
    return <Navigate to="/orders" replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ name: true, email: true, password: true });
    const nextErrors = validateSignup(name, email, password);
    if (Object.keys(nextErrors).length > 0) {
      setError("Please fix the highlighted fields before continuing.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await register(name.trim(), email.trim(), password);
      setSuccess("Account created. Opening your customer workspace...");
      window.setTimeout(() => navigate(from, { replace: true }), 700);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        if (submitError.code === "EMAIL_EXISTS") {
          setError("That email is already in use. Try logging in instead.");
        } else if (submitError.code === "WEAK_PASSWORD") {
          setError("Password must be at least 6 characters.");
        } else {
          setError(`${submitError.message} (status ${submitError.status})`);
        }
      } else {
        setError("Unable to create your account right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (key: keyof SignupErrors) => touched[key] ? errors[key] : undefined;

  return (
    <section className="auth-shell">
      <div className="auth-hero card">
        <p className="eyebrow">Create account</p>
        <h1>A polished signup flow for the web launch.</h1>
        <p>
          Customers can join the platform, continue to protected orders, and later return with a persisted JWT session
          without needing the WhatsApp flow.
        </p>
        <div className="auth-benefits">
          <article>
            <strong>Fast onboarding</strong>
            <span>One account for orders, wallet, payments, and subscriptions.</span>
          </article>
          <article>
            <strong>Package context</strong>
            <span>{selectedPlan ? `Selected package: ${selectedPlan}` : "Pricing stays one click away."}</span>
          </article>
        </div>
        <Link to="/pricing" className="text-link">
          Review live pricing
        </Link>
      </div>

      <form className="auth-form card" onSubmit={submit} noValidate>
        <div className="section-heading section-heading-tight">
          <p className="eyebrow">Signup</p>
          <h2>Start your customer account</h2>
        </div>

        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, name: true }))}
            placeholder="Your name"
            autoComplete="name"
            aria-invalid={Boolean(fieldError("name"))}
            required
          />
          {fieldError("name") && <small className="field-error">{fieldError("name")}</small>}
        </label>

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
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            aria-invalid={Boolean(fieldError("password"))}
            required
          />
          {fieldError("password") && <small className="field-error">{fieldError("password")}</small>}
        </label>

        {success && <div className="form-success">{success}</div>}
        {error && <div className="form-error-panel">{error}</div>}

        <button type="submit" className="button button-block" disabled={loading || !isValid}>
          {loading ? "Creating account..." : "Create account"}
        </button>

        <div className="form-footnote">
          <span>Already have an account?</span>
          <Link to="/login">Log in</Link>
        </div>
      </form>
    </section>
  );
}
