import type { PaymentAttemptStatus } from "../lib/portal-types";

/**
 * R9.2-P2R-STATUS-UI: one shared, read-only, presentation-only status layer
 * for existing customer/admin FixedOrder/PaymentAttempt/payment-readiness
 * displays.
 *
 * This module maps ONLY the `PaymentAttemptStatus` literal values that
 * already exist in `apps/web/src/lib/portal-types.ts` (no new status enum,
 * no new domain rule). It is pure and read-only: no fetch calls, no
 * mutation, no side effects. "No attempt" (status null/undefined) and
 * "provider unavailable" / "readiness blocked" (derived from
 * payment-readiness `reasons`, never from `PaymentAttemptStatus`) are each
 * their own distinct presentation -- never conflated with PENDING-like
 * attempt statuses or with a persisted `FAILED`/`CANCELLED` attempt. Any
 * value outside the known `PaymentAttemptStatus` set falls back to a
 * neutral, fail-safe "Status unavailable" presentation -- it is never
 * mapped to `PAID` or any other success-implying label.
 */

export type PaymentStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type PaymentStatusPresentation = {
  /** Short, human-readable label. Never fabricates success for an unknown value. */
  label: string;
  /** Short, truthful description of what this status means. */
  description: string;
  /** Accessible name suitable for aria-label. */
  ariaLabel: string;
  /** Visual treatment token (CSS class suffix); color is never the only signal -- label/description text is always present too. */
  tone: PaymentStatusTone;
  /** False only for a status string that is not one of the known PaymentAttemptStatus values. */
  isKnown: boolean;
};

type KnownPresentation = Pick<PaymentStatusPresentation, "label" | "description" | "tone">;

const KNOWN_PAYMENT_ATTEMPT_STATUS_PRESENTATION: Record<PaymentAttemptStatus, KnownPresentation> = {
  CREATED: {
    label: "Attempt created",
    description: "A payment attempt has been created but has not yet reached the provider.",
    tone: "neutral"
  },
  REDIRECT_READY: {
    label: "Redirect ready",
    description: "A payment session is ready; the customer has not yet completed it.",
    tone: "info"
  },
  CUSTOMER_RETURNED: {
    label: "Returned from provider",
    description: "The customer returned from the payment provider; the outcome is not yet final.",
    tone: "info"
  },
  CANCELLED_BY_CUSTOMER: {
    label: "Cancelled by customer",
    description: "The customer cancelled this payment attempt before it completed.",
    tone: "neutral"
  },
  EXPIRED: {
    label: "Expired",
    description: "This payment attempt expired before it was completed.",
    tone: "warning"
  },
  CALLBACK_PENDING: {
    label: "Awaiting confirmation",
    description: "Waiting for the payment provider to confirm the outcome of this attempt.",
    tone: "info"
  },
  AUTHORIZED: {
    label: "Authorized",
    description: "The payment provider has authorized this payment; settlement is not yet final.",
    tone: "info"
  },
  PAID: {
    label: "Paid",
    description: "This payment has been completed and persisted by the provider.",
    tone: "success"
  },
  FAILED: {
    label: "Failed",
    description: "This payment attempt failed and did not complete.",
    tone: "danger"
  },
  CANCELLED: {
    label: "Cancelled",
    description: "This payment attempt was cancelled.",
    tone: "neutral"
  },
  REFUNDED: {
    label: "Refunded",
    description: "This payment was completed and has since been refunded in full.",
    tone: "neutral"
  },
  PARTIALLY_REFUNDED: {
    label: "Partially refunded",
    description: "This payment was completed and has since been partially refunded.",
    tone: "neutral"
  },
  DISPUTED: {
    label: "Disputed",
    description: "This payment is under dispute with the provider.",
    tone: "warning"
  },
  CHARGEBACK: {
    label: "Chargeback",
    description: "A chargeback was filed against this payment.",
    tone: "danger"
  }
};

const NO_ATTEMPT_PRESENTATION: KnownPresentation = {
  label: "No payment attempt",
  description: "No payment attempt has been started for this order yet.",
  tone: "neutral"
};

/** Distinct from a persisted FAILED/CANCELLED attempt -- this is a payment-readiness blocker, not an attempt outcome. */
const PROVIDER_UNAVAILABLE_PRESENTATION: KnownPresentation = {
  label: "Provider unavailable",
  description: "The payment provider is not yet configured or reachable for this order.",
  tone: "warning"
};

/** Distinct from a persisted FAILED/CANCELLED attempt -- this is a general payment-readiness blocker (e.g. unapproved pricing, order status). */
const READINESS_BLOCKED_PRESENTATION: KnownPresentation = {
  label: "Payment blocked",
  description: "Payment is not available for this order yet.",
  tone: "warning"
};

const UNKNOWN_STATUS_PRESENTATION: Omit<KnownPresentation, "description"> = {
  label: "Status unavailable",
  tone: "neutral"
};

function isKnownPaymentAttemptStatus(value: string): value is PaymentAttemptStatus {
  return Object.prototype.hasOwnProperty.call(KNOWN_PAYMENT_ATTEMPT_STATUS_PRESENTATION, value);
}

/**
 * Pure mapping from an already-existing PaymentAttempt status value (or
 * null/undefined for "no attempt") to a presentation. Never mutates,
 * fetches, or infers state from `location.search` -- callers must pass the
 * status exactly as read from a persisted API response.
 */
export function getPaymentStatusPresentation(status: string | null | undefined): PaymentStatusPresentation {
  if (status === null || status === undefined || status === "") {
    return { ...NO_ATTEMPT_PRESENTATION, ariaLabel: `Payment status: ${NO_ATTEMPT_PRESENTATION.label}`, isKnown: true };
  }
  if (isKnownPaymentAttemptStatus(status)) {
    const known = KNOWN_PAYMENT_ATTEMPT_STATUS_PRESENTATION[status];
    return { ...known, ariaLabel: `Payment status: ${known.label} (${status})`, isKnown: true };
  }
  // Defensive fail-safe: an unrecognized status string is NEVER mapped to
  // PAID or any other success-implying label. The raw value is preserved
  // for diagnostics but never trusted for meaning.
  return {
    ...UNKNOWN_STATUS_PRESENTATION,
    description: `This payment attempt has an unrecognized status ("${status}"); treat it as not paid.`,
    ariaLabel: `Payment status: unavailable (unrecognized raw value)`,
    isKnown: false
  };
}

/** Provider-unavailable readiness blocker -- explicitly NOT the same as a FAILED attempt. */
export function getProviderUnavailablePresentation(): PaymentStatusPresentation {
  return { ...PROVIDER_UNAVAILABLE_PRESENTATION, ariaLabel: `Payment status: ${PROVIDER_UNAVAILABLE_PRESENTATION.label}`, isKnown: true };
}

/** General payment-readiness-blocked state -- explicitly NOT the same as a FAILED/CANCELLED attempt. */
export function getReadinessBlockedPresentation(): PaymentStatusPresentation {
  return { ...READINESS_BLOCKED_PRESENTATION, ariaLabel: `Payment status: ${READINESS_BLOCKED_PRESENTATION.label}`, isKnown: true };
}

const TONE_COLORS: Record<PaymentStatusTone, { background: string; color: string }> = {
  neutral: { background: "#e5e7eb", color: "#111827" },
  info: { background: "#dbeafe", color: "#111827" },
  success: { background: "#dcfce7", color: "#111827" },
  warning: { background: "#fef3c7", color: "#111827" },
  danger: { background: "#fee2e2", color: "#111827" }
};

export type PaymentStatusLabelProps = {
  /** An already-persisted PaymentAttempt status value, or null/undefined for "no attempt yet". Never a value derived from `location.search`. */
  status?: string | null;
};

/**
 * Pure, presentation-only badge for an existing PaymentAttempt status.
 * Renders the raw persisted status text (so it never changes what a
 * reader can audit) plus a visual tone and an accessible name -- status
 * meaning never depends on color alone. No fetch, no mutation, no
 * `useEffect`.
 */
export function PaymentStatusLabel({ status }: PaymentStatusLabelProps) {
  const presentation = getPaymentStatusPresentation(status);
  const colors = TONE_COLORS[presentation.tone];
  const visibleText = status ? status : presentation.label;
  return (
    <span
      className={`payment-status-label payment-status-${presentation.tone}`}
      aria-label={presentation.ariaLabel}
      title={presentation.description}
      data-payment-status-known={presentation.isKnown ? "true" : "false"}
      style={{
        background: colors.background,
        color: colors.color,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600
      }}
    >
      {visibleText}
    </span>
  );
}
