import { calculatePrintSuitability, type PrintSuitabilityResult } from "./printSuitability";

export type CustomerUseCaseId = "MOBILE_SOCIAL" | "SMALL_PRINT" | "TABLE_FRAME" | "WALL_FRAME" | "LARGE_WALL_ART" | "CANVAS";

export type CustomerUseCase = {
  id: CustomerUseCaseId;
  label: string;
  copy: string;
  sizes: string[];
  digitalTier?: string;
};

export const CUSTOMER_USE_CASES: CustomerUseCase[] = [
  { id: "MOBILE_SOCIAL", label: "Mobile & Social", copy: "Best for sharing on your phone and social media.", sizes: [], digitalTier: "ORIGINAL" },
  { id: "SMALL_PRINT", label: "Small Print", copy: "Perfect for everyday photo prints.", sizes: ["4x6", "5x7"] },
  { id: "TABLE_FRAME", label: "Table Frame", copy: "Great for a desk, shelf, or bedside frame.", sizes: ["8x10"] },
  { id: "WALL_FRAME", label: "Wall Frame", copy: "Made for a medium wall display.", sizes: ["8x12", "10x12", "12x18"] },
  { id: "LARGE_WALL_ART", label: "Large Wall Art", copy: "For larger wall displays and statement pieces.", sizes: ["16x24", "20x30", "24x36", "30x40", "40x60"] },
  { id: "CANVAS", label: "Canvas", copy: "Canvas ordering is not currently available.", sizes: ["Triple Canvas"] }
];

// Triple Canvas has an approved price but no documented physical dimensions,
// so it must not be offered as an orderable customer choice yet.
export const ORDERABLE_CUSTOMER_USE_CASES = CUSTOMER_USE_CASES.filter((useCase) => useCase.id !== "CANVAS");

const TIER_RANK: Record<string, number> = { ORIGINAL: 0, HD_2X: 1, HD_4X: 2, HD_6X: 3, HD_8X: 4, HD_10X: 5, HD_12X: 6 };
const TIER_FACTOR: Record<string, number> = { ORIGINAL: 1, HD_2X: 2, HD_4X: 4, HD_6X: 6, HD_8X: 8, HD_10X: 10, HD_12X: 12 };

export function minimumTierForPrint(width: number | null, height: number | null, size: string): string | null {
  if (!width || !height || size === "Triple Canvas") return null;
  for (const tier of ["ORIGINAL", "HD_2X", "HD_4X", "HD_6X", "HD_8X", "HD_10X", "HD_12X"]) {
    const result = calculatePrintSuitability(width * TIER_FACTOR[tier], height * TIER_FACTOR[tier], size);
    if (result && result.effectivePpi >= 200) return tier;
  }
  return "HD_12X";
}

export function bestUseCaseResult(useCase: CustomerUseCase, width: number | null, height: number | null): { size: string; result: PrintSuitabilityResult | null; requiredTier: string | null } | null {
  const size = useCase.sizes[0];
  if (!size) return null;
  const result = width && height ? calculatePrintSuitability(width, height, size) : null;
  return { size, result, requiredTier: minimumTierForPrint(width, height, size) };
}

export function tierRank(tier: string): number { return TIER_RANK[tier] ?? -1; }
