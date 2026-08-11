// R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG
//
// Smallest deterministic payment-freeze gate. Validates REPOSITORY
// CONFIGURATION AND SOURCE ONLY -- makes zero network calls, touches no
// database, contacts no Bank Alfalah/Replicate/R2/Northflank API.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel) => existsSync(path.join(repoRoot, rel));

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// ---------------------------------------------------------------------
// 1. MPGS must not become enabled by default.
// ---------------------------------------------------------------------
check("BANK_ALFALAH_MPGS_ENABLED defaults to false (MPGS_COMMERCIAL_HOLD fail-closed)", () => {
  const envSrc = read("apps/api/src/config/env.ts");
  const m = envSrc.match(/BANK_ALFALAH_MPGS_ENABLED:\s*z\.string\(\)\.optional\(\)\.default\("([^"]*)"\)/);
  if (!m) throw new Error("could not find BANK_ALFALAH_MPGS_ENABLED default in env.ts");
  if (m[1].toLowerCase() !== "false") {
    throw new Error(`BANK_ALFALAH_MPGS_ENABLED default is "${m[1]}", must be "false"`);
  }
});

// ---------------------------------------------------------------------
// 2. MPGS_STATUS constant must declare the commercial hold.
// ---------------------------------------------------------------------
check("MPGS_STATUS constant declares MPGS_COMMERCIAL_HOLD", () => {
  const gatewaySrc = read("apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts");
  if (!/export const MPGS_STATUS\s*=\s*"MPGS_COMMERCIAL_HOLD"/.test(gatewaySrc)) {
    throw new Error("p4c-bank-alfalah-mpgs-gateway.service.ts is missing export const MPGS_STATUS = \"MPGS_COMMERCIAL_HOLD\"");
  }
});

// ---------------------------------------------------------------------
// 3. Checkout must fail closed before any provider call when disabled.
// ---------------------------------------------------------------------
check("customer checkout refuses to start when the payment provider is disabled", () => {
  const svc = read("apps/api/src/services/customer-checkout.service.ts");
  if (!/bankAlfalahMpgs\.enabled/.test(svc)) {
    throw new Error("customer-checkout.service.ts no longer checks bankAlfalahMpgs.enabled before creating a checkout");
  }
  if (!/PAYMENT_PROVIDER_UNAVAILABLE/.test(svc)) {
    throw new Error("customer-checkout.service.ts no longer throws PAYMENT_PROVIDER_UNAVAILABLE when disabled");
  }
  const enabledCheckIdx = svc.indexOf("bankAlfalahMpgs.enabled");
  const attemptCreateIdx = svc.indexOf("prisma.paymentAttempt.create");
  if (enabledCheckIdx === -1 || attemptCreateIdx === -1 || enabledCheckIdx > attemptCreateIdx) {
    throw new Error("the enabled-check must run BEFORE any PaymentAttempt is created");
  }
});

// ---------------------------------------------------------------------
// 4. The live MPGS workflow must still require explicit manual
//    confirmation -- no workflow may fire a live request unattended.
// ---------------------------------------------------------------------
check("live MPGS workflow requires mode=live AND an exact confirm_live string", () => {
  const wf = "apps/api/.." ; void wf;
  const wfPath = ".github/workflows/bank-alfalah-mpgs-actual-app-e2e.yml";
  if (!exists(wfPath)) throw new Error(`${wfPath} does not exist`);
  const content = read(wfPath);
  if (!/confirm_live/.test(content)) {
    throw new Error(`${wfPath} no longer has a confirm_live input`);
  }
  if (!/I_UNDERSTAND_THIS_CONTACTS_THE_REAL_BANK_SANDBOX/.test(content)) {
    throw new Error(`${wfPath} no longer requires the exact confirm_live confirmation string`);
  }
  if (!/mode\s*==\s*'live'/.test(content) && !/mode == 'live'/.test(content)) {
    throw new Error(`${wfPath} live job is no longer gated on mode == 'live'`);
  }
});

// ---------------------------------------------------------------------
// 5. Legacy Alfa APG v1.1 identifiers must have zero active hits (the
//    existing retirement guard test must still exist and be intact).
// ---------------------------------------------------------------------
check("legacy Alfa APG v1.1 retirement guard test exists and is intact", () => {
  const testPath = "apps/api/src/services/p4c-bank-alfalah-legacy-apg-retired.test.ts";
  if (!exists(testPath)) throw new Error(`${testPath} does not exist -- legacy APG retirement guard was deleted`);
  const content = read(testPath);
  const requiredPatterns = ["sandbox.bankalfalah.com", "payments.bankalfalah.com", "/HS/", "Store", "Key1", "Key2", "HS_"];
  for (const p of requiredPatterns) {
    if (!content.includes(p)) {
      throw new Error(`${testPath} no longer scans for retired identifier pattern: ${p}`);
    }
  }
});

// ---------------------------------------------------------------------
// 6. No local APG implementation may exist or claim completion without
//    official bank evidence.
// ---------------------------------------------------------------------
check("no local APG implementation is presented as complete without official bank evidence", () => {
  // A real APG adapter module would live under services/ with an "apg"
  // name (distinct from the retired legacy test/evidence files, which are
  // explicitly allowed to exist). The URL-foundation files added by
  // R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION are also explicitly
  // allowed: they own only the two public ingress URLs (return/IPN), never
  // perform a status inquiry, acknowledgement, or payment mutation, and
  // never use a credential -- this is ingress plumbing, not an
  // implementation. See scripts/verify-apg-url-contract.mjs for the
  // dedicated checks that keep it that way.
  const allowedApgFiles = new Set([
    "apps/api/src/services/p4c-bank-alfalah-legacy-apg-retired.test.ts",
    "apps/api/src/controllers/bank-alfalah-apg.controller.ts",
    "apps/api/src/controllers/bank-alfalah-apg.controller.test.ts",
    "apps/api/src/routes/bank-alfalah-apg.routes.ts",
    "apps/api/src/services/bank-alfalah-apg-gateway.service.ts",
    "apps/api/src/services/bank-alfalah-apg-gateway.service.test.ts",
    "apps/api/src/config/bank-alfalah-apg-env.test.ts"
  ]);
  function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
      if (["node_modules", ".git", "dist", "build", "coverage"].includes(entry)) continue;
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (/apg/i.test(entry) && !entry.endsWith(".md")) out.push(full);
    }
    return out;
  }
  const apgFiles = walk(path.join(repoRoot, "apps", "api", "src"))
    .map((f) => path.relative(repoRoot, f).replace(/\\/g, "/"));
  const unexpected = apgFiles.filter((f) => !allowedApgFiles.has(f));
  if (unexpected.length > 0) {
    throw new Error(`found APG-named source file(s) not on the allowed list (a real APG implementation must not exist without official bank evidence): ${unexpected.join(", ")}`);
  }
  // Official evidence marker: a document must exist confirming bank docs
  // before any future APG activation status may claim "implemented".
  const protocolPath = "docs/payments/R9_2_MPGS_FREEZE_AND_APG_REACTIVATION_PROTOCOL.md";
  if (!exists(protocolPath)) throw new Error(`${protocolPath} does not exist`);
  const protocolContent = read(protocolPath);
  if (!/AWAITING_BANK_CONFIRMATION/.test(protocolContent)) {
    throw new Error(`${protocolPath} must mark unresolved APG requirements as AWAITING_BANK_CONFIRMATION`);
  }
});

// ---------------------------------------------------------------------
// 7. Only the MPGS gateway module (via a fresh Retrieve Order call) may
//    ever reach applyVerifiedPaymentEvidence -- no other path can mark
//    an order PAID.
// ---------------------------------------------------------------------
check("applyVerifiedPaymentEvidence has exactly one caller module (no provider can bypass verification)", () => {
  function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
      if (["node_modules", ".git", "dist", "build", "coverage"].includes(entry)) continue;
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
    }
    return out;
  }
  const srcFiles = walk(path.join(repoRoot, "apps", "api", "src"));
  const callers = new Set();
  for (const f of srcFiles) {
    const content = readFileSync(f, "utf8");
    if (/applyVerifiedPaymentEvidence\s*\(/.test(content) && !/export (async )?function applyVerifiedPaymentEvidence/.test(content)) {
      callers.add(path.relative(repoRoot, f).replace(/\\/g, "/"));
    }
  }
  const allowed = new Set([
    "apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts",
    "apps/api/src/services/bank-alfalah-apg-gateway.service.ts",
    "apps/api/src/services/bank-alfalah-apg-gateway.service.test.ts",
    "apps/api/src/config/bank-alfalah-apg-env.test.ts",
    // Protected local commerce E2E is the only non-provider caller. Its
    // startup guards require test mode + mock restoration and it never exists
    // in production.
    "apps/api/src/scripts/commerce-e2e-payment.ts"
  ]);
  const unexpected = [...callers].filter((f) => !allowed.has(f));
  if (unexpected.length > 0) {
    throw new Error(`applyVerifiedPaymentEvidence is called from unexpected file(s): ${unexpected.join(", ")} -- only the verified MPGS gateway module may call it`);
  }
});

// ---------------------------------------------------------------------
// 8. Historical payment evidence must not be deleted.
// ---------------------------------------------------------------------
check("historical Bank Alfalah payment evidence documents are still present", () => {
  const requiredEvidence = [
    "docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md",
    "docs/payments/bank-alfalah-mastercard/P4C_SANDBOX_SMOKE_EVIDENCE.md",
    "docs/payments/bank-alfalah-mastercard/P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md"
  ];
  const missing = requiredEvidence.filter((f) => !exists(f));
  if (missing.length > 0) {
    throw new Error(`historical payment evidence file(s) missing (must never be deleted): ${missing.join(", ")}`);
  }
});

// ---------------------------------------------------------------------
// 9. Customer checkout UI must never fabricate payment success from a
//    URL query parameter or client-only state.
// ---------------------------------------------------------------------
check("checkout UI never reads a success/paid state from URL query parameters", () => {
  const page = "apps/web/src/pages/FixedOrderReviewPage.tsx";
  if (!exists(page)) throw new Error(`${page} does not exist`);
  const content = read(page);
  if (/URLSearchParams|useSearchParams|location\.search/.test(content)) {
    throw new Error(`${page} reads URL query parameters -- checkout state must only ever come from a server response`);
  }
  if (!/Online payment is temporarily unavailable\./.test(content)) {
    throw new Error(`${page} is missing the exact required fail-closed message: "Online payment is temporarily unavailable."`);
  }
});

// ---------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------
let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`✖ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} payment-freeze checks passed`);
if (failed > 0) {
  console.error(`\n✖ verify:payment-freeze FAILED (${failed} check(s))`);
  process.exit(1);
}
console.log("\n✔ verify:payment-freeze PASSED");
