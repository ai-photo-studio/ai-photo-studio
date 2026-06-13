import type { CreativeType, CreativeSceneType, VirtualModelTemplate } from "./creative-types";

export type VirtualModelInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: VirtualModelTemplate;
};

export type VirtualModelOutput = {
  requestId: string;
  imageBase64: string;
  contentType: string;
  fileName: string;
};

export class VirtualModelService {
  async generate(input: VirtualModelInput): Promise<VirtualModelOutput> {
    const encoded = Buffer.from(input.body).toString("base64");
    return {
      requestId: "virtual-model-architecture-placeholder",
      imageBase64: encoded,
      contentType: input.contentType || "image/png",
      fileName: input.fileName || "virtual-model.png"
    };
  }
}