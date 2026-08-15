export type PrintSuitabilityCategory =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Upscaling Recommended"
  | "Upscaling Strongly Recommended";

export type PrintSuitabilityResult = {
  size: string;
  effectivePpi: number;
  category: PrintSuitabilityCategory;
  cropRequired: boolean;
};

const PRINT_DIMENSIONS_INCHES: Record<string, [number, number]> = {
  "4x6": [4, 6],
  "5x7": [5, 7],
  "6x8": [6, 8],
  "8x10": [8, 10],
  "8x12": [8, 12],
  "10x12": [10, 12],
  "12x18": [12, 18],
  "16x24": [16, 24],
  "20x30": [20, 30],
  "24x36": [24, 36],
  "30x40": [30, 40],
  "40x60": [40, 60]
};

export function displayAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "-";
  const ratio = width / height;
  const nearestThreeByTwo = Math.abs(ratio - 3 / 2) < 0.04;
  return `${ratio.toFixed(2)}:1${nearestThreeByTwo ? " (≈ 3:2)" : ""}`;
}

export function aspectRatioOrientation(width: number, height: number): string {
  return width === height ? "Square" : width > height ? "Landscape" : "Portrait";
}

function categoryForPpi(ppi: number): PrintSuitabilityCategory {
  if (ppi >= 300) return "Excellent";
  if (ppi >= 240) return "Very Good";
  if (ppi >= 200) return "Good";
  if (ppi >= 150) return "Upscaling Recommended";
  return "Upscaling Strongly Recommended";
}

export function calculatePrintSuitability(width: number, height: number, size: string): PrintSuitabilityResult | null {
  const printDimensions = PRINT_DIMENSIONS_INCHES[size];
  if (width <= 0 || height <= 0 || !printDimensions) return null;
  const [printWidth, printHeight] = printDimensions;
  const directPpi = Math.min(width / printWidth, height / printHeight);
  const rotatedPpi = Math.min(width / printHeight, height / printWidth);
  const effectivePpi = Math.round(Math.max(directPpi, rotatedPpi));
  const sourceRatio = width / height;
  const printRatio = printWidth / printHeight;
  const cropRequired = Math.abs(sourceRatio - printRatio) > 0.02 && Math.abs(sourceRatio - 1 / printRatio) > 0.02;
  return { size, effectivePpi, category: categoryForPpi(effectivePpi), cropRequired };
}

export function calculateAllPrintSuitability(width: number, height: number): PrintSuitabilityResult[] {
  return Object.keys(PRINT_DIMENSIONS_INCHES)
    .map((size) => calculatePrintSuitability(width, height, size))
    .filter((result): result is PrintSuitabilityResult => result !== null);
}

export function printCropRequired(width: number | null, height: number | null, size: string): boolean {
  if (!width || !height) return false;
  return calculatePrintSuitability(width, height, size)?.cropRequired ?? false;
}

export type AutomaticPrintTier = "ORIGINAL" | "HD_2X" | "HD_4X" | "HD_6X" | "HD_8X" | "HD_10X" | "HD_12X";
const PRINT_TIER_FACTORS: Record<AutomaticPrintTier, number> = { ORIGINAL: 1, HD_2X: 2, HD_4X: 4, HD_6X: 6, HD_8X: 8, HD_10X: 10, HD_12X: 12 };
export function minimumPrintTier(width: number | null, height: number | null, size: string): AutomaticPrintTier | null {
  if (!width || !height || !PRINT_DIMENSIONS_INCHES[size]) return null;
  const suitability = calculatePrintSuitability(width, height, size);
  if (!suitability) return null;
  return (Object.keys(PRINT_TIER_FACTORS) as AutomaticPrintTier[]).find((tier) => suitability.effectivePpi * PRINT_TIER_FACTORS[tier] >= 200) ?? "HD_12X";
}
