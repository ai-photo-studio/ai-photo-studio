export type BenchmarkCategory =
  | "portrait"
  | "group"
  | "heavy_scratch"
  | "torn_photo"
  | "black_and_white"
  | "faded"
  | "document"
  | "landscape"
  | "low_resolution"
  | "artwork";

export interface GoldenBenchmarkImage {
  id: string;
  fileName: string;
  contentType: string;
  category: BenchmarkCategory;
  width: number;
  height: number;
  fileSizeBytes: number;
  description: string;
  expectedQuality: number;
  metadata: Record<string, unknown>;
}

export interface GoldenBenchmarkDataset {
  version: string;
  name: string;
  description: string;
  images: GoldenBenchmarkImage[];
  createdAt: string;
}

export const GOLDEN_BENCHMARK_DATASET: GoldenBenchmarkDataset = {
  version: "1.0.0",
  name: "Golden Benchmark Dataset",
  description: "Standardized benchmark images for provider quality evaluation",
  images: [
    {
      id: "portrait_01",
      fileName: "01_bw_portrait_1.jpg",
      contentType: "image/jpeg",
      category: "portrait",
      width: 800,
      height: 1000,
      fileSizeBytes: 9608,
      description: "Black and white portrait with moderate damage",
      expectedQuality: 75,
      metadata: { faceCount: 1, damageSeverity: "medium" },
    },
    {
      id: "portrait_02",
      fileName: "01_bw_portrait_2.jpg",
      contentType: "image/jpeg",
      category: "portrait",
      width: 800,
      height: 1000,
      fileSizeBytes: 9608,
      description: "Black and white portrait with heavy scratches",
      expectedQuality: 80,
      metadata: { faceCount: 1, damageSeverity: "heavy" },
    },
    {
      id: "portrait_03",
      fileName: "01_bw_portrait_3.jpg",
      contentType: "image/jpeg",
      category: "portrait",
      width: 1200,
      height: 1600,
      fileSizeBytes: 305758,
      description: "High-resolution black and white portrait",
      expectedQuality: 85,
      metadata: { faceCount: 1, damageSeverity: "light" },
    },
    {
      id: "group_01",
      fileName: "02_group_photo_1.jpg",
      contentType: "image/jpeg",
      category: "group",
      width: 1600,
      height: 1200,
      fileSizeBytes: 256000,
      description: "Group photo with 5+ people, moderate damage",
      expectedQuality: 70,
      metadata: { faceCount: 5, damageSeverity: "medium" },
    },
    {
      id: "heavy_scratch_01",
      fileName: "03_heavy_scratch_1.jpg",
      contentType: "image/jpeg",
      category: "heavy_scratch",
      width: 1024,
      height: 768,
      fileSizeBytes: 153600,
      description: "Photo with deep scratches across face",
      expectedQuality: 65,
      metadata: { faceCount: 1, damageSeverity: "heavy" },
    },
    {
      id: "torn_photo_01",
      fileName: "04_torn_photo_1.jpg",
      contentType: "image/jpeg",
      category: "torn_photo",
      width: 800,
      height: 600,
      fileSizeBytes: 96000,
      description: "Photo with torn corner and crease",
      expectedQuality: 60,
      metadata: { faceCount: 2, damageSeverity: "heavy" },
    },
    {
      id: "black_and_white_01",
      fileName: "05_bw_document_1.jpg",
      contentType: "image/jpeg",
      category: "black_and_white",
      width: 600,
      height: 800,
      fileSizeBytes: 48000,
      description: "Black and white document photo",
      expectedQuality: 55,
      metadata: { faceCount: 0, damageSeverity: "medium" },
    },
    {
      id: "faded_01",
      fileName: "06_faded_photo_1.jpg",
      contentType: "image/jpeg",
      category: "faded",
      width: 1200,
      height: 800,
      fileSizeBytes: 192000,
      description: "Faded color photo with low contrast",
      expectedQuality: 60,
      metadata: { faceCount: 1, damageSeverity: "medium" },
    },
    {
      id: "document_01",
      fileName: "07_document_1.jpg",
      contentType: "image/jpeg",
      category: "document",
      width: 1600,
      height: 1200,
      fileSizeBytes: 256000,
      description: "Scanned document with stains and creases",
      expectedQuality: 50,
      metadata: { faceCount: 0, damageSeverity: "medium" },
    },
    {
      id: "landscape_01",
      fileName: "08_landscape_1.jpg",
      contentType: "image/jpeg",
      category: "landscape",
      width: 1920,
      height: 1080,
      fileSizeBytes: 384000,
      description: "Outdoor landscape with fading",
      expectedQuality: 65,
      metadata: { faceCount: 0, damageSeverity: "light" },
    },
    {
      id: "low_resolution_01",
      fileName: "09_low_res_1.jpg",
      contentType: "image/jpeg",
      category: "low_resolution",
      width: 320,
      height: 240,
      fileSizeBytes: 16000,
      description: "Low resolution photo needing upscaling",
      expectedQuality: 40,
      metadata: { faceCount: 1, damageSeverity: "light" },
    },
    {
      id: "artwork_01",
      fileName: "10_artwork_1.jpg",
      contentType: "image/jpeg",
      category: "artwork",
      width: 1024,
      height: 1024,
      fileSizeBytes: 128000,
      description: "Painting reproduction with color fading",
      expectedQuality: 55,
      metadata: { faceCount: 0, damageSeverity: "medium" },
    },
  ],
  createdAt: "2026-07-21T00:00:00.000Z",
};

export class GoldenBenchmarkDatasetManager {
  private readonly dataset: GoldenBenchmarkDataset;

  constructor(dataset?: GoldenBenchmarkDataset) {
    this.dataset = dataset ?? GOLDEN_BENCHMARK_DATASET;
  }

  getDataset(): GoldenBenchmarkDataset {
    return this.dataset;
  }

  getImagesByCategory(category: BenchmarkCategory): GoldenBenchmarkImage[] {
    return this.dataset.images.filter((img) => img.category === category);
  }

  getAllImages(): GoldenBenchmarkImage[] {
    return [...this.dataset.images];
  }

  getCategories(): BenchmarkCategory[] {
    return [...new Set(this.dataset.images.map((img) => img.category))];
  }

  getImageById(id: string): GoldenBenchmarkImage | undefined {
    return this.dataset.images.find((img) => img.id === id);
  }

  getVersion(): string {
    return this.dataset.version;
  }

  getCategoryStats(): Record<BenchmarkCategory, { count: number; avgExpectedQuality: number }> {
    const stats: Record<string, { count: number; totalQuality: number }> = {};

    for (const img of this.dataset.images) {
      if (!stats[img.category]) {
        stats[img.category] = { count: 0, totalQuality: 0 };
      }
      stats[img.category].count++;
      stats[img.category].totalQuality += img.expectedQuality;
    }

    const result: Record<BenchmarkCategory, { count: number; avgExpectedQuality: number }> = {} as Record<BenchmarkCategory, { count: number; avgExpectedQuality: number }>;

    for (const [category, data] of Object.entries(stats)) {
      result[category as BenchmarkCategory] = {
        count: data.count,
        avgExpectedQuality: Math.round(data.totalQuality / data.count),
      };
    }

    return result;
  }
}
