import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const srcDir = join(root, "benchmark", "results", "2026-07-22_22-43-56");
const outDir = join(root, "benchmark", "results", "2026-07-22_22-50-16");

function main() {
  if (!existsSync(srcDir)) throw new Error(`Missing source evidence directory: ${srcDir}`);
  mkdirSync(outDir, { recursive: true });

  const raw = JSON.parse(readFileSync(join(srcDir, "raw_openai_response.json"), "utf8"));
  const req = raw.request;
  const resp = raw.response;
  const headers = resp.headers;
  const usage = raw.usage ?? resp.body?.usage ?? null;

  writeFileSync(join(outDir, "sdk_audit.json"), JSON.stringify({
    openaiPackagePresent: false,
    openaiPackageVersion: "UNKNOWN",
    openaiPackageLockMatch: false,
    transport: "native fetch() in apps/api/src/restoration-providers/providers/OpenAIProvider.ts",
    generatedRequest: {
      endpoint: req.endpoint,
      method: req.method,
      headers: {
        Authorization: "Bearer <REDACTED>",
        "Content-Type": "multipart/form-data",
      },
      body: req.body,
    },
    internalRedirectFound: false,
    evidence: [
      "No openai dependency appears in package.json/package-lock.json searches.",
      "OpenAIProvider uses direct fetch() to https://api.openai.com/v1/images/edits.",
    ],
  }, null, 2));

  writeFileSync(join(outDir, "raw_http_request.txt"), [
    `${req.method} ${req.endpoint}`,
    `Authorization: Bearer <REDACTED>`,
    `Content-Type: multipart/form-data`,
    ``,
    JSON.stringify(req.body, null, 2),
  ].join("\n"));

  writeFileSync(join(outDir, "raw_headers.txt"), JSON.stringify(headers, null, 2));
  writeFileSync(join(outDir, "raw_http_response.txt"), JSON.stringify({
    statusCode: resp.statusCode,
    statusText: resp.statusText,
    elapsedMs: resp.elapsedMs,
    usage,
    bodySummary: {
      created: resp.body.created,
      outputFormat: resp.body.output_format,
      quality: resp.body.quality,
      size: resp.body.size,
      imageCount: resp.body.data?.length ?? 0,
    },
    note: "Full response body is preserved in raw_openai_response.json; this text file captures the response evidence summary.",
  }, null, 2));

  writeFileSync(join(outDir, "curl_request.txt"), [
    "NOT LIVE-EXECUTED IN THIS WORKSPACE TURN",
    "Derived request template from captured OpenAI evidence:",
    `${req.method} ${req.endpoint}`,
    JSON.stringify(req.body, null, 2),
  ].join("\n"));

  writeFileSync(join(outDir, "curl_response.txt"), JSON.stringify({
    status: "UNKNOWN",
    reason: "No live curl execution possible because no OpenAI API key is present in the workspace environment.",
  }, null, 2));

  writeFileSync(join(outDir, "project_verification.json"), JSON.stringify({
    openaiOrganizationId: headers["openai-organization"] ?? "UNKNOWN",
    openaiProjectId: headers["openai-project"] ?? "UNKNOWN",
    dashboardSelectedProject: "UNKNOWN",
    match: "UNKNOWN",
    reason: "Workspace cannot access the live dashboard selection state.",
  }, null, 2));

  writeFileSync(join(outDir, "billing_timeline.json"), JSON.stringify({
    before: {
      spend: "UNKNOWN",
      requests: "UNKNOWN",
      tokens: "UNKNOWN",
      imagesRequests: "UNKNOWN",
    },
    afterImmediately: {
      spend: "UNKNOWN",
      requests: "UNKNOWN",
      tokens: "UNKNOWN",
      imagesRequests: "UNKNOWN",
    },
    after2min: {
      spend: "UNKNOWN",
      requests: "UNKNOWN",
      tokens: "UNKNOWN",
      imagesRequests: "UNKNOWN",
    },
    after5min: {
      spend: "UNKNOWN",
      requests: "UNKNOWN",
      tokens: "UNKNOWN",
      imagesRequests: "UNKNOWN",
    },
    after10min: {
      spend: "UNKNOWN",
      requests: "UNKNOWN",
      tokens: "UNKNOWN",
      imagesRequests: "UNKNOWN",
    },
    after15min: {
      spend: "UNKNOWN",
      requests: "UNKNOWN",
      tokens: "UNKNOWN",
      imagesRequests: "UNKNOWN",
    },
    classification: "UNKNOWN",
  }, null, 2));

  writeFileSync(join(outDir, "openai_logs.json"), JSON.stringify({
    accessible: false,
    status: "UNKNOWN",
    reason: "OpenAI Logs UI/API evidence was not accessible from the workspace.",
    endpoint: req.endpoint,
    model: req.body.model,
    requestId: headers["x-request-id"],
    project: headers["openai-project"],
  }, null, 2));
}

main();
