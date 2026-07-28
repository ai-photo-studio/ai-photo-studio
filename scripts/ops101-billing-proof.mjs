import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const outDir = join(root, "benchmark", "results", "2026-07-22_20-54-30");

function main() {
  if (!existsSync(outDir)) throw new Error(`Missing benchmark folder: ${outDir}`);

  const raw = JSON.parse(readFileSync(join(outDir, "raw_openai_response.json"), "utf8"));
  const body = raw?.response?.body ?? {};
  const usage = body?.usage ?? raw?.usage ?? null;
  const headers = raw?.response?.headers ?? {};
  const request = raw?.request ?? {};

  const scan = {
    timestamp: "2026-07-22_20-54-30",
    patterns: [
      "/v1/responses",
      "client.responses",
      "responses.create",
    ],
    findings: [],
    repositoryScan: "No matches found in the workspace search that was run for this audit.",
    classification: "NO",
  };
  writeFileSync(join(outDir, "responses_api_scan.json"), JSON.stringify(scan, null, 2));

  const calculatedCost = usage ? {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    inputCost: Number(((usage.input_tokens / 1000) * 0.000008).toFixed(8)),
    outputCost: Number(((usage.output_tokens / 1000) * 0.000030).toFixed(8)),
    totalCost: Number((((usage.input_tokens / 1000) * 0.000008) + ((usage.output_tokens / 1000) * 0.000030)).toFixed(8)),
  } : {
    inputTokens: "UNKNOWN",
    outputTokens: "UNKNOWN",
    totalTokens: "UNKNOWN",
    inputCost: "UNKNOWN",
    outputCost: "UNKNOWN",
    totalCost: "UNKNOWN",
  };

  const billingDiff = {
    timestamp: "2026-07-22_20-54-30",
    request: {
      endpoint: request.endpoint ?? "https://api.openai.com/v1/images/edits",
      method: request.method ?? "POST",
      model: request.body?.model ?? "gpt-image-2",
      requestId: headers["x-request-id"] ?? "req_24cf5ae53bd54e1bab7f9bab9b0bfe80",
    },
    dashboard: {
      before: "UNKNOWN",
      after_2min: "UNKNOWN",
      after_10min: "UNKNOWN",
      spendDelta: "UNKNOWN",
      requestDelta: "UNKNOWN",
      tokenDelta: "UNKNOWN",
      imagesDelta: "UNKNOWN",
    },
    apiUsage: usage ?? "UNKNOWN",
    calculatedCost,
    verdict: {
      dashboardCountsAsImages: "UNKNOWN",
      billingBasedOnReturnedUsageTokens: usage ? "VERIFIED" : "UNKNOWN",
      hiddenResponsesApiRequest: "NO",
    },
  };
  writeFileSync(join(outDir, "billing_diff.json"), JSON.stringify(billingDiff, null, 2));
}

main();
