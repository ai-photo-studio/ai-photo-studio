import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpVariantService } from "./sharp-variant.service";

const image = async (width = 128, height = 96) => sharp({ create: { width, height, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();

test("SharpVariantService fails closed on unvalidated master", async () => {
  const service = new SharpVariantService(
    { findValidatedMaster: async () => ({ id: "m1", storageKey: null, sha256: null, width: null, height: null, contentType: null, status: "NOT_STARTED" }), findVariant: async () => null, createVariant: async () => { throw new Error("no"); } },
    { download: async () => Buffer.alloc(0), upload: async () => {}, delete: async () => {} }
  );
  await assert.rejects(() => service.getOrCreateVariant("m1", "original"), /validated restoration master is required/);
});

test("SharpVariantService reuses an existing valid variant", async () => {
  const body = await image();
  let downloads = 0;
  const service = new SharpVariantService(
    {
      findValidatedMaster: async () => ({ id: "m1", storageKey: "finals/master.jpg", sha256: "sha", width: 128, height: 96, contentType: "image/jpeg", status: "VALIDATED" }),
      findVariant: async () => ({ id: "v1", restorationMasterId: "m1", variantSpecId: "original", sourceMasterSha256: "sha", storageKey: "finals/v1.jpg", width: 128, height: 96, contentType: "image/jpeg" }),
      createVariant: async () => { throw new Error("must not create"); }
    },
    { download: async () => { downloads++; return body; }, upload: async () => {}, delete: async () => {} }
  );
  const variant = await service.getOrCreateVariant("m1", "original");
  assert.equal(variant.id, "v1");
  assert.equal(downloads, 0);
});

test("SharpVariantService generates original, 2hd, and 4hd variants with server-owned specs", async () => {
  const body = await image(1024, 768);
  const calls: string[] = [];
  const uploads: Array<{ storageKey: string; contentType: string; size: number }> = [];
  const service = new SharpVariantService(
    {
      findValidatedMaster: async () => ({ id: "m1", storageKey: "finals/master.jpg", sha256: "sha", width: 1024, height: 768, contentType: "image/jpeg", status: "VALIDATED" }),
      findVariant: async () => null,
      createVariant: async (input) => ({ id: `${input.variantSpecId}-id`, ...input })
    },
    {
      download: async (key) => { calls.push(key); return body; },
      upload: async (storageKey, bytes, contentType) => { uploads.push({ storageKey, contentType, size: bytes.length }); },
      delete: async () => {}
    }
  );

  const original = await service.getOrCreateVariant("m1", "original");
  const twoHd = await service.getOrCreateVariant("m1", "2hd");
  const fourHd = await service.getOrCreateVariant("m1", "4hd");

  assert.equal(calls.length, 3);
  assert.equal(original.variantSpecId, "original");
  assert.equal(twoHd.variantSpecId, "2hd");
  assert.equal(fourHd.variantSpecId, "4hd");
  assert.ok(uploads.every((entry) => entry.contentType === "image/jpeg"));
});
