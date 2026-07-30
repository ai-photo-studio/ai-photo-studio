import sharp from "sharp";
import { AppError } from "./errors";

export type SupportedDownloadMime = "image/jpeg" | "image/png" | "image/webp";

export const detectImageMime = (body: Buffer): SupportedDownloadMime | null => {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
};

export const validateDownloadImage = async (body: Buffer) => {
  if (!body.length) throw new AppError("Stored image is empty", 502, "INVALID_IMAGE_BINARY");
  const mimeType = detectImageMime(body);
  if (!mimeType) throw new AppError("Stored file is not a supported image", 502, "INVALID_IMAGE_BINARY");
  try {
    const metadata = await sharp(body).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing dimensions");
    return { mimeType, width: metadata.width, height: metadata.height };
  } catch {
    throw new AppError("Stored image cannot be decoded", 502, "INVALID_IMAGE_BINARY");
  }
};

export const extensionForMime = (mimeType: SupportedDownloadMime) => mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
