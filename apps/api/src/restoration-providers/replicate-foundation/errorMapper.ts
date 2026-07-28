import type { ReplicateErrorMapping } from "./types";

export const mapReplicateError = (error: unknown, statusCode?: number): ReplicateErrorMapping => {
  if (statusCode === 408) {
    return { category: "timeout", message: "Replicate request timed out", cause: error };
  }

  if (statusCode === 401 || statusCode === 403) {
    return { category: "non-retryable", message: "Replicate authentication failed", cause: error };
  }

  if (statusCode === 429) {
    return { category: "retryable", message: "Replicate rate limit exceeded", retryAfterMs: 5000, cause: error };
  }

  if (statusCode && statusCode >= 500) {
    return { category: "retryable", message: "Replicate service error", retryAfterMs: 2000, cause: error };
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/cancel/i.test(message)) {
    return { category: "cancelled", message, cause: error };
  }

  if (/timeout/i.test(message)) {
    return { category: "timeout", message, cause: error };
  }

  return { category: "verification_required", message, cause: error };
};

