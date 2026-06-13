import type { CreativeType, CreativeSceneType, FlatLayTemplate } from "./creative-types";

export type FlatLayInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: FlatLayTemplate;
};

export type FlatLayOutput = {
  requestId: string;
  imageBase64: string;
  contentType: string;
  fileName: string;
};

export class FlatLayService {
  async generate(input: FlatLayInput): Promise<FlatLayOutput> {
    const encoded = Buffer.from(input.body).toString("base64");
    return {
      requestId: "flat-lay-architecture-placeholder",
      imageBase64: encoded,
      contentType: input.contentType || "image/png",
      fileName: input.fileName || "flat-lay.png"
    };
  }
}