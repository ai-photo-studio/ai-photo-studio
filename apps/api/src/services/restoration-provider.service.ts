import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { ServiceHealth } from "./service-health.types";
import { runRunPodRequest } from "../providers/runpod.transport";

export type RestorationServiceInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  maskBase64?: string;
  scale?: number;
  denoise?: number;
  fidelity?: number;
};

export type RestorationServiceOutput = {
  body: Buffer;
  contentType: string;
  fileName: string;
};

const isRunPodEndpointId = (url: string): boolean => {
  return url.length < 30 && !url.includes("://") && !url.includes(".");
};

const postImage = async (
  baseUrl: string,
  endpoint: string,
  input: RestorationServiceInput
): Promise<RestorationServiceOutput> => {
  if (!baseUrl) {
    throw new AppError(`${endpoint} service is not configured`, 503, `${endpoint.toUpperCase().replace(/-/g, "_")}_UNAVAILABLE`);
  }

  // Route to RunPod if baseUrl is an endpoint ID
  if (isRunPodEndpointId(baseUrl)) {
    return runViaRunPod(baseUrl, endpoint, input);
  }

  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${endpoint}`);
  if (typeof input.scale === "number") url.searchParams.set("scale", String(input.scale));
  if (typeof input.denoise === "number") url.searchParams.set("denoise", String(input.denoise));
  if (typeof input.fidelity === "number") url.searchParams.set("fidelity", String(input.fidelity));

  const headers: Record<string, string> = {
    "Content-Type": input.contentType || "application/octet-stream",
    "X-File-Name": input.fileName || "upload.png"
  };
  if (input.maskBase64) headers["X-Mask-Base64"] = input.maskBase64;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: input.body as unknown as BodyInit
  });

  if (!response.ok) {
    const body = await response.text();
    logger.warn(`${endpoint} request failed`, { status: response.status });
    throw new AppError(`${endpoint} failed: ${body.slice(0, 200)}`, 502, `${endpoint.toUpperCase().replace(/-/g, "_")}_FAILED`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/png";
  const fileName = response.headers.get("x-file-name") || input.fileName || "output.png";
  return { body: Buffer.from(arrayBuffer), contentType, fileName };
};

async function runViaRunPod(
  endpointId: string,
  endpoint: string,
  input: RestorationServiceInput
): Promise<RestorationServiceOutput> {
  const apiKey = process.env.RUNPOD_API_KEY || "";
  if (!apiKey) {
    throw new AppError("RunPod API key not configured", 503, "RUNPOD_API_KEY_MISSING");
  }
  const base64Image = input.body.toString("base64");
  const runpodInput: Record<string, unknown> = {
    image: `data:${input.contentType || "image/png"};base64,${base64Image}`,
    content_type: input.contentType || "image/png",
    file_name: input.fileName || "image.png",
  };
  // Add typed params for the RunPod handler
  if (input.fidelity !== undefined) runpodInput.fidelity = input.fidelity;
  if (input.denoise !== undefined) runpodInput.denoise = input.denoise;
  if (input.scale !== undefined) runpodInput.scale = input.scale;
  if (input.maskBase64) runpodInput.mask = input.maskBase64;

  const result = await runRunPodRequest(apiKey, endpointId, runpodInput);
  const outputB64 = result.image as string;
  return {
    body: Buffer.from(outputB64, "base64"),
    contentType: (result.media_type as string) || "image/png",
    fileName: (result.filename as string) || input.fileName || "output.png",
  };
}

const checkHealth = async (baseUrl: string, serviceName: string): Promise<ServiceHealth> => {
  if (!baseUrl) {
    return { healthy: false, status: "unconfigured", message: `${serviceName} URL is not configured`, checkedAt: new Date().toISOString() };
  }
  try {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/health`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      const body = await response.text();
      return { healthy: false, status: "error", endpoint, statusCode: response.status, message: body.slice(0, 200), checkedAt: new Date().toISOString() };
    }
    return { healthy: true, status: "ok", endpoint, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { healthy: false, status: "error", endpoint: `${baseUrl.replace(/\/$/, "")}/health`, message: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() };
  }
};

export class RestorationInpaintService {
  constructor(private readonly config: AppConfig) {}
  async inpaint(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return postImage(this.config.RESTORATION_LAMA_URL, "inpaint", input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_LAMA_URL, "LaMa");
  }
}

export class RestorationGfpganService {
  constructor(private readonly config: AppConfig) {}
  async enhance(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return postImage(this.config.RESTORATION_GFPGAN_URL, "enhance", input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_GFPGAN_URL, "GFPGAN");
  }
}

export class RestorationCodeformerService {
  constructor(private readonly config: AppConfig) {}
  async enhance(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return postImage(this.config.RESTORATION_CODEFORMER_URL, "enhance", input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_CODEFORMER_URL, "CodeFormer");
  }
}

export class RestorationDdcolorService {
  constructor(private readonly config: AppConfig) {}
  async colorize(input: RestorationServiceInput): Promise<RestorationServiceOutput> {
    return postImage(this.config.RESTORATION_DDCOLOR_URL, "colorize", input);
  }
  async health(): Promise<ServiceHealth> {
    return checkHealth(this.config.RESTORATION_DDCOLOR_URL, "DDColor");
  }
}
