export interface StructuralInpaintingRequest {
  original: Buffer; mask: Buffer; instruction: string; outputFormat: "png" | "jpeg" | "webp"; idempotencyKey: string;
}

/** Future-only boundary: structural repair may alter masked pixels only. It must not expose face, color, or upscale operations. */
export interface IStructuralInpaintingProvider {
  inpaint(request: StructuralInpaintingRequest): Promise<{ image: Buffer; contentType: string }>;
}
