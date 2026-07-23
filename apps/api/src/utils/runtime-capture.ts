/**
 * OPS-106 Runtime Capture Module
 * Captures EVERYTHING that leaves the server: HTTP requests, responses, timings, artifacts.
 * All output is written to benchmark/runtime/YYYY-MM-DD_HH-MM-SS/
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "./logger";

export interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  multipartBoundary?: string;
  multipartFields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    size?: number;
    isFile: boolean;
    // For text fields, the value; for files, null (saved separately)
    value?: string;
  }>;
  uploadedFilename?: string;
  uploadedSize?: number;
  imageSha256?: string;
  model: string;
  prompt: string;
  promptHash: string;
}

export interface CapturedResponse {
  timestamp: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  requestId?: string;
  openaiProcessingMs?: string;
  openaiOrganization?: string;
  openaiProject?: string;
  openaiVersion?: string;
  cfRay?: string;
  processingTimeMs: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  responseSize?: number;
  returnedImageSize?: number;
  returnedImageContentType?: string;
  returnedImageSha256?: string;
}

export interface DashboardSnapshot {
  timestamp: string;
  source: string; // "manual" | "api"
  spend?: number;
  requestCount?: number;
  tokenCount?: number;
  imagesCount?: number;
  notes?: string;
}

export interface DashboardDelta {
  spendDelta?: number;
  tokenDelta?: number;
  requestDelta?: number;
  imagesDelta?: number;
  before: DashboardSnapshot;
  after: DashboardSnapshot;
  reconciled: boolean;
  discrepancies: string[];
}

/**
 * OPS-106 Runtime Capture Session
 * Creates a timestamped directory and captures everything into it.
 */
export class RuntimeCaptureSession {
  readonly sessionDir: string;
  readonly sessionId: string;
  private capturedRequest: CapturedRequest | null = null;
  private capturedResponse: CapturedResponse | null = null;
  private dashboardBefore: DashboardSnapshot | null = null;
  private dashboardAfter: DashboardSnapshot | null = null;
  private dashboardDelta: DashboardDelta | null = null;
  private imageBuffer: Buffer | null = null;

  constructor() {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    this.sessionId = ts;
    this.sessionDir = path.join(process.cwd(), "benchmark", "runtime", ts);
    fs.mkdirSync(this.sessionDir, { recursive: true });
    logger.info("OPS-106 Runtime capture session started", { sessionDir: this.sessionDir });
  }

  /** Capture the outgoing request before it's sent */
  captureRequest(params: {
    method: string;
    url: string;
    headers: Record<string, string>;
    formDataFields?: Array<{
      name: string;
      filename?: string;
      contentType?: string;
      value: string | Blob;
      isFile?: boolean;
    }>;
    imageBuffer?: Buffer;
    model: string;
    prompt: string;
  }): CapturedRequest {
    // Compute image SHA256 if available
    let imageSha256: string | undefined;
    if (params.imageBuffer) {
      imageSha256 = crypto.createHash("sha256").update(params.imageBuffer).digest("hex");
    }

    // Extract multipart boundary from Content-Type header if present
    const contentType = params.headers["content-type"] || params.headers["Content-Type"] || "";
    let multipartBoundary: string | undefined;
    if (contentType.includes("multipart/form-data") && contentType.includes("boundary=")) {
      multipartBoundary = contentType.split("boundary=")[1]?.trim();
    }

    // Build field summaries
    const multipartFields = (params.formDataFields || []).map((f) => {
      if (f.isFile) {
        const blob = f.value as Blob;
        return {
          name: f.name,
          filename: f.filename || "unknown",
          contentType: f.contentType || "application/octet-stream",
          size: blob.size,
          isFile: true,
        };
      }
      return {
        name: f.name,
        value: typeof f.value === "string" ? f.value : "[binary]",
        isFile: false,
      };
    });

    // Find the uploaded image field
    const imageField = multipartFields.find((f) => f.isFile);
    const uploadedFilename = imageField?.filename;
    const uploadedSize = imageField?.size;

    const req: CapturedRequest = {
      timestamp: new Date().toISOString(),
      method: params.method,
      url: params.url,
      headers: redactAuthHeaders(params.headers),
      multipartBoundary,
      multipartFields,
      uploadedFilename,
      uploadedSize,
      imageSha256,
      model: params.model,
      prompt: params.prompt,
      promptHash: crypto.createHash("sha256").update(params.prompt).digest("hex").slice(0, 16),
    };

    this.capturedRequest = req;
    this.saveJson("request.json", req);
    if (imageSha256) {
      fs.writeFileSync(path.join(this.sessionDir, "image_sha256.txt"), imageSha256 + "\n");
    }

    logger.info("OPS-106 Request captured", {
      method: req.method,
      url: req.url,
      model: req.model,
      imageSha256: imageSha256?.slice(0, 16),
    });

    return req;
  }

  /** Capture the response after it's received */
  captureResponse(params: {
    status: number;
    statusText: string;
    headers: Headers;
    processingTimeMs: number;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    responseSize?: number;
    returnedImage?: Buffer;
    returnedImageContentType?: string;
  }): CapturedResponse {
    const responseHeaders: Record<string, string> = {};
    params.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    let returnedImageSha256: string | undefined;
    let returnedImageSize: number | undefined;
    if (params.returnedImage) {
      returnedImageSha256 = crypto.createHash("sha256").update(params.returnedImage).digest("hex");
      returnedImageSize = params.returnedImage.length;
      // Save the returned image
      const ext = params.returnedImageContentType === "image/png" ? "png" : "jpg";
      fs.writeFileSync(path.join(this.sessionDir, `returned_image.${ext}`), params.returnedImage);
      this.imageBuffer = params.returnedImage;
    }

    const resp: CapturedResponse = {
      timestamp: new Date().toISOString(),
      status: params.status,
      statusText: params.statusText,
      headers: responseHeaders,
      requestId: responseHeaders["x-request-id"],
      openaiProcessingMs: responseHeaders["openai-processing-ms"],
      openaiOrganization: responseHeaders["openai-organization"],
      openaiProject: responseHeaders["openai-project"],
      openaiVersion: responseHeaders["openai-version"],
      cfRay: responseHeaders["cf-ray"],
      processingTimeMs: params.processingTimeMs,
      usage: params.usage,
      responseSize: params.responseSize,
      returnedImageSize,
      returnedImageContentType: params.returnedImageContentType,
      returnedImageSha256,
    };

    this.capturedResponse = resp;
    this.saveJson("response.json", resp);

    // Save headers separately
    this.saveJson("headers.json", responseHeaders);

    // Save usage separately
    if (params.usage) {
      this.saveJson("usage.json", params.usage);
    }

    logger.info("OPS-106 Response captured", {
      status: resp.status,
      requestId: resp.requestId,
      usage: params.usage,
      processingTimeMs: params.processingTimeMs,
    });

    return resp;
  }

  /** Capture dashboard before snapshot */
  captureDashboardBefore(snapshot: DashboardSnapshot): void {
    this.dashboardBefore = snapshot;
    this.saveJson("dashboard_before.json", snapshot);
    logger.info("OPS-106 Dashboard before captured", { source: snapshot.source });
  }

  /** Capture dashboard after snapshot and compute deltas */
  captureDashboardAfter(snapshot: DashboardSnapshot): DashboardDelta {
    this.dashboardAfter = snapshot;
    this.saveJson("dashboard_after.json", snapshot);

    if (!this.dashboardBefore) {
      const delta: DashboardDelta = {
        before: { timestamp: "", source: "none" },
        after: snapshot,
        reconciled: false,
        discrepancies: ["No before snapshot captured"],
      };
      this.dashboardDelta = delta;
      this.saveJson("dashboard_delta.json", delta);
      return delta;
    }

    const discrepancies: string[] = [];
    const delta: DashboardDelta = {
      before: this.dashboardBefore,
      after: snapshot,
      reconciled: true,
      discrepancies,
    };

    if (this.dashboardBefore.spend !== undefined && snapshot.spend !== undefined) {
      delta.spendDelta = +(snapshot.spend - this.dashboardBefore.spend).toFixed(6);
      if (delta.spendDelta < 0) {
        discrepancies.push(`Negative spend delta: ${delta.spendDelta}`);
        delta.reconciled = false;
      }
    }

    if (this.dashboardBefore.tokenCount !== undefined && snapshot.tokenCount !== undefined) {
      delta.tokenDelta = snapshot.tokenCount - this.dashboardBefore.tokenCount;
      if (delta.tokenDelta < 0) {
        discrepancies.push(`Negative token delta: ${delta.tokenDelta}`);
        delta.reconciled = false;
      }
    }

    if (this.dashboardBefore.requestCount !== undefined && snapshot.requestCount !== undefined) {
      delta.requestDelta = snapshot.requestCount - this.dashboardBefore.requestCount;
      if (delta.requestDelta < 0) {
        discrepancies.push(`Negative request delta: ${delta.requestDelta}`);
        delta.reconciled = false;
      }
    }

    if (this.dashboardBefore.imagesCount !== undefined && snapshot.imagesCount !== undefined) {
      delta.imagesDelta = snapshot.imagesCount - this.dashboardBefore.imagesCount;
      if (delta.imagesDelta < 0) {
        discrepancies.push(`Negative images delta: ${delta.imagesDelta}`);
        delta.reconciled = false;
      }
    }

    this.dashboardDelta = delta;
    this.saveJson("dashboard_delta.json", delta);

    // Save timing info
    this.saveJson("timing.json", {
      requestTimestamp: this.capturedRequest?.timestamp,
      responseTimestamp: this.capturedResponse?.timestamp,
      dashboardBeforeTimestamp: this.dashboardBefore?.timestamp,
      dashboardAfterTimestamp: snapshot.timestamp,
      processingTimeMs: this.capturedResponse?.processingTimeMs,
      openaiProcessingMs: this.capturedResponse?.openaiProcessingMs,
    });

    logger.info("OPS-106 Dashboard delta computed", {
      spendDelta: delta.spendDelta,
      tokenDelta: delta.tokenDelta,
      requestDelta: delta.requestDelta,
      imagesDelta: delta.imagesDelta,
      reconciled: delta.reconciled,
      discrepancies: discrepancies.length,
    });

    return delta;
  }

  /** Save usage vs dashboard reconciliation */
  reconcileUsage(apiUsage: CapturedResponse["usage"]): void {
    const reconciliation: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      api_usage: apiUsage,
      dashboard_delta: this.dashboardDelta
        ? {
            spendDelta: this.dashboardDelta.spendDelta,
            tokenDelta: this.dashboardDelta.tokenDelta,
            requestDelta: this.dashboardDelta.requestDelta,
            imagesDelta: this.dashboardDelta.imagesDelta,
          }
        : "not available",
      comparison: {
        api_total_tokens: apiUsage?.total_tokens || 0,
        dashboard_token_delta: this.dashboardDelta?.tokenDelta || 0,
        token_difference: (apiUsage?.total_tokens || 0) - (this.dashboardDelta?.tokenDelta || 0),
      },
    };
    this.saveJson("reconciliation.json", reconciliation);
  }

  /** Save manifest of all artifacts */
  finalize(): string {
    const manifest = {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      timestamp: new Date().toISOString(),
      artifacts: fs.readdirSync(this.sessionDir),
      summary: {
        request: this.capturedRequest
          ? {
              method: this.capturedRequest.method,
              url: this.capturedRequest.url,
              model: this.capturedRequest.model,
              imageSha256: this.capturedRequest.imageSha256?.slice(0, 16),
            }
          : null,
        response: this.capturedResponse
          ? {
              status: this.capturedResponse.status,
              requestId: this.capturedResponse.requestId,
              processingTimeMs: this.capturedResponse.processingTimeMs,
              usage: this.capturedResponse.usage,
            }
          : null,
        dashboardDelta: this.dashboardDelta
          ? {
              spendDelta: this.dashboardDelta.spendDelta,
              tokenDelta: this.dashboardDelta.tokenDelta,
              reconciled: this.dashboardDelta.reconciled,
            }
          : null,
      },
    };
    this.saveJson("manifest.json", manifest);

    logger.info("OPS-106 Runtime capture session finalized", {
      sessionDir: this.sessionDir,
      artifactCount: manifest.artifacts.length,
    });

    return JSON.stringify(manifest, null, 2);
  }

  getRequest(): CapturedRequest | null {
    return this.capturedRequest;
  }

  getResponse(): CapturedResponse | null {
    return this.capturedResponse;
  }

  getImageBuffer(): Buffer | null {
    return this.imageBuffer;
  }

  private saveJson(filename: string, data: unknown): void {
    fs.writeFileSync(
      path.join(this.sessionDir, filename),
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
  }
}

/** Redact Authorization headers for safe logging */
function redactAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization/i.test(key)) {
      redacted[key] = value.startsWith("Bearer ") ? "Bearer [REDACTED]" : "[REDACTED]";
    } else if (/api.?key/i.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Global capture session.
 * Set by the server at startup if CAPTURE_MODE=true.
 */
let globalSession: RuntimeCaptureSession | null = null;

export function setGlobalCaptureSession(session: RuntimeCaptureSession | null): void {
  globalSession = session;
}

export function getGlobalCaptureSession(): RuntimeCaptureSession | null {
  return globalSession;
}
