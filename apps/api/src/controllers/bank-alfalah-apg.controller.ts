// R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION
//
// Bank Alfalah local APG URL ingress FOUNDATION ONLY. This module owns the
// exact two public URLs the bank will be told to point at once official
// documents arrive, and nothing else:
//
//   GET  /api/payments/bank-alfalah/return   -- browser return
//   POST /api/payments/bank-alfalah/ipn      -- server-to-server listener
//
// Neither handler performs a status inquiry, an acknowledgement, or any
// payment mutation. Neither handler ever marks a `PaymentAttempt`/
// `FixedOrder` PAID. Neither handler ever makes an outbound network call of
// any kind -- this is enforced by the absence of any such call in this
// file, proven by `scripts/verify-apg-url-contract.mjs` and
// `p4c-bank-alfalah-legacy-apg-retired.test.ts`. This is deliberate:
// authentication, acknowledgement,
// and status-inquiry contracts are AWAITING_BANK_CONFIRMATION (see
// docs/payments/R9_2_APG_URL_INGRESS_PROTOCOL.md and
// docs/payments/R9_2_APG_REQUIREMENTS_MATRIX.md) and must not be guessed.
//
// Disabled by default via `BANK_ALFALAH_APG_ENABLED` (defaults "false").
// While disabled, both routes exist (so the bank can validate reachability)
// but always respond with a truthful "not yet available" status and never
// process anything.
import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Exact allowlist enforcement for the IPN listener's documented `url`
 * parameter. SSRF prevention: this function only ever validates a URL's
 * shape and host against an environment-owned allowlist -- it never
 * fetches, resolves, or otherwise contacts the URL. No hardcoded host
 * (legacy, guessed, or otherwise) is ever accepted; the allowlist is
 * empty by default, which fails closed (rejects everything) until the
 * owner configures real, bank-confirmed hosts.
 */
export function isAllowedApgCallbackUrl(rawUrl: string, allowedHostsCsv: string): { allowed: boolean; reason: string } {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { allowed: false, reason: "missing url parameter" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "malformed url" };
  }

  if (parsed.protocol !== "https:") {
    return { allowed: false, reason: "non-HTTPS url rejected" };
  }

  const allowedHosts = allowedHostsCsv
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);

  if (allowedHosts.length === 0) {
    return { allowed: false, reason: "no callback host is configured (fail-closed)" };
  }

  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    return { allowed: false, reason: "url host is not on the approved allowlist" };
  }

  return { allowed: true, reason: "host approved" };
}

/**
 * The only return-URL query parameters this foundation ever reads, purely
 * to log/echo their presence -- never to infer payment status. Any other
 * parameter is ignored. This list will be revised once the bank documents
 * the real return-parameter contract (AWAITING_BANK_CONFIRMATION).
 */
const DOCUMENTED_RETURN_PARAM_NAMES = ["orderNo", "sessionId"] as const;

export class BankAlfalahApgController {
  constructor(private readonly config: AppConfig) {}

  private isEnabled(): boolean {
    const raw = (this.config as unknown as Record<string, string>).BANK_ALFALAH_APG_ENABLED ?? "false";
    return raw.trim().toLowerCase() === "true";
  }

  private allowedHosts(): string {
    return (this.config as unknown as Record<string, string>).BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS ?? "";
  }

  /**
   * GET /api/payments/bank-alfalah/return
   *
   * Browser return from the bank's hosted page (once implemented). This
   * handler NEVER marks anything PAID -- it only ever reports the current
   * truthful, server-known state (currently always "unavailable" while
   * APG is disabled). No query parameter here is ever trusted as payment
   * evidence, documented or not.
   */
  return = (req: Request, res: Response): void => {
    const presentParams = DOCUMENTED_RETURN_PARAM_NAMES.filter((name) => typeof req.query[name] === "string");
    logger.info("Bank Alfalah APG: return URL hit", {
      enabled: this.isEnabled(),
      presentParams
    });

    res.status(200).json({
      success: true,
      data: {
        status: "PAYMENT_UNAVAILABLE",
        message: "Online payment is temporarily unavailable."
      }
    });
  };

  /**
   * POST /api/payments/bank-alfalah/ipn
   *
   * Server-to-server listener. Accepts the documented `url` parameter
   * (the bank's typical IPN shape: a callback/status-fetch URL for this
   * server to call back). This handler validates that `url` against the
   * environment-owned allowlist and REJECTS everything else -- missing,
   * malformed, non-HTTPS, or unapproved-host URLs all fail closed with no
   * further action. It NEVER fetches the URL, NEVER performs a status
   * inquiry, and NEVER mutates any payment/order row, regardless of
   * whether the URL is approved -- that logic is explicitly deferred
   * until official APG credentials and acknowledgement requirements are
   * confirmed by the bank.
   */
  ipn = (req: Request, res: Response): void => {
    if (!this.isEnabled()) {
      logger.info("Bank Alfalah APG: IPN received while disabled, rejected", {});
      res.status(503).json({ success: false, code: "APG_DISABLED", message: "Payment provider is unavailable" });
      return;
    }

    const rawUrl = typeof req.body?.url === "string" ? req.body.url : undefined;
    const verdict = isAllowedApgCallbackUrl(rawUrl ?? "", this.allowedHosts());

    if (!verdict.allowed) {
      logger.warn("Bank Alfalah APG: IPN url rejected", { reason: verdict.reason });
      res.status(400).json({ success: false, code: "APG_IPN_URL_REJECTED", message: verdict.reason });
      return;
    }

    // Approved host, but no status fetch or payment mutation occurs here --
    // see the class-level doc comment. Acknowledged only.
    logger.info("Bank Alfalah APG: IPN url approved, no action taken (status inquiry not yet implemented)", {});
    res.status(202).json({ success: true, data: { status: "ACKNOWLEDGED_NO_ACTION" } });
  };
}
