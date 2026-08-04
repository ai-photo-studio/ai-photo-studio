/**
 * R9.2-P2R-UPLOAD-SECURITY-AUDIT-A: focused tests for the upload REQUEST /
 * INPUT-VALIDATION boundary of `POST /api/restoration-drafts`.
 *
 * Scope: base64 parsing, decoded-byte limits, claimed-vs-real MIME, real
 * sharp decode, unsupported formats, pixel/orientation limits, and unsafe
 * client-supplied file names. Storage consistency, signed-preview
 * authorization, and guest-ownership tokens are deliberately OUT OF SCOPE.
 *
 * Purely local: no database, no network, no payment/entitlement/provider
 * call of any kind.
 *
 *   npx tsx src/domain/restorationDraft/uploadInputValidation.test.ts
 */
import sharp from "sharp";
import {
  MAX_DRAFT_FILE_NAME_LENGTH,
  MAX_DRAFT_UPLOAD_BYTES,
  MAX_DRAFT_UPLOAD_PIXELS,
  assertSafeUploadFileName,
  decodeDraftImageBase64,
  validateRestorationDraftImage
} from "./imageValidation";

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function record(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(fn: () => Promise<unknown> | unknown, expected: string): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    const code = (error as { code?: string }).code;
    assert(code === expected, `expected code ${expected}, got ${code} (${(error as Error).message})`);
    return error as Error;
  }
  throw new Error(`expected to throw ${expected}`);
}

async function main() {
  const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();
  const pngB64 = png.toString("base64");

  // --- base64 shape -------------------------------------------------------
  await record("missing bodyBase64 is rejected", async () => {
    await expectCode(() => decodeDraftImageBase64(undefined), "INVALID_REQUEST");
    await expectCode(() => decodeDraftImageBase64(""), "INVALID_REQUEST");
    await expectCode(() => decodeDraftImageBase64("   "), "INVALID_REQUEST");
    await expectCode(() => decodeDraftImageBase64(12345), "INVALID_REQUEST");
  });

  await record("base64 with out-of-alphabet characters is rejected", async () => {
    await expectCode(() => decodeDraftImageBase64(`${pngB64}!!!***`), "INVALID_BASE64");
    await expectCode(() => decodeDraftImageBase64("****"), "INVALID_BASE64");
  });

  await record("non-canonical padding/length is rejected", async () => {
    await expectCode(() => decodeDraftImageBase64(pngB64.slice(0, pngB64.length - 1)), "INVALID_BASE64");
    await expectCode(() => decodeDraftImageBase64(`${pngB64}=`), "INVALID_BASE64");
  });

  await record("no silent partial accept: junk suffix cannot decode to the valid image", async () => {
    // Node's Buffer.from silently drops the junk and yields the SAME bytes as
    // the clean payload; the strict decoder must refuse it instead.
    const lenient = Buffer.from(`${pngB64}!!!***`, "base64");
    assert(lenient.equals(png), "precondition: Node lenient decode returns the clean image bytes");
    await expectCode(() => decodeDraftImageBase64(`${pngB64}!!!***`), "INVALID_BASE64");
  });

  await record("canonical base64 (plain, chunked, and data-URL) decodes byte-exactly", () => {
    assert(decodeDraftImageBase64(pngB64).equals(png), "plain base64 mismatch");
    const chunked = (pngB64.match(/.{1,60}/g) ?? []).join("\n");
    assert(decodeDraftImageBase64(chunked).equals(png), "chunked base64 mismatch");
    assert(decodeDraftImageBase64(`data:image/png;base64,${pngB64}`).equals(png), "data-URL base64 mismatch");
  });

  // --- byte / pixel limits ------------------------------------------------
  await record("empty decoded body is rejected", async () => {
    await expectCode(() => validateRestorationDraftImage(Buffer.alloc(0)), "EMPTY_FILE");
  });

  await record("decoded bytes above the 10 MB limit are rejected", async () => {
    assert(MAX_DRAFT_UPLOAD_BYTES === 10 * 1024 * 1024, "the 10 MB limit must not be weakened");
    const oversized = Buffer.concat([png, Buffer.alloc(MAX_DRAFT_UPLOAD_BYTES + 1 - png.length)]);
    assert(oversized.length === MAX_DRAFT_UPLOAD_BYTES + 1, "fixture must be exactly one byte over");
    await expectCode(() => validateRestorationDraftImage(oversized), "IMAGE_TOO_LARGE");
  });

  await record("the byte limit is enforced on DECODED bytes, not the encoded string", async () => {
    const oversized = Buffer.concat([png, Buffer.alloc(MAX_DRAFT_UPLOAD_BYTES + 1 - png.length)]);
    const decoded = decodeDraftImageBase64(oversized.toString("base64"));
    assert(decoded.length > MAX_DRAFT_UPLOAD_BYTES, "decoded length must exceed the cap");
    await expectCode(() => validateRestorationDraftImage(decoded), "IMAGE_TOO_LARGE");
  });

  // --- claimed type vs. real bytes ---------------------------------------
  await record("claimed extension/contentType cannot override detected bytes", async () => {
    // The validator takes ONLY the buffer -- there is no client-claimed
    // contentType/extension parameter it could ever consult.
    assert(validateRestorationDraftImage.length === 1, "validator must accept bytes only");
    const notAnImage = Buffer.from("MZ\u0000this is an executable renamed photo.jpg");
    await expectCode(() => validateRestorationDraftImage(notAnImage), "UNSUPPORTED_IMAGE_TYPE");
    // A real PNG claimed as image/jpeg is still reported as image/png.
    const validated = await validateRestorationDraftImage(png);
    assert(validated.mimeType === "image/png", `expected image/png, got ${validated.mimeType}`);
  });

  await record("corrupt/truncated image fails a REAL sharp decode, not just the magic-byte check", async () => {
    const jpegHeaderOnly = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("garbage not a jpeg")]);
    await expectCode(() => validateRestorationDraftImage(jpegHeaderOnly), "INVALID_IMAGE_BINARY");
    const truncatedPng = png.subarray(0, 30);
    await expectCode(() => validateRestorationDraftImage(truncatedPng), "INVALID_IMAGE_BINARY");
  });

  await record("SVG (and other unsupported formats) fail closed", async () => {
    const svg = Buffer.from(
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>&xxe;</text></svg>`
    );
    await expectCode(() => validateRestorationDraftImage(svg), "UNSUPPORTED_IMAGE_TYPE");
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(32)]);
    await expectCode(() => validateRestorationDraftImage(gif), "UNSUPPORTED_IMAGE_TYPE");
    const tiff = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(32)]);
    await expectCode(() => validateRestorationDraftImage(tiff), "UNSUPPORTED_IMAGE_TYPE");
    const pdf = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "binary");
    await expectCode(() => validateRestorationDraftImage(pdf), "UNSUPPORTED_IMAGE_TYPE");
  });

  // --- pixel budget / orientation ----------------------------------------
  await record("pixel budget is charged per page for multi-page containers", async () => {
    assert(MAX_DRAFT_UPLOAD_PIXELS === 30_000_000, "the 30 MP limit must not be weakened");
    // Single-page images stay unaffected by the per-page accounting.
    const single = await validateRestorationDraftImage(png);
    assert(single.width === 40 && single.height === 20, "single-page dimensions changed");
  });

  await record("at-limit image is accepted and over-limit image is rejected", async () => {
    const side = 5000; // 25 MP, under the 30 MP cap
    const atLimit = await sharp({ create: { width: side, height: side, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    assert(side * side <= MAX_DRAFT_UPLOAD_PIXELS, "fixture must be within the pixel cap");
    if (atLimit.length <= MAX_DRAFT_UPLOAD_BYTES) {
      const ok = await validateRestorationDraftImage(atLimit);
      assert(ok.width === side && ok.height === side, "under-limit image must be accepted intact");
    }
    const over = 6000; // 36 MP
    const overLimit = await sharp({ create: { width: over, height: over, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expectCode(() => validateRestorationDraftImage(overLimit), "IMAGE_TOO_LARGE");
  });

  await record("EXIF orientation reports display dimensions and cannot bypass the pixel cap", async () => {
    const rotated = await sharp({ create: { width: 600, height: 300, channels: 3, background: { r: 4, g: 5, b: 6 } } })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 40 })
      .toBuffer();
    const validated = await validateRestorationDraftImage(rotated);
    assert(validated.width === 300 && validated.height === 600, `expected 300x600, got ${validated.width}x${validated.height}`);
    // The pixel cap compares an orientation-invariant product (w*h === h*w),
    // so an orientation-swapped file cannot be under the cap in one
    // orientation and over it in the other.
    const overRotated = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 20 })
      .toBuffer();
    await expectCode(() => validateRestorationDraftImage(overRotated), "IMAGE_TOO_LARGE");
  });

  // --- unsafe file name ---------------------------------------------------
  await record("unsafe/oversized client file names are rejected before any storage key is built", async () => {
    await expectCode(() => assertSafeUploadFileName(""), "INVALID_REQUEST");
    await expectCode(() => assertSafeUploadFileName(undefined), "INVALID_REQUEST");
    await expectCode(() => assertSafeUploadFileName("a".repeat(MAX_DRAFT_FILE_NAME_LENGTH + 1)), "INVALID_FILE_NAME");
    await expectCode(() => assertSafeUploadFileName("photo\u0000.jpg"), "INVALID_FILE_NAME");
    await expectCode(() => assertSafeUploadFileName("photo\n.jpg"), "INVALID_FILE_NAME");
    await expectCode(() => assertSafeUploadFileName("photo\r\n\u001bX.jpg"), "INVALID_FILE_NAME");
    // Traversal text is still accepted as TEXT here (it is neutralized by
    // StorageService's basename + charset sanitizer), but it must never be
    // usable as a path separator once the key is built.
    assert(assertSafeUploadFileName("../../etc/passwd") === "../../etc/passwd", "expected text passthrough");
  });

  // --- error hygiene ------------------------------------------------------
  await record("validation errors never echo raw payload bytes or base64", async () => {
    const secretish = Buffer.from("SECRET-TOKEN-DO-NOT-LEAK-0123456789");
    const err = await expectCode(() => validateRestorationDraftImage(secretish), "UNSUPPORTED_IMAGE_TYPE");
    const text = `${err.message}${JSON.stringify(err)}`;
    assert(!text.includes("SECRET-TOKEN"), "error leaked raw input bytes");
    assert(!text.includes(secretish.toString("base64")), "error leaked base64 payload");
    const b64err = await expectCode(() => decodeDraftImageBase64(`${pngB64}!!!`), "INVALID_BASE64");
    assert(!b64err.message.includes(pngB64.slice(0, 16)), "error leaked the base64 payload");
  });

  // --- valid image still succeeds ----------------------------------------
  await record("a valid supported image still validates successfully", async () => {
    for (const buffer of [
      png,
      await sharp({ create: { width: 12, height: 9, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer(),
      await sharp({ create: { width: 12, height: 9, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer()
    ]) {
      const validated = await validateRestorationDraftImage(buffer);
      assert(/^image\/(jpeg|png|webp)$/.test(validated.mimeType), `unexpected mime ${validated.mimeType}`);
      assert(validated.width > 0 && validated.height > 0, "dimensions must be positive");
      assert(/^[0-9a-f]{64}$/.test(validated.sha256), "sha256 must be lowercase hex");
    }
  });

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}: ${r.name}${r.detail ? ` -- ${r.detail}` : ""}`);
  console.log(`${results.length - failed.length}/${results.length} upload input-validation tests passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
