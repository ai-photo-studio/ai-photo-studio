export interface MemoryPackage { code: string; name: string; priceMinor: number; currency: "PKR" | "USD"; includes: readonly string[]; checkoutReady: boolean; blocker?: "PACKAGE_FULFILMENT_DETAILS_REQUIRED"; }
const base = [
  { code: "AMMI_ABU_MEMORY", name: "Ammi Abu Memory", includes: ["2 old photos restored", "2 high resolution digital files", "2 A4 prints"], checkoutReady: true },
  { code: "PARENTS_WEDDING_MEMORY", name: "Parents Wedding Memory", includes: ["1 wedding photograph restoration", "colorized version", "4K upscale", "12x18 premium print"], checkoutReady: true },
  { code: "FAMILY_HERITAGE_PACK", name: "Family Heritage Pack", includes: ["5 restored photographs", "5 digital files", "10 prints"], checkoutReady: false },
  { code: "WEDDING_ANNIVERSARY_GIFT", name: "Wedding Anniversary Gift", includes: ["old wedding photograph", "restoration", "colorization", "4K enlargement", "10 images", "1 album"], checkoutReady: false }
] as const;
const pkr = [249900, 199900, 349900, 500000];
const usd = [1499, 1199, 1999, 2999];
export const MEMORY_PACKAGES: readonly MemoryPackage[] = base.map((item, i) => ({ ...item, currency: "PKR", priceMinor: pkr[i], ...(item.checkoutReady ? {} : { blocker: "PACKAGE_FULFILMENT_DETAILS_REQUIRED" as const }) }));
export const PUBLIC_MEMORY_PACKAGES: readonly MemoryPackage[] = [...MEMORY_PACKAGES, ...base.map((item, i) => ({ ...item, currency: "USD" as const, priceMinor: usd[i], ...(item.checkoutReady ? {} : { blocker: "PACKAGE_FULFILMENT_DETAILS_REQUIRED" as const }) }))];
