import fs from "node:fs/promises";
import path from "node:path";

const API_BASE_URL = process.env.API_BASE_URL || "https://api.thannow.com";
const ADMIN_AUTH_TOKEN = process.env.ADMIN_AUTH_TOKEN || "";
const IMAGE_PATH = process.argv[2] || path.join("old images", "2.jpeg");

if (!API_BASE_URL) {
  throw new Error("API_BASE_URL is required");
}

if (!ADMIN_AUTH_TOKEN) {
  throw new Error("ADMIN_AUTH_TOKEN is required for the protected runtime diagnostic");
}

const normalizedBase = API_BASE_URL.replace(/\/$/, "");
if (/thannow\.com/i.test(normalizedBase) && normalizedBase !== "https://api.thannow.com") {
  throw new Error("Refusing to target a non-API thannow.com URL");
}

async function api(pathname, init = {}, guestToken) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (guestToken) {
    headers.set("x-guest-ownership-token", guestToken);
  }
  const response = await fetch(`${normalizedBase}${pathname}`, {
    ...init,
    headers
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.error || text || "request failed";
    const error = new Error(`HTTP ${response.status}: ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload?.data ?? payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertTestPrefix(key, label) {
  assert(typeof key === "string" && key.startsWith("test/"), `${label} must use test/ prefix, got: ${key || "(missing)"}`);
}

async function main() {
  const diagnostic = await api("/api/admin/runtime-diagnostic", {
    method: "GET",
    headers: {
      "x-admin-token": ADMIN_AUTH_TOKEN
    }
  });

  assert(diagnostic.provider === "replicate", `provider gate failed: ${diagnostic.provider}`);
  assert(diagnostic.dryRunEnabled === false, "dryRunEnabled gate failed");
  assert(diagnostic.providerIsMock === false, "providerIsMock gate failed");
  assert(diagnostic.paidTestsAllowed === true, "paidTestsAllowed gate failed");
  assert(diagnostic.replicateConfigured === true, "replicateConfigured gate failed");

  const image = await fs.readFile(IMAGE_PATH);
  const order = await api("/api/restorations", {
    method: "POST",
    body: JSON.stringify({ title: "Paid smoke restoration E2E" })
  });

  assert(order?.guestOwnershipToken, "guestOwnershipToken missing from order creation");
  const guestToken = order.guestOwnershipToken;

  const upload = await api(`/api/restorations/${order.id}/items`, {
    method: "POST",
    body: JSON.stringify({
      fileName: path.basename(IMAGE_PATH),
      contentType: "image/jpeg",
      bodyBase64: image.toString("base64")
    })
  }, guestToken);

  const itemId = upload?.item?.id || upload?.id;
  assert(itemId, "item id missing from upload response");

  const processResult = await api(`/api/restorations/${order.id}/items/${itemId}/process`, {
    method: "POST",
    body: "{}"
  }, guestToken);
  assert(processResult?.success !== false, "process request did not succeed");

  let finalOrder = null;
  let terminalItem = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    finalOrder = await api(`/api/restorations/${order.id}`, {}, guestToken);
    terminalItem = finalOrder?.items?.find?.((entry) => entry.id === itemId) || finalOrder?.items?.[0] || null;
    if (terminalItem && ["COMPLETED", "FAILED"].includes(terminalItem.status)) {
      break;
    }
  }

  assert(terminalItem, "No item returned while polling");
  assert(terminalItem.status === "COMPLETED", terminalItem.errorMessage || "Paid smoke order did not complete");

  assert(terminalItem.providerUsed && String(terminalItem.providerUsed).startsWith("replicate"), `Unexpected provider: ${terminalItem.providerUsed || "(missing)"}`);
  assert(Array.isArray(terminalItem.predictionIds) && terminalItem.predictionIds.length === 2, `Expected exactly 2 prediction IDs, got ${terminalItem.predictionIds?.length ?? 0}`);
  assert(terminalItem.retryCount === 0 || terminalItem.retryCount === undefined || terminalItem.retryCount === null, `Unexpected retryCount: ${terminalItem.retryCount}`);

  const outputs = terminalItem.metadata?.restorationOutputs;
  assert(outputs?.master?.key, "Master output key missing");
  assertTestPrefix(outputs.master.key, "Master output key");
  assertTestPrefix(terminalItem.finalStorageKey, "finalStorageKey");
  assert(outputs?.variants?.["2hd"]?.key, "2HD output key missing");
  assert(outputs?.variants?.["4hd"]?.key, "4HD output key missing");
  assertTestPrefix(outputs.variants["2hd"].key, "2HD output key");
  assertTestPrefix(outputs.variants["4hd"].key, "4HD output key");
  assert(terminalItem.previewStorageKey, "previewStorageKey missing");
  assertTestPrefix(terminalItem.previewStorageKey, "previewStorageKey");
  assert(finalOrder?.status === "COMPLETED" || finalOrder?.status === "PROCESSING", "Order status missing");

  const download = await api(`/api/restorations/${order.id}/items/${itemId}/download`, {
    method: "POST",
    body: "{}"
  }, guestToken);
  assert(download?.downloadUrl, "downloadUrl missing");
  const downloadResponse = await fetch(download.downloadUrl, { method: "GET" });
  assert([200, 206].includes(downloadResponse.status), `Download returned HTTP ${downloadResponse.status}`);

  console.log(JSON.stringify({
    testServiceUrl: normalizedBase,
    orderId: order.id,
    itemId,
    workflowRun: process.env.GITHUB_RUN_ID || null,
    runtimeSha: process.env.RUNTIME_SHA || null,
    provider: terminalItem.providerUsed,
    predictionIds: terminalItem.predictionIds,
    status: terminalItem.status,
    finalStorageKey: terminalItem.finalStorageKey,
    previewStorageKey: terminalItem.previewStorageKey,
    downloadStatus: downloadResponse.status
  }, null, 2));
}

main().catch((error) => {
  const status = error && typeof error === "object" && "status" in error ? error.status : null;
  const payload = error && typeof error === "object" && "payload" in error ? error.payload : null;
  if (status) {
    console.error(`HTTP ${status}: ${payload?.message || error.message}`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});
