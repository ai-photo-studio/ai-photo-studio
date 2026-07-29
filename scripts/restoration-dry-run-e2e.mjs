import fs from "node:fs/promises";
import path from "node:path";

const API_BASE_URL = process.env.API_BASE_URL || process.env.TEST_API_BASE_URL || "";
const IMAGE_PATH = process.argv[2] || path.join("old images", "2.jpeg");
const TITLE = process.argv[3] || "Dry-run restoration E2E";

if (!API_BASE_URL) {
  throw new Error("API_BASE_URL or TEST_API_BASE_URL is required");
}

const normalizedBase = API_BASE_URL.replace(/\/$/, "");
if (/thannow\.com/i.test(normalizedBase)) {
  throw new Error("Refusing to target a production thannow.com URL in dry-run E2E");
}

async function api(pathname, init = {}, guestToken) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (guestToken) {
    headers.set("x-guest-ownership-token", guestToken);
  }
  const response = await fetch(`${normalizedBase}${pathname}`, { ...init, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${payload?.message || text || "request failed"}`);
  }
  return payload?.data ?? payload;
}

function assertTestPrefix(key, label) {
  if (typeof key !== "string" || !key.startsWith("test/")) {
    throw new Error(`${label} must use test/ prefix, got: ${key || "(missing)"}`);
  }
}

async function main() {
  const image = await fs.readFile(IMAGE_PATH);
  const order = await api("/api/restorations", {
    method: "POST",
    body: JSON.stringify({ title: TITLE }),
  });

  if (!order?.guestOwnershipToken) {
    throw new Error("guestOwnershipToken missing from order creation response");
  }

  const item = await api(`/api/restorations/${order.id}/items`, {
    method: "POST",
    body: JSON.stringify({
      fileName: path.basename(IMAGE_PATH),
      contentType: "image/jpeg",
      bodyBase64: image.toString("base64"),
    }),
  }, order.guestOwnershipToken);

  await api(`/api/restorations/${order.id}/items/${item.item.id}/process`, {
    method: "POST",
    body: "{}",
  }, order.guestOwnershipToken);

  let current = null;
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    current = await api(`/api/restorations/${order.id}`, {}, order.guestOwnershipToken);
    const currentItem = current?.items?.[0];
    if (currentItem && ["COMPLETED", "FAILED"].includes(currentItem.status)) {
      if (currentItem.status !== "COMPLETED") {
        throw new Error(currentItem.errorMessage || "Dry-run order failed");
      }
      break;
    }
  }

  const currentItem = current?.items?.[0];
  if (!currentItem || currentItem.status !== "COMPLETED") {
    throw new Error("Timed out waiting for COMPLETED");
  }

  if (currentItem.providerUsed && !String(currentItem.providerUsed).startsWith("dry-run")) {
    throw new Error(`Expected dry-run provider, got ${currentItem.providerUsed}`);
  }

  if (!currentItem.metadata?.dryRun) {
    throw new Error("Dry-run metadata missing");
  }

  const outputs = currentItem.metadata?.restorationOutputs;
  if (!outputs?.master?.key) {
    throw new Error("Master output key missing");
  }
  assertTestPrefix(outputs.master.key, "Master output key");
  assertTestPrefix(currentItem.finalStorageKey, "finalStorageKey");

  if (!outputs.variants?.["2hd"]?.key || !outputs.variants?.["4hd"]?.key) {
    throw new Error("Missing 2HD/4HD output keys");
  }
  assertTestPrefix(outputs.variants["2hd"].key, "2HD output key");
  assertTestPrefix(outputs.variants["4hd"].key, "4HD output key");

  console.log(JSON.stringify({
    testServiceUrl: normalizedBase,
    workflowRun: process.env.GITHUB_RUN_ID || null,
    runtimeSha: process.env.RUNTIME_SHA || null,
    orderId: order.id,
    itemId: item.item.id,
    provider: currentItem.providerUsed,
    status: currentItem.status,
    finalStorageKey: currentItem.finalStorageKey,
    previewStorageKey: currentItem.previewStorageKey,
    downloadUrl: currentItem.downloadUrl || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
