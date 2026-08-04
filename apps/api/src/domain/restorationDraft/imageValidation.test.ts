import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  MAX_DRAFT_UPLOAD_PIXELS,
  validateRestorationDraftImage
} from "./imageValidation";

async function expectRejected(name: string, fn: () => Promise<unknown>, expectedCode: string) {
  try {
    await fn();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== expectedCode) {
      throw new Error(`${name}: expected code ${expectedCode}, got ${code} (${(err as Error).message})`);
    }
    return;
  }
  throw new Error(`${name}: expected to throw`);
}

async function main() {
  // 4. Valid image metadata/hash is computed correctly for a real PNG.
  const pngBuffer = await sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } }
  })
    .png()
    .toBuffer();

  const validated = await validateRestorationDraftImage(pngBuffer);
  if (validated.mimeType !== "image/png") throw new Error(`expected image/png, got ${validated.mimeType}`);
  if (validated.width !== 40 || validated.height !== 20) {
    throw new Error(`expected 40x20, got ${validated.width}x${validated.height}`);
  }
  const expectedSha256 = createHash("sha256").update(pngBuffer).digest("hex");
  if (validated.sha256 !== expectedSha256) throw new Error("sha256 mismatch");

  // Empty upload is rejected.
  await expectRejected("empty body", () => validateRestorationDraftImage(Buffer.alloc(0)), "EMPTY_FILE");

  // 2. A fake image (renamed non-image bytes, e.g. a text file saved as
  // "photo.jpg") is rejected by magic-byte/decode verification, not by
  // trusting a client-declared extension (there is no extension parameter
  // here at all -- verification is purely byte-content based).
  const fakeImageBytes = Buffer.from("this is not an image, just text pretending to be one");
  await expectRejected("fake image bytes", () => validateRestorationDraftImage(fakeImageBytes), "UNSUPPORTED_IMAGE_TYPE");

  // A well-formed JPEG magic-byte prefix with garbage after it decodes to
  // nothing sensible and must still fail (proves we decode, not just sniff).
  const jpegMagicOnly = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("not a real jpeg body")]);
  await expectRejected("jpeg magic bytes but undecodable", () => validateRestorationDraftImage(jpegMagicOnly), "INVALID_IMAGE_BINARY");

  // 3a. Oversize (byte length) image is rejected.
  const oversizedButValidPng = await sharp({
    create: { width: 4000, height: 4000, channels: 3, background: { r: 1, g: 2, b: 3 } }
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  if (oversizedButValidPng.length <= 10 * 1024 * 1024) {
    // Pad with a comment-safe approach is not trivial for PNG; instead
    // directly assert the byte-size branch using a synthetic oversized
    // buffer built from real PNG bytes followed by padding recognized only
    // at the byte-length check (which runs before decode).
    const padded = Buffer.concat([oversizedButValidPng, Buffer.alloc(11 * 1024 * 1024)]);
    await expectRejected("oversize bytes", () => validateRestorationDraftImage(padded), "IMAGE_TOO_LARGE");
  } else {
    await expectRejected("oversize bytes", () => validateRestorationDraftImage(oversizedButValidPng), "IMAGE_TOO_LARGE");
  }

  // 3b. Over-pixel-count image is rejected even when comfortably under the
  // byte-size cap (a highly-compressible huge-dimension image).
  const hugeDimensionPixels = Math.ceil(Math.sqrt(MAX_DRAFT_UPLOAD_PIXELS)) + 500;
  const overPixelPng = await sharp({
    create: { width: hugeDimensionPixels, height: hugeDimensionPixels, channels: 3, background: { r: 0, g: 0, b: 0 } }
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (overPixelPng.length > 10 * 1024 * 1024) {
    console.log("skipping over-pixel-only assertion: fixture also exceeded the byte cap in this environment");
  } else {
    await expectRejected("over-pixel dimensions", () => validateRestorationDraftImage(overPixelPng), "IMAGE_TOO_LARGE");
  }

  console.log("restoration draft image validation tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
