import type { CreativeType, CreativeSceneType, LifestyleTemplate } from "./creative-types";

export type LifestyleSceneInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: LifestyleTemplate;
};

export type LifestyleSceneOutput = {
  requestId: string;
  imageBase64: string;
  contentType: string;
  fileName: string;
};

export class LifestyleSceneService {
  async generate(input: LifestyleSceneInput): Promise<LifestyleSceneOutput> {
    const encoded = Buffer.from(input.body).toString("base64");
    return {
      requestId: "lifestyle-scene-architecture-placeholder",
      imageBase64: encoded,
      contentType: input.contentType || "image/png",
      fileName: input.fileName || "lifestyle-scene.png"
    };
  }
}