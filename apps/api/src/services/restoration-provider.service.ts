import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ServiceHealth } from "./service-health.types";

export type RestorationServiceInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  maskBase64?: string;
  scale?: number;
  denoise?: number;
  fidelity?: number;
  lamaDenoise?: number;
};

export type RestorationServiceOutput = {
  body: Buffer;
  contentType: string;
  fileName: string;
  creditsUsed?: number;
  processingStages?: string[];
};

const postImage = async (
  baseUrl: string,
  endpoint: string,
  input: RestorationServiceInput,
): Promise<RestorationServiceOutput> => {
  if (!baseUrl) {
    throw new AppError(`${endpoint} service is not configured`, 503, `${endpoint.toUpperCase().replace(/-/g, "_")}_UNAVAILABLE`);
  }

  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${endpoint}`);
  if (typeof input.scale === "number") url.searchParams.set("scale", String(input.scale));
  if (typeof input.denoise === "number") url.searchParams.set("denoise", String(input.denoise));
  if (typeof input.fidelity === "number") url.searchParams.set("fidelity", String(input.fidelity));
  if (typeof input.lamaDenoise === "number") url.searchParams.set("lama_denoise", String(input.lamaDenoise));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  const headers: Record<string, string> = {
    "Content-Type": input.contentType || "application/octet-stream",
    "X-File-Name": input.fileName || "upload.png",
  };
  if (input.maskBase64) headers["X-Mask-Base64"] = input.maskBase64;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: input.body as unknown as BodyInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn(`${endpoint} request failed`, { status: response.status });
      throw new AppError(`${endpoint} failed: ${body.slice(0, 200)}`, 502, `${endpoint.toUpperCase().replace(/-/g, "_")}_FAILED`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";
    const fileName = response.headers.get("x-file-name") || input.fileName || "output.png";
    const creditsUsed = response.headers.get("x-credits-used");
    const processingStages = response.headers.get("x-processing-stages");

    return {
      body: Buffer.from(arrayBuffer),
      contentType,
      fileName,
      creditsUsed: creditsUsed ? parseFloat(creditsUsed) : undefined,
      processingStages: processingStages ? processingStages.split(",") : undefined,
    };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new AppError(`${endpoint} request timed out after 120s`, 504, `${endpoint.toUpperCase().replace(/-/g, "_")}_TIMEOUT`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

const checkHealth = async (baseUrl: string, serviceName: string): Promise<ServiceHealth> => {
  if (!baseUrl) {
    return { healthy: false, status: "unconfigured", message: `${serviceName} URL is not configured`, checkedAt: new Date().toISOString() };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const endpoint = `${baseUrl.replace(/\/$/, "")}/health`;
    const response = await fetch(endpoint, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const body = await response.text();
      return { healthy: false, status: "error", endpoint, statusCode: response.status, message: body.slice(0, 200), checkedAt: new Date().toISOString() };
    }
    return { healthy: true, status: "ok", endpoint, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { healthy: false, status: "error", endpoint: `${baseUrl.replace(/\/$/, "")}/health`, message: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() };
  }
};

export class UnifiedRestorationService {
  constructor(private readonly config: AppConfig) {}

  async restore(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return postImage(this.config.RESTORATION_ENDPOINT_URL, "restore", input);
  }

  async analyze(input: RestorationServiceInput): Promise<{ success: boolean; analysis: Record<string, unknown> }> {
    if (!this.config.RESTORATION_ENDPOINT_URL) {
      throw new AppError("Restoration endpoint is not configured", 503, "RESTORATION_ENDPOINT_UNAVAILABLE");
    }

    const baseUrl = this.config.RESTORATION_ENDPOINT_URL.trim();

    // Skip if the URL is not a valid HTTP URL (e.g., RunPod endpoint ID)
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      throw new AppError("Restoration endpoint is not an HTTP URL — analysis requires an HTTP endpoint", 503, "RESTORATION_ENDPOINT_NOT_HTTP");
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/analyze`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const headers: Record<string, string> = {
      "Content-Type": input.contentType || "application/octet-stream",
      "X-File-Name": input.fileName || "upload.png",
    };

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: input.body as unknown as BodyInit,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new AppError(`Analysis failed: ${body.slice(0, 200)}`, 502, "RESTORATION_ANALYSIS_FAILED");
      }

      return response.json();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw new AppError("Analysis timed out after 30s", 504, "RESTORATION_ANALYSIS_TIMEOUT");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_ENDPOINT_URL, "Restoration");
  }
}

export class RestorationInpaintService {
  constructor(private readonly config: AppConfig) {}
  private get service(): UnifiedRestorationService {
    return new UnifiedRestorationService(this.config);
  }
  async inpaint(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return this.service.restore(input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_ENDPOINT_URL, "LaMa");
  }
}

export class RestorationGfpganService {
  constructor(private readonly config: AppConfig) {}
  private get service(): UnifiedRestorationService {
    return new UnifiedRestorationService(this.config);
  }
  async enhance(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return this.service.restore(input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_ENDPOINT_URL, "GFPGAN");
  }
}

export class RestorationCodeformerService {
  constructor(private readonly config: AppConfig) {}
  private get service(): UnifiedRestorationService {
    return new UnifiedRestorationService(this.config);
  }
  async enhance(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return this.service.restore(input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_ENDPOINT_URL, "CodeFormer");
  }
}

export class RestorationDdcolorService {
  constructor(private readonly config: AppConfig) {}
  private get service(): UnifiedRestorationService {
    return new UnifiedRestorationService(this.config);
  }
  async colorize(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return this.service.restore(input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_ENDPOINT_URL, "DDColor");
  }
}
