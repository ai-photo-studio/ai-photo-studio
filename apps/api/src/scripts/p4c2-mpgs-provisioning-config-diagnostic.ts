/**
 * R9.2-P4C2-MPGS-CREDENTIAL-PROVISIONING-RESOLUTION
 *
 * Permanent, safe, network-free structural diagnostic for the Bank Alfalah
 * Mastercard Gateway (MPGS) REST credentials. This is a STANDALONE OPERATOR
 * TOOL: no HTTP surface, no controller, no background job, no scheduler, and
 * it is imported by nothing in the running application.
 *
 * It exists because the P4C sandbox smoke test (`p4c-bank-alfalah-mpgs-
 * sandbox-smoke.ts`) got a structural HTTP 404 from the real Hosted Checkout
 * endpoint, and the only way to rule out "the local secret material itself is
 * malformed" (stray whitespace, an embedded newline, a copy-paste artifact)
 * before escalating to Bank Alfalah is a check that NEVER prints a secret
 * value, a substring of one, or a hash of one -- only structural metadata:
 *
 *   - each required secret: present / missing
 *   - length (integer, in characters, after no trimming -- i.e. the raw length)
 *   - leading/trailing whitespace detected (boolean)
 *   - embedded newline/CR detected (boolean)
 *   - MERCHANT_ID: character-class validity (alphanumeric + `-`/`_` only) and
 *     length-plausibility boolean
 *   - placeholder-pattern match (boolean, same heuristic family as
 *     `p3b-replicate-r2-canary.ts`'s `classifyCredentialValue`)
 *   - Basic Auth username structure valid (`merchant.<MERCHANT_ID>`, per
 *     `buildMpgsAuthHeader` in `p4c-bank-alfalah-mpgs-gateway.service.ts` --
 *     this diagnostic does NOT reimplement or alter that function, it only
 *     re-derives the same username shape from MERCHANT_ID to check its shape)
 *   - Base64 round-trip structural validity (boolean): encode the
 *     `username:password` pair the same way `buildMpgsAuthHeader` does, then
 *     decode it back and confirm the decoded byte length and colon position
 *     match what was encoded -- proves the encoding step itself is lossless
 *     for this input without ever printing the input.
 *
 * Exit codes:
 *   0 -- diagnostic ran; see findings booleans (a "clean" diagnostic does NOT
 *        by itself prove the gateway will accept the credentials -- it only
 *        rules out local formatting defects)
 *   1 -- a required secret is entirely ABSENT (fail-closed, no further checks
 *        needed to explain a subsequent network failure)
 *
 * Usage:
 *   BANK_ALFALAH_MPGS_MERCHANT_ID=<merchant id> \
 *   BANK_ALFALAH_MPGS_API_PASSWORD=<api password> \
 *   npx tsx src/scripts/p4c2-mpgs-credential-provisioning-diagnostic.ts
 */

export type Presence = "present" | "missing";

export interface SecretStructuralFinding {
  name: string;
  presence: Presence;
  /** Raw length in characters, untrimmed. -1 when absent (never 0 vs "empty string" ambiguity). */
  length: number;
  hasLeadingWhitespace: boolean;
  hasTrailingWhitespace: boolean;
  hasEmbeddedNewline: boolean;
  placeholderSuspected: boolean;
}

export interface MerchantIdFinding {
  characterClassValid: boolean;
  lengthPlausible: boolean;
}

export interface UsernameStructureFinding {
  usernameStructureValid: boolean;
}

export interface Base64RoundTripFinding {
  base64RoundTripValid: boolean;
}

export interface MpgsCredentialDiagnosticReport {
  secrets: SecretStructuralFinding[];
  merchantId?: MerchantIdFinding;
  username?: UsernameStructureFinding;
  base64?: Base64RoundTripFinding;
  ok: boolean;
  /** Names (never values) of secrets that are entirely absent. */
  missing: string[];
}

const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /replace[-_ ]?me/i,
  /change[-_ ]?me/i,
  /placeholder/i,
  /\bdummy\b/i,
  /sample/i,
  /example/i,
  /^your[-_]/i,
  /^(test|testing|todo|tbd|none|null|undefined|0)$/i,
  /(test|fake|mock)[-_](token|key|secret|id|value|merchant|password)/i,
  /x{4,}/i,
  /^<.*>$/
];

function classifyPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

/** Never returns or logs `value` -- only structural facts about it. */
export function inspectSecret(name: string, value: string | undefined): SecretStructuralFinding {
  if (value === undefined || value === null || value.length === 0) {
    return {
      name,
      presence: "missing",
      length: -1,
      hasLeadingWhitespace: false,
      hasTrailingWhitespace: false,
      hasEmbeddedNewline: false,
      placeholderSuspected: false
    };
  }
  return {
    name,
    presence: "present",
    length: value.length,
    hasLeadingWhitespace: /^\s/.test(value),
    hasTrailingWhitespace: /\s$/.test(value),
    hasEmbeddedNewline: /[\r\n]/.test(value),
    placeholderSuspected: classifyPlaceholder(value)
  };
}

/**
 * MPGS merchant IDs are, per the standard REST v74 pattern this repository
 * already relies on (`MPGS_INTEGRATION_EVIDENCE.md`), short alphanumeric
 * tokens that may include `-`/`_`. This does NOT assert a specific length --
 * only a plausible range (4-64 chars) and character class -- because the
 * exact rule is bank-specific and unconfirmed by live documentation.
 */
export function inspectMerchantId(merchantId: string | undefined): MerchantIdFinding | undefined {
  if (!merchantId) return undefined;
  return {
    characterClassValid: /^[A-Za-z0-9_-]+$/.test(merchantId),
    lengthPlausible: merchantId.length >= 4 && merchantId.length <= 64
  };
}

/**
 * Re-derives the `merchant.<MERCHANT_ID>` username shape used by
 * `buildMpgsAuthHeader` (does not call that function, does not change it)
 * purely to confirm the shape is well-formed. Never logs the result.
 */
export function inspectUsernameStructure(merchantId: string | undefined): UsernameStructureFinding | undefined {
  if (!merchantId) return undefined;
  const username = `merchant.${merchantId}`;
  return {
    usernameStructureValid: /^merchant\.[A-Za-z0-9_-]+$/.test(username)
  };
}

/**
 * Confirms the exact Base64 encode/decode round trip used by
 * `buildMpgsAuthHeader` (`Buffer.from(\`${username}:${password}\`, "utf8").
 * toString("base64")`) is lossless for these specific inputs, WITHOUT ever
 * printing the username, password, or the encoded token itself.
 */
export function inspectBase64RoundTrip(
  merchantId: string | undefined,
  apiPassword: string | undefined
): Base64RoundTripFinding | undefined {
  if (!merchantId || !apiPassword) return undefined;
  const username = `merchant.${merchantId}`;
  const original = `${username}:${apiPassword}`;
  const encoded = Buffer.from(original, "utf8").toString("base64");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const colonIndex = decoded.indexOf(":");
  return {
    base64RoundTripValid:
      decoded === original && decoded.length === original.length && colonIndex === username.length
  };
}

export function runDiagnostic(env: Record<string, string | undefined>): MpgsCredentialDiagnosticReport {
  const merchantId = env.BANK_ALFALAH_MPGS_MERCHANT_ID;
  const apiPassword = env.BANK_ALFALAH_MPGS_API_PASSWORD;
  const operatorId = env.BANK_ALFALAH_MPGS_OPERATOR_ID;

  const secrets = [
    inspectSecret("BANK_ALFALAH_MPGS_MERCHANT_ID", merchantId),
    inspectSecret("BANK_ALFALAH_MPGS_API_PASSWORD", apiPassword),
    inspectSecret("BANK_ALFALAH_MPGS_OPERATOR_ID (portal metadata only, never used for REST auth)", operatorId)
  ];

  const missing = secrets
    .filter((s) => s.presence === "missing" && !s.name.includes("OPERATOR_ID"))
    .map((s) => s.name);

  const merchantIdFinding = inspectMerchantId(merchantId);
  const usernameFinding = inspectUsernameStructure(merchantId);
  const base64Finding = inspectBase64RoundTrip(merchantId, apiPassword);

  return {
    secrets,
    merchantId: merchantIdFinding,
    username: usernameFinding,
    base64: base64Finding,
    ok: missing.length === 0,
    missing
  };
}

function printReport(report: MpgsCredentialDiagnosticReport): void {
  console.log("R9.2-P4C2 Bank Alfalah MPGS credential-provisioning diagnostic");
  console.log("(structural metadata only -- no secret value, substring, or hash is ever printed)\n");

  for (const s of report.secrets) {
    console.log(`${s.name}:`);
    console.log(`  presence: ${s.presence}`);
    if (s.presence === "present") {
      console.log(`  length: ${s.length}`);
      console.log(`  leading whitespace detected: ${s.hasLeadingWhitespace}`);
      console.log(`  trailing whitespace detected: ${s.hasTrailingWhitespace}`);
      console.log(`  embedded newline detected: ${s.hasEmbeddedNewline}`);
      console.log(`  placeholder pattern suspected: ${s.placeholderSuspected}`);
    }
  }

  if (report.merchantId) {
    console.log("\nBANK_ALFALAH_MPGS_MERCHANT_ID structural checks:");
    console.log(`  character-class valid (alphanumeric/-/_ only): ${report.merchantId.characterClassValid}`);
    console.log(`  length plausible (4-64 chars): ${report.merchantId.lengthPlausible}`);
  }

  if (report.username) {
    console.log("\nBasic Auth username structure (merchant.<MERCHANT_ID>):");
    console.log(`  structure valid: ${report.username.usernameStructureValid}`);
  }

  if (report.base64) {
    console.log("\nBase64 round-trip structural check (username:password encode/decode):");
    console.log(`  round-trip valid: ${report.base64.base64RoundTripValid}`);
  }

  console.log(`\nRESULT: ${report.ok ? "all required secrets present" : "one or more required secrets MISSING"}`);
  if (!report.ok) {
    console.log(`missing: ${report.missing.join(", ")}`);
  }
}

/* c8 ignore start -- CLI entry point, exercised via unit tests calling runDiagnostic() directly */
if (require.main === module) {
  const report = runDiagnostic(process.env);
  printReport(report);
  process.exit(report.ok ? 0 : 1);
}
/* c8 ignore stop */
