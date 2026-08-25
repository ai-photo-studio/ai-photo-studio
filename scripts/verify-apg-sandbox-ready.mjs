import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const checks = [];
const pass = (name, condition) => {
  checks.push({ name, ok: Boolean(condition) });
};

const envSource = read("apps/api/src/config/env.ts");
const checkoutSource = read("apps/api/src/services/customer-checkout.service.ts");
const controllerSource = read("apps/api/src/controllers/bank-alfalah-apg.controller.ts");
const appSource = read("apps/web/src/App.tsx");
const schemaSource = read("apps/api/prisma/schema.prisma");

pass("MPGS defaults disabled", /BANK_ALFALAH_MPGS_ENABLED:\s*z\.string\(\)\.optional\(\)\.default\("false"\)/.test(envSource));
pass("APG defaults to none and disabled", /BANK_ALFALAH_PROVIDER:\s*z\.enum\(\["none", "mpgs", "apg"\]\)\.default\("none"\)/.test(envSource) && /BANK_ALFALAH_APG_ENABLED:\s*z\.string\(\)\.optional\(\)\.default\("false"\)/.test(envSource));
pass("APG production guard exists", /apgEnabled && cfg\.NODE_ENV === "production"/.test(envSource));
pass("customer checkout selects APG explicitly", /bankAlfalahProvider === "apg" && this\.config\.bankAlfalahApg\.enabled/.test(checkoutSource));
pass("APG verification is server-owned", /verifyAndApplyOrderStatus/.test(checkoutSource) && /applyVerifiedPaymentEvidence/.test(checkoutSource));
pass("one PaymentAttempt per FixedOrder", /fixedOrderId\s+String\s+@unique/.test(schemaSource));
pass("browser Return does not mutate payment", !/applyVerifiedPaymentEvidence|fetch\(|http\.request|https\.request/.test(controllerSource));
pass("IPN callback validation is HTTPS and exact-host based", /parsed\.protocol !== "https:"/.test(controllerSource) && /allowedHosts\.includes\(parsed\.hostname\.toLowerCase\(\)\)/.test(controllerSource));
pass("retired Review component is not routed", /path="orders\/:orderNo\/review" element=\{<Navigate to="\.\.\/payment" replace \/>\}/.test(appSource));
pass("APG secret values are not tracked", (() => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const secretAssignment = /BANK_ALFALAH_APG_(?:MERCHANT_ID|STORE_ID|MERCHANT_HASH|USERNAME|PASSWORD|AES_KEY|AES_IV)\s*[:=]\s*["'`](?!REDACTED|placeholder|test-|0123456789abcdef|fedcba9876543210)[^"'`]+["'`]/i;
  return !tracked.some((file) => !file.includes(".test.") && secretAssignment.test(read(file)));
})());

for (const check of checks) console.log(`${check.ok ? "✔" : "✘"} ${check.name}`);
if (checks.some((check) => !check.ok)) {
  console.error("APG sandbox readiness failed closed. No Bank request was made.");
  process.exitCode = 1;
} else {
  console.log(`APG sandbox structural readiness passed (${checks.length}/${checks.length})`);
}
