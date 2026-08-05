/**
 * R9.2-MPGS-ACTUAL-APP-E2E dry-run harness component.
 *
 * A local, in-process stand-in for the Bank Alfalah MPGS sandbox gateway.
 * DEV/TEST-ONLY. Never contacts any real network. Never contains, reads, or
 * requires any real credential. This is the "local stub MPGS server"
 * referenced by the dry-run harness -- it exists so the actual application
 * (real Postgres + real API + real web app + real browser) can be exercised
 * end to end, all the way through one real click of "Pay securely", without
 * making any request to the real bank sandbox.
 *
 * Responds to the exact corrected v100 contract shape confirmed against the
 * bank's own live documentation:
 *   POST /api/rest/version/:v/merchant/:merchantId/session
 *   GET  /api/rest/version/:v/merchant/:merchantId/order/:orderId
 *
 * Behavior is controlled by the STUB_MODE env var:
 *   success (default) -- 200 with {session:{id}, successIndicator}
 *   400 -- INVALID_REQUEST business-validation error (order.id shape)
 *   401 -- Basic-Auth-rejection shape
 *   404 -- structural not-found shape (matches historical P4C evidence)
 *
 * Every request is appended (one JSON line each) to STUB_LOG_FILE so the
 * harness/test can assert on exactly what the real gateway adapter sent --
 * including proving the Basic Auth header's username prefix without ever
 * treating any value here as a secret (there are no real credentials in a
 * dry run; the "password" is a synthetic dry-run-only string).
 */
import { createServer, type IncomingMessage } from "node:http";
import { appendFileSync } from "node:fs";

const PORT = Number(process.env.STUB_PORT || 4600);
let currentMode = process.env.STUB_MODE || "success";
const LOG_FILE = process.env.STUB_LOG_FILE || "";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function log(entry: Record<string, unknown>): void {
  if (!LOG_FILE) return;
  appendFileSync(LOG_FILE, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, "utf8");
}

const server = createServer(async (req, res) => {
  const url = req.url || "";
  const method = req.method || "";
  const auth = req.headers.authorization || "";
  // Never log the raw Authorization value -- only whether it is present and
  // the decoded username's shape (never the password half).
  let authUsernamePrefix = "none";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      authUsernamePrefix = decoded.split(":")[0] || "unknown";
    } catch {
      authUsernamePrefix = "unparseable";
    }
  }

  const body = method === "POST" || method === "PUT" ? await readBody(req) : "";
  let parsedBody: unknown = null;
  try {
    parsedBody = body ? JSON.parse(body) : null;
  } catch {
    parsedBody = { __unparsed: true };
  }

  // Dry-run-only control endpoint (never present in the real gateway, never
  // reachable from anywhere but this local harness): lets the test switch
  // scenarios (success/400/401/404) without restarting the API/web stack.
  if (method === "POST" && url === "/__control/set-mode") {
    const requested = (parsedBody as { mode?: string } | null)?.mode;
    if (requested) currentMode = requested;
    res.statusCode = 200;
    res.end(JSON.stringify({ mode: currentMode }));
    return;
  }

  log({ method, url, authUsernamePrefix, mode: currentMode, body: parsedBody });

  res.setHeader("Content-Type", "application/json;charset=ISO-8859-1");

  const isSessionCreate = method === "POST" && /\/merchant\/[^/]+\/session$/.test(url);
  const isRetrieveOrder = method === "GET" && /\/merchant\/[^/]+\/order\/[^/]+$/.test(url);

  if (!isSessionCreate && !isRetrieveOrder) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { cause: "INVALID_REQUEST", explanation: "unknown stub route" }, result: "ERROR" }));
    return;
  }

  if (currentMode === "401") {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", "Basic realm=dryrun-stub");
    res.end(JSON.stringify({ error: { cause: "INVALID_REQUEST", explanation: "Invalid credentials" }, result: "ERROR" }));
    return;
  }
  if (currentMode === "404") {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { cause: "INVALID_REQUEST", explanation: "not found" }, result: "ERROR" }));
    return;
  }
  if (currentMode === "400") {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        error: { cause: "INVALID_REQUEST", explanation: "Value invalid.", field: "order.id", validationType: "INVALID" },
        result: "ERROR"
      })
    );
    return;
  }

  // success mode
  if (isSessionCreate) {
    res.statusCode = 200;
    res.end(JSON.stringify({ session: { id: `DRYRUN-SESSION-${Date.now()}` }, successIndicator: "dryrun-indicator", result: "SUCCESS" }));
    return;
  }
  // retrieveOrder success: report PENDING by default (a real order is never
  // marked PAID by this stub -- no dry run may fabricate a paid outcome).
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      id: url.split("/order/")[1],
      merchant: url.split("/merchant/")[1]?.split("/")[0],
      status: "PENDING",
      result: undefined,
      amount: 0,
      currency: "PKR",
      transaction: []
    })
  );
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[mpgs-local-stub-server] listening on http://127.0.0.1:${PORT} mode=${currentMode}`);
});
