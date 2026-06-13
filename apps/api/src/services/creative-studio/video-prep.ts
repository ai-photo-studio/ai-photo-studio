import type { CreativeType, CreativeSceneType, VideoTemplate } from "./creative-types";

export type VideoPrepInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  template?: VideoTemplate;
};

export type VideoPrepOutput = {
  requestId: string;
  videoBase64: string;
  contentType: string;
  fileName: string;
  durationMs: number;
};

export class VideoPrepService {
  async prepare(input: VideoPrepInput): Promise<VideoPrepOutput> {
    const encoded = Buffer.from(input.body).toString("base64");
    return {
      requestId: "video-prep-architecture-placeholder",
      videoBase64: encoded,
      contentType: input.contentType || "video/mp4",
      fileName: input.fileName || "video.mp4",
      durationMs: 0
    };
  }
}