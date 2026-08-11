import type { DigitalTier } from "../domain/pricing/offerProvider";

export const PRINT_SIZE_INCHES: Record<string, [number, number]> = {
  "4x6": [4, 6], "5x7": [5, 7], "6x8": [6, 8], "8x10": [8, 10], "8x12": [8, 12],
  "10x12": [10, 12], "12x18": [12, 18], "16x24": [16, 24], "20x30": [20, 30],
  "24x36": [24, 36], "30x40": [30, 40], "40x60": [40, 60]
};

export const DIGITAL_TIER_FACTORS: Record<DigitalTier, number> = {
  ORIGINAL: 1, HD_2X: 2, HD_4X: 4, HD_6X: 6, HD_8X: 8, HD_10X: 10, HD_12X: 12
};

const tierOrder: DigitalTier[] = ["ORIGINAL", "HD_2X", "HD_4X", "HD_6X", "HD_8X", "HD_10X", "HD_12X"];

function fittedPpi(width: number, height: number, printWidth: number, printHeight: number): number {
  return Math.max(Math.min(width / printWidth, height / printHeight), Math.min(width / printHeight, height / printWidth));
}

export function effectivePpiForPrint(width: number, height: number, size: string, tier: DigitalTier): number | null {
  const dimensions = PRINT_SIZE_INCHES[size];
  if (!dimensions || width <= 0 || height <= 0) return null;
  return Math.round(fittedPpi(width * DIGITAL_TIER_FACTORS[tier], height * DIGITAL_TIER_FACTORS[tier], dimensions[0], dimensions[1]));
}

export function minimumTierForPrint(width: number | null, height: number | null, size: string): DigitalTier | null {
  if (!width || !height || !PRINT_SIZE_INCHES[size]) return null;
  return tierOrder.find((tier) => (effectivePpiForPrint(width, height, size, tier) ?? 0) >= 200) ?? "HD_12X";
}

export function requiredTierSurcharge(currentTier: DigitalTier, requiredTier: DigitalTier | null, offers: Array<{ tier: DigitalTier; amountMinor: number }>): number {
  if (!requiredTier || tierOrder.indexOf(currentTier) >= tierOrder.indexOf(requiredTier)) return 0;
  return offers.find((offer) => offer.tier === requiredTier)?.amountMinor ?? 0;
}
