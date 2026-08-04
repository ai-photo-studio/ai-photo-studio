/**
 * Provider-neutral pipeline contracts.
 *
 * R9.2 decoupling: these helpers describe provider-agnostic concepts (which
 * provider a request was routed to) and must never contain provider-specific
 * endpoint URLs, credentials, API shapes, routing values, or vendor names.
 *
 * Privacy: never pass an API key, image bytes, base64, a signed URL, or a raw
 * provider response to anything in this file.
 */
import { logger } from "../../utils/logger";

/** Emitted once per routed restoration request. `selection` is an opaque, non-secret label. */
export const logProviderSelection = (meta: { selection: string; itemId?: string; orderId?: string }): void => {
  logger.info("Restoration provider selection", meta);
};
