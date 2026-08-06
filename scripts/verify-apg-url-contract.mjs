// R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION
//
// Smallest deterministic APG URL-foundation gate. Validates REPOSITORY
// CONFIGURATION AND SOURCE ONLY -- makes zero network calls, touches no
// database, contacts no Bank Alfalah/Replicate/R2/Northflank API.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel) => existsSync(path.join(repoRoot, rel));

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

const ROUTES_FILE = "apps/api/src/routes/bank-alfalah-apg.routes.ts";
const CONTROLLER_FILE = "apps/api/src/controllers/bank-alfalah-apg.controller.ts";
const FRONTEND_FILE = "apps/web/src/pages/PaymentReturnPage.tsx";
const ENV_FILE = "apps/api/src/config/env.ts";
const APP_FILE = "apps/web/src/App.tsx";

// ---------------------------------------------------------------------
// 1. Both exact routes exist, with the exact HTTP methods.
// ---------------------------------------------------------------------
check("GET /api/payments/bank-alfalah/return route exists", () => {
  if (!exists(ROUTES_FILE)) throw new Error(`${ROUTES_FILE} does not exist`);
  const content = read(ROUTES_FILE);
  if (!/router\.get\(\s*"\/payments\/bank-alfalah\/return"/.test(content)) {
    throw new Error("GET /payments/bank-alfalah/return route is missing or uses the wrong HTTP method");
  }
});

check("POST /api/payments/bank-alfalah/ipn route exists", () => {
  if (!exists(ROUTES_FILE)) throw new Error(`${ROUTES_FILE} does not exist`);
  const content = read(ROUTES_FILE);
  if (!/router\.post\(\s*"\/payments\/bank-alfalah\/ipn"/.test(content)) {
    throw new Error("POST /payments/bank-alfalah/ipn route is missing or uses the wrong HTTP method");
  }
});

check("bank-alfalah-apg router is mounted under /api in index.ts", () => {
  const indexContent = read("apps/api/src/index.ts");
  if (!/createBankAlfalahApgRouter/.test(indexContent)) {
    throw new Error("createBankAlfalahApgRouter is not imported/mounted in index.ts");
  }
  if (!/app\.use\("\/api",\s*createBankAlfalahApgRouter/.test(indexContent)) {
    throw new Error("createBankAlfalahApgRouter is not mounted at /api");
  }
});

// ---------------------------------------------------------------------
// 2. APG must not be enabled by default.
// ---------------------------------------------------------------------
check("BANK_ALFALAH_APG_ENABLED defaults to false", () => {
  const envSrc = read(ENV_FILE);
  const m = envSrc.match(/BANK_ALFALAH_APG_ENABLED:\s*z\.string\(\)\.optional\(\)\.default\("([^"]*)"\)/);
  if (!m) throw new Error("could not find BANK_ALFALAH_APG_ENABLED default in env.ts");
  if (m[1].toLowerCase() !== "false") {
    throw new Error(`BANK_ALFALAH_APG_ENABLED default is "${m[1]}", must be "false"`);
  }
});

check("BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS defaults to empty (fail-closed allowlist)", () => {
  const envSrc = read(ENV_FILE);
  const m = envSrc.match(/BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS:\s*z\.string\(\)\.optional\(\)\.default\("([^"]*)"\)/);
  if (!m) throw new Error("could not find BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS default in env.ts");
  if (m[1] !== "") {
    throw new Error(`BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS default is "${m[1]}", must be empty (no hardcoded host)`);
  }
});

// ---------------------------------------------------------------------
// 3. MPGS must remain frozen -- unaffected by this packet.
// ---------------------------------------------------------------------
check("BANK_ALFALAH_MPGS_ENABLED still defaults to false (MPGS remains frozen)", () => {
  const envSrc = read(ENV_FILE);
  const m = envSrc.match(/BANK_ALFALAH_MPGS_ENABLED:\s*z\.string\(\)\.optional\(\)\.default\("([^"]*)"\)/);
  if (!m) throw new Error("could not find BANK_ALFALAH_MPGS_ENABLED default in env.ts");
  if (m[1].toLowerCase() !== "false") {
    throw new Error(`BANK_ALFALAH_MPGS_ENABLED default is "${m[1]}", MPGS must remain commercially frozen`);
  }
});

// ---------------------------------------------------------------------
// 4. Browser return handler must never mark PAID / never call the
//    payment-verification transaction.
// ---------------------------------------------------------------------
check("the return handler never calls applyVerifiedPaymentEvidence or writes PAID", () => {
  if (!exists(CONTROLLER_FILE)) throw new Error(`${CONTROLLER_FILE} does not exist`);
  const content = read(CONTROLLER_FILE);
  if (/applyVerifiedPaymentEvidence/.test(content)) {
    throw new Error(`${CONTROLLER_FILE} references applyVerifiedPaymentEvidence -- the APG foundation must never call the payment-verification transaction`);
  }
  if (/["']PAID["']/.test(content)) {
    throw new Error(`${CONTROLLER_FILE} contains a literal "PAID" status -- the return/IPN handlers must never write a PAID status`);
  }
  if (!/PAYMENT_UNAVAILABLE/.test(content)) {
    throw new Error(`${CONTROLLER_FILE} must report a truthful PAYMENT_UNAVAILABLE status`);
  }
});

// ---------------------------------------------------------------------
// 5. Listener must reject arbitrary hosts/paths -- exact allowlist only.
// ---------------------------------------------------------------------
check("the IPN listener enforces an exact host allowlist (no wildcard/prefix/suffix matching)", () => {
  if (!exists(CONTROLLER_FILE)) throw new Error(`${CONTROLLER_FILE} does not exist`);
  const content = read(CONTROLLER_FILE);
  if (!/allowedHosts\.includes\(parsed\.hostname\.toLowerCase\(\)\)/.test(content)) {
    throw new Error(`${CONTROLLER_FILE} does not perform an exact hostname allowlist check`);
  }
  if (/\.startsWith\(|\.endsWith\(|\.includes\(rawUrl|new RegExp\(/.test(content)) {
    throw new Error(`${CONTROLLER_FILE} appears to use loose string matching for host/path validation instead of exact allowlist checks`);
  }
  if (!/protocol !== "https:"/.test(content)) {
    throw new Error(`${CONTROLLER_FILE} does not reject non-HTTPS URLs`);
  }
});

// ---------------------------------------------------------------------
// 6. The listener must never make an external request.
// ---------------------------------------------------------------------
check("neither handler makes an outbound network call", () => {
  if (!exists(CONTROLLER_FILE)) throw new Error(`${CONTROLLER_FILE} does not exist`);
  const content = read(CONTROLLER_FILE);
  const forbidden = [/\bfetch\(/, /http\.request/, /https\.request/, /axios/i, /XMLHttpRequest/];
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${CONTROLLER_FILE} appears to make an outbound network call (matched ${pattern})`);
    }
  }
});

// ---------------------------------------------------------------------
// 7. Frontend must never fabricate payment success.
// ---------------------------------------------------------------------
check("frontend /payment/return page never fabricates payment success", () => {
  if (!exists(FRONTEND_FILE)) throw new Error(`${FRONTEND_FILE} does not exist`);
  const content = read(FRONTEND_FILE);
  if (/URLSearchParams|useSearchParams|location\.search/.test(content)) {
    throw new Error(`${FRONTEND_FILE} reads URL query parameters -- payment state must only ever come from a server response`);
  }
  if (!/Online payment is temporarily unavailable\./.test(content)) {
    throw new Error(`${FRONTEND_FILE} is missing the exact required fail-closed message: "Online payment is temporarily unavailable."`);
  }
  if (/payment successful|payment complete|paid in full/i.test(content)) {
    throw new Error(`${FRONTEND_FILE} appears to contain a fabricated success message`);
  }
});

check("frontend route /payment/return is registered", () => {
  const content = read(APP_FILE);
  if (!/path="payment\/return"/.test(content)) {
    throw new Error(`${APP_FILE} does not register the /payment/return route`);
  }
});

// ---------------------------------------------------------------------
// 8. No hardcoded localhost or secret in the new files.
// ---------------------------------------------------------------------
check("no hardcoded localhost or secret-shaped value in the new APG files", () => {
  const files = [ROUTES_FILE, CONTROLLER_FILE, FRONTEND_FILE].filter(exists);
  for (const f of files) {
    const content = read(f);
    if (/127\.0\.0\.1|localhost:\d+/.test(content)) {
      throw new Error(`${f} contains a hardcoded localhost address`);
    }
    if (/r8_[A-Za-z0-9]{20,}/.test(content)) {
      throw new Error(`${f} appears to contain a real-shaped secret token`);
    }
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

console.log(`\n${checks.length - failed}/${checks.length} apg-url-contract checks passed`);
if (failed > 0) {
  console.error(`\n✖ verify:apg-url-contract FAILED (${failed} check(s))`);
  process.exit(1);
}
console.log("\n✔ verify:apg-url-contract PASSED");
