import type { ProductWorkflowMode } from "../providers/provider.interface";

const PRODUCT_MODE_BY_PACKAGE: Record<string, ProductWorkflowMode> = {
  FREE_PREVIEW: "WHITE_BACKGROUND",
  BASIC_PACK: "WHITE_BACKGROUND",
  SELLER_READY: "SHADOW_ENHANCEMENT",
  PREMIUM_LAUNCH: "PRODUCT_STUDIO"
};

export const resolveProductWorkflowMode = (packageCode: string): ProductWorkflowMode => {
  const normalized = packageCode.trim().toUpperCase();
  return PRODUCT_MODE_BY_PACKAGE[normalized] || "PRODUCT_STUDIO";
};
