export interface MemoryPackage {
  code: string;
  name: string;
  priceMinor: number;
  currency: "PKR" | "USD";
  minImages: number;
  maxImages: number;
  includes: readonly string[];
  checkoutReady: boolean;
  blocker?: "PACKAGE_FULFILMENT_DETAILS_REQUIRED";
}

const packageDefinitions = [
  { code: "AMI_ABU_MEMORIES", name: "Ammi Abu Memories", minImages: 2, maxImages: 2, priceMinor: 250000, includes: ["2 restored photographs", "2 high-resolution digital files"], checkoutReady: true },
  { code: "FAMILY_MEMORIES", name: "Family Memories", minImages: 2, maxImages: 5, priceMinor: 0, includes: [], checkoutReady: false },
  { code: "WEDDING_MEMORIES", name: "Wedding Memories", minImages: 2, maxImages: 5, priceMinor: 0, includes: [], checkoutReady: false },
  { code: "OLD_FAMILY_COLLECTION", name: "Old Family Collection", minImages: 5, maxImages: 10, priceMinor: 0, includes: [], checkoutReady: false },
  { code: "PHOTO_ALBUM", name: "Photo Album", minImages: 5, maxImages: 10, priceMinor: 0, includes: [], checkoutReady: false }
] as const;

export const MEMORY_PACKAGES: readonly MemoryPackage[] = packageDefinitions.map((item) => ({
  ...item,
  currency: "PKR" as const,
  ...(item.checkoutReady ? {} : { blocker: "PACKAGE_FULFILMENT_DETAILS_REQUIRED" as const })
}));

export const PUBLIC_MEMORY_PACKAGES = MEMORY_PACKAGES;

export function findMemoryPackage(code: string): MemoryPackage | undefined {
  return MEMORY_PACKAGES.find((item) => item.code === code);
}
