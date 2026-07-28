/**
 * Benchmark configuration — Sprint 1.
 * Defines benchmark datasets and test cases.
 * Actual benchmark execution is in Sprint 4.
 */

export const BENCHMARK_CATEGORIES = [
  { id: "old_portraits", name: "Old Portraits", count: 50, source: "Historical archives" },
  { id: "documents", name: "Documents", count: 50, source: "Scanned documents" },
  { id: "wedding_photos", name: "Wedding Photos", count: 50, source: "Public domain" },
  { id: "group_photos", name: "Group Photos", count: 50, source: "Historical" },
  { id: "black_and_white", name: "Black & White", count: 50, source: "Archives" },
  { id: "heavy_damage", name: "Heavy Damage", count: 50, source: "Created" },
  { id: "light_damage", name: "Light Damage", count: 50, source: "Created" },
  { id: "large_resolution", name: "Large Resolution", count: 50, source: "Scanned" },
  { id: "low_resolution", name: "Low Resolution", count: 50, source: "Photos" }
];

export const BENCHMARK_TEST_CASES = [
  { id: "TC-001", description: "Portrait, light damage", expectedPipeline: "GFPGAN + ESRGAN" },
  { id: "TC-002", description: "Document, heavy damage", expectedPipeline: "LaMa + DDColor" },
  { id: "TC-003", description: "B&W landscape", expectedPipeline: "DDColor + ESRGAN" },
  { id: "TC-004", description: "Group wedding", expectedPipeline: "Batch GFPGAN" },
  { id: "TC-005", description: "Low res color", expectedPipeline: "ESRGAN upscale" }
];

export const BENCHMARK_THRESHOLDS = {
  ssim: { min: 0.85 },
  psnr: { min: 25 },
  faceIdentityPreserved: { min: 0.9 },
  artifactScore: { max: 15 }
};
