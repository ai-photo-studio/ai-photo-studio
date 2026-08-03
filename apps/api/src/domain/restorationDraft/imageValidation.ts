// R9.2-P1A: free-upload image validation for RestorationDraft.
//
// Bytes are verified by decode (magic-byte detection + a real sharp decode
// of metadata), never by trusting the client-declared filename extension or
// Content-Type alone. This intentionally does not use Sharp for any
// transformation/re-encoding (the protected restoration Sharp variant
// pipeline is untouched) -- only read-only metadata decoding, the same use
// already established in `apps/api/src/utils/image-binary.ts`.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { AppError } from "../../utils/errors";
import { detectImageMime, type SupportedDownloadMime } from "../../utils/image-binary";

export const MAX_DRAFT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB, matches the existing legacy web-upload cap
export const MAX_DRAFT_UPLOAD_PIXELS = 30_000_000; // 30 MP conservative bound

// R9.2-P2R-UPLOAD-SECURITY-AUDIT-A: a client-supplied file name is untrusted
// text. It is only ever used to build a storage key (already charset-
// sanitized in StorageService), but it must additionally be bounded in
// length and free of NUL/control characters before it reaches any key,
// header, or log.
export const MAX_DRAFT_FILE_NAME_LENGTH = 255;

export function assertSafeUploadFileName(fileName: unknown): string {
  if (typeof fileName !== "string" || fileName.trim().length === 0) {
    throw new AppError("fileName is required", 400, "INVALID_REQUEST");
  }
  const value = fileName.trim();
  if (value.length > MAX_DRAFT_FILE_NAME_LENGTH) {
    throw new AppError(`fileName exceeds ${MAX_DRAFT_FILE_NAME_LENGTH} characters`, 400, "INVALID_FILE_NAME");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new AppError("fileName contains unsupported control characters", 400, "INVALID_FILE_NAME");
  }
  return value;
}

const BASE64_CANONICAL = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * R9.2-P2R-UPLOAD-SECURITY-AUDIT-A: `Buffer.from(x, "base64")` silently
 * ignores characters outside the base64 alphabet and tolerates missing
 * padding, so a payload that is NOT what the client encoded can decode to a
 * valid-looking image. The string shape is therefore validated (alphabet,
 * length multiple of 4, canonical padding, byte-exact re-encode round trip)
 * BEFORE any buffer is allocated from it.
 */
export function decodeDraftImageBase64(input: unknown): Buffer {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new AppError("bodyBase64 is required", 400, "INVALID_REQUEST");
  }
  const trimmed = input.trim();
  const payload = trimmed.includes(",") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;
  // Line breaks inside a base64 payload are legitimate (MIME chunking) and
  // are the only whitespace tolerated; everything else must be canonical.
  const compact = payload.replace(/[\r\n]/g, "");
  if (compact.length === 0 || compact.length % 4 !== 0 || !BASE64_CANONICAL.test(compact)) {
    throw new AppError("bodyBase64 is not valid base64", 400, "INVALID_BASE64");
  }
  const decoded = Buffer.from(compact, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== compact) {
    throw new AppError("bodyBase64 is not valid base64", 400, "INVALID_BASE64");
  }
  return decoded;
}

export interface ValidatedDraftImage {
  mimeType: SupportedDownloadMime;
  width: number;
  height: number;
  sha256: string;
}

const ORIENTATION_SWAPS_DIMENSIONS = new Set([5, 6, 7, 8]);

export async function validateRestorationDraftImage(body: Buffer): Promise<ValidatedDraftImage> {
  if (!body || body.length === 0) {
    throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
  }
  if (body.length > MAX_DRAFT_UPLOAD_BYTES) {
    throw new AppError(`Image exceeds size limit of ${MAX_DRAFT_UPLOAD_BYTES / (1024 * 1024)} MB`, 413, "IMAGE_TOO_LARGE");
  }

  // Verify by decode, not by the client-declared extension/Content-Type: a
  // renamed non-image file (e.g. a .exe saved as .jpg) fails this magic-byte
  // check regardless of what the client claimed.
  const mimeType = detectImageMime(body);
  if (!mimeType) {
    throw new AppError("Unsupported or unrecognized image format. Use JPEG, PNG, or WebP.", 415, "UNSUPPORTED_IMAGE_TYPE");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(body).metadata();
  } catch {
    throw new AppError("Image could not be decoded", 400, "INVALID_IMAGE_BINARY");
  }

  let { width, height } = metadata;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    throw new AppError("Image could not be decoded", 400, "INVALID_IMAGE_BINARY");
  }

  // Orientation metadata normalization: EXIF orientations 5-8 mean the
  // encoded pixel grid is rotated 90/270 degrees relative to how the image
  // is displayed. Report the display-correct (visual) width/height, not the
  // raw encoded ones, without re-encoding the stored bytes.
  if (metadata.orientation && ORIENTATION_SWAPS_DIMENSIONS.has(metadata.orientation)) {
    [width, height] = [height, width];
  }

  // R9.2-P2R-UPLOAD-SECURITY-AUDIT-A (defense in depth): for a multi-page /
  // animated container, `width`/`height` describe ONE page, so the pixel
  // budget must be charged for every page rather than only the first frame.
  // Single-page images (`pages` absent or 1) are unaffected.
  const pages = typeof metadata.pages === "number" && Number.isFinite(metadata.pages) && metadata.pages > 1 ? metadata.pages : 1;

  if (width * height * pages > MAX_DRAFT_UPLOAD_PIXELS) {
    throw new AppError(`Image exceeds maximum pixel dimensions of ${MAX_DRAFT_UPLOAD_PIXELS.toLocaleString()} px`, 413, "IMAGE_TOO_LARGE");
  }

  const sha256 = createHash("sha256").update(body).digest("hex");

  return { mimeType, width, height, sha256 };
}
