import type { CreativeType, CreativeSceneType } from "./creative-types";
import type { FlatLayBackground } from "./flat-lay";
import type { LifestyleTemplate } from "./creative-types";

export const createMockImageBuffer = (): Buffer => {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);
};

export const createFlatLayFixture = (overrides?: Partial<{
  background: FlatLayBackground;
  template: string;
  orderId: string;
}>) => ({
  body: createMockImageBuffer(),
  contentType: "image/png",
  fileName: "test-flat-lay.png",
  template: (overrides?.template || "ecommerce-flatlay") as any,
  background: (overrides?.background || "white") as FlatLayBackground,
  orderId: overrides?.orderId
});

export const createLifestyleSceneFixture = (overrides?: Partial<{
  template: LifestyleTemplate;
  orderId: string;
}>) => ({
  body: createMockImageBuffer(),
  contentType: "image/png",
  fileName: "test-lifestyle.png",
  template: (overrides?.template || "home") as LifestyleTemplate,
  orderId: overrides?.orderId
});

export const createCreativeStudioJobFixture = (overrides?: Partial<{
  creativeType: CreativeType;
  sceneType: CreativeSceneType;
  generationStatus: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  providerUsed: string;
  durationMs: number;
}>) => ({
  id: `csjob_${Date.now()}`,
  creativeType: (overrides?.creativeType || "FLAT_LAY") as CreativeType,
  sceneType: (overrides?.sceneType || "TABLETOP") as CreativeSceneType,
  generationStatus: overrides?.generationStatus || "COMPLETED",
  providerUsed: overrides?.providerUsed || "flat-lay-mock",
  durationMs: overrides?.durationMs,
  createdAt: new Date().toISOString()
});