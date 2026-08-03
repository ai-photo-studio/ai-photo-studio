import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

type Finding = { message: string };

const repoRoot = resolve(__dirname, "../../../../..");
const paymentServicePath = join(repoRoot, "apps/api/src/services/payment-attempt.service.ts");
const paymentRoutesPath = join(repoRoot, "apps/api/src/routes/payment-attempt.routes.ts");
const adapterPath = join(repoRoot, "apps/api/src/domain/payment/bankAlfalahAdapter.ts");
const offerProviderPath = join(repoRoot, "apps/api/src/domain/pricing/offerProvider.ts");
const fixedOrderServicePath = join(repoRoot, "apps/api/src/services/fixed-order.service.ts");
const readinessPath = join(repoRoot, "apps/api/src/domain/payment/paymentReadiness.ts");

const forbiddenModels = new Set([
  "PaymentEvent",
  "RestorationEntitlement",
  "RestorationMaster",
  "ReplicateExecution",
  "ImageVariant",
  "DigitalEntitlement",
  "PrintEntitlement",
  "FulfilmentOrder",
  "Shipment"
]);
const forbiddenDelegates = new Set([...forbiddenModels].map((name) => name[0].toLowerCase() + name.slice(1)));
const forbiddenImports = /(?:restoration|entitlement|sharp|replicate|runpod)/i;
const forbiddenRouteWords = /(?:callback|ipn|webhook)/i;
const networkClients = new Set(["fetch", "axios", "request", "got", "https", "http"]);

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function text(node: ts.Node, source: ts.SourceFile): string {
  return node.getText(source);
}

function propertyName(node: ts.PropertyAccessExpression): string {
  return node.name.text;
}

function validatePaymentAttemptSource(source: string, fileName: string): Finding[] {
  const findings: Finding[] = [];
  const sourceFile = parse(source, fileName);
  const importedNames = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (forbiddenImports.test(specifier)) findings.push({ message: `forbidden import: ${specifier}` });
    const clause = statement.importClause;
    if (!clause) continue;
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) importedNames.set(element.name.text, specifier);
    }
    if (clause.name) importedNames.set(clause.name.text, specifier);
  }

  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) && forbiddenDelegates.has(propertyName(node))) {
      findings.push({ message: `forbidden model access: ${propertyName(node)}` });
    }
    if (ts.isIdentifier(node) && forbiddenModels.has(node.text)) {
      findings.push({ message: `forbidden model identifier: ${node.text}` });
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && networkClients.has(node.expression.text)) {
      findings.push({ message: `network client call: ${node.expression.text}` });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const root = node.expression.expression;
      if (ts.isIdentifier(root) && networkClients.has(root.text)) {
        findings.push({ message: `network client call: ${text(node.expression, sourceFile)}` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const name of importedNames) {
    if (forbiddenModels.has(name[0])) findings.push({ message: `forbidden model import: ${name[0]}` });
  }
  return findings;
}

function validateRouteSource(source: string, fileName: string): Finding[] {
  const findings: Finding[] = [];
  const sourceFile = parse(source, fileName);
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const first = node.arguments[0];
      if (["get", "post", "put", "patch", "delete", "use"].includes(method) && first && ts.isStringLiteral(first)) {
        if (forbiddenRouteWords.test(first.text)) findings.push({ message: `forbidden payment route: ${first.text}` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

function requireMatch(source: string, expression: RegExp, description: string): Finding[] {
  return expression.test(source) ? [] : [{ message: description }];
}

function requireNoMatch(source: string, expression: RegExp, description: string): Finding[] {
  return expression.test(source) ? [{ message: description }] : [];
}

function assertClean(name: string, findings: Finding[]): void {
  if (findings.length) throw new Error(`${name}: ${findings.map((finding) => finding.message).join("; ")}`);
  console.log(`PASS ${name}`);
}

function assertRejected(name: string, findings: Finding[]): void {
  if (!findings.length) throw new Error(`${name}: synthetic violation was not rejected`);
  console.log(`PASS ${name}`);
}

function source(path: string): string {
  if (!existsSync(path)) throw new Error(`missing validated file: ${path}`);
  return readFileSync(path, "utf8");
}

function main(): void {
  const paymentService = source(paymentServicePath);
  const paymentRoutes = source(paymentRoutesPath);
  const adapter = source(adapterPath);
  const offers = source(offerProviderPath);
  const fixedOrder = source(fixedOrderServicePath);
  const readiness = source(readinessPath);

  assertClean("payment-attempt service boundary", validatePaymentAttemptSource(paymentService, paymentServicePath));
  assertClean("payment-attempt routes have no callback", validateRouteSource(paymentRoutes, paymentRoutesPath));
  assertClean(
    "Bank Alfalah adapter fails closed",
    [
      ...requireMatch(adapter, /return\s*\{\s*ready:\s*false\b/, "adapter does not return ready:false"),
      ...requireMatch(adapter, /throw\s+new\s+Error\s*\(/, "adapter does not reject checkout initialization"),
      ...requireNoMatch(adapter, /https?:\/\/|\bfetch\s*\(|\baxios\b|\bhttps?\.request\s*\(/, "adapter contains a real endpoint or network client")
    ]
  );
  assertClean(
    "fixture pricing remains blocked",
    [
      ...requireMatch(offers, /source:\s*"local_fixture"/, "fixture pricing source is not local_fixture"),
      ...requireMatch(offers, /market:\s*"PAKISTAN"[\s\S]*?currency:\s*"PKR"/, "fixture pricing is not PKR-only"),
      ...requireMatch(offers, /available:\s*false[\s\S]*?USD pricing has not been approved/, "approved USD fixture may exist"),
      ...requireNoMatch(offers, /market:\s*"INTERNATIONAL"[\s\S]*?source:\s*"local_fixture"/, "USD local fixture exists")
    ]
  );
  // R9.2-P1C-B: before the owner-approved PriceBook existed, this check
  // required the literal text "pricingApproved: false" -- correct only
  // because nothing could ever be approved yet. Now that a real approval
  // exists by design, the invariant this file actually needs to guarantee
  // is stronger: approval must be strictly *derived* from the one
  // legitimate source label, never a hardcoded blanket boolean in either
  // direction. This is a validator repair reflecting intended P1C-B
  // behavior, not a weakened guard -- see AI_code_audit_report_RI.md.
  assertClean(
    "fixed-order approval is derived from approved_pricebook source, never hardcoded",
    [
      ...requireMatch(
        fixedOrder,
        /isApproved\s*=\s*offer\.source\s*===\s*"approved_pricebook"/,
        "fixed-order service does not derive pricingApproved strictly from an approved_pricebook offer source"
      ),
      ...requireMatch(fixedOrder, /pricingApproved:\s*isApproved/, "fixed-order service does not write the derived isApproved value"),
      ...requireNoMatch(fixedOrder, /pricingApproved:\s*true\b/, "fixed-order service writes a hardcoded pricingApproved:true")
    ]
  );
  assertClean(
    "payment readiness rejects unapproved pricing",
    requireMatch(readiness, /!item\.pricingApproved/, "payment readiness does not reject unapproved pricing")
  );

  assertRejected("synthetic PaymentEvent create", validatePaymentAttemptSource("tx.paymentEvent.create({});", "synthetic.ts"));
  assertRejected("synthetic entitlement create", validatePaymentAttemptSource("tx.restorationEntitlement.create({});", "synthetic.ts"));
  assertRejected("synthetic callback route", validateRouteSource('router.post("/bank-alfalah/callback", handler);', "synthetic.ts"));
  assertRejected("synthetic network client", validatePaymentAttemptSource('fetch("https://payment-provider.example");', "synthetic.ts"));
}

main();
