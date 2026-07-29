import fs from "node:fs/promises";

const API_BASE_URL = process.env.API_BASE_URL || "https://api.thannow.com";
const IMAGE_PATH = process.argv[2];
const TITLE = process.argv[3] || "Guest restoration E2E";

if (!IMAGE_PATH) {
  throw new Error("Usage: node scripts/guest-restoration-e2e.mjs <imagePath> [title]");
}

async function api(path, init = {}, guestToken) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (guestToken) {
    headers.set("x-guest-ownership-token", guestToken);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || text || `HTTP ${response.status}`;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return payload?.data ?? payload;
}

async function main() {
  const bytes = await fs.readFile(IMAGE_PATH);
  const bodyBase64 = bytes.toString("base64");

  const order = await api("/api/restorations", {
    method: "POST",
    body: JSON.stringify({ title: TITLE }),
  });

  if (!order.guestOwnershipToken) {
    throw new Error("guestOwnershipToken missing from order creation response");
  }

  const createResult = {
    status: 201,
    orderId: order.id,
    guestOwnershipTokenPresent: true,
  };

  const item = await api(`/api/restorations/${order.id}/items`, {
    method: "POST",
    body: JSON.stringify({
      fileName: IMAGE_PATH.split(/[\\/]/).pop() || "image.jpg",
      contentType: "image/jpeg",
      bodyBase64,
    }),
  }, order.guestOwnershipToken);

  const uploadResult = {
    status: 201,
    itemId: item.item.id,
  };

  await api(`/api/restorations/${order.id}/items/${item.item.id}/process`, {
    method: "POST",
    body: "{}",
  }, order.guestOwnershipToken);

  let terminal = null;
  for (let i = 0; i < 48; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const current = await api(`/api/restorations/${order.id}`, {}, order.guestOwnershipToken);
    const currentItem = current.items[0];
    if (["COMPLETED", "FAILED"].includes(currentItem.status)) {
      terminal = { order: current, item: currentItem };
      break;
    }
  }

  if (!terminal) {
    throw new Error("Timed out waiting for terminal state");
  }

  if (terminal.item.status !== "COMPLETED") {
    throw new Error(`Unexpected terminal status: ${terminal.item.status} (${terminal.item.errorMessage || "no error"})`);
  }

  const processResult = {
    status: 200,
    finalOrderStatus: terminal.order.status,
    finalItemStatus: terminal.item.status,
  };

  console.log(JSON.stringify({ createResult, uploadResult, processResult, finalItem: terminal.item }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
