const WELCOME_WORDS = new Set(["hi", "hello", "start", "aoa", "assalamualaikum"]);
const PACKAGE_WORDS = new Set(["trial upload", "basic pack", "seller ready pack", "premium launch pack"]);

export const shouldSendWelcomeMenu = (text?: string): boolean => {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return WELCOME_WORDS.has(normalized);
};

export const getServiceMenuText = (): string => {
  return [
    "Welcome to AI Product Photo Studio.",
    "Please choose a service:",
    "1) Product Photo Editing",
    "2) Fashion / Model Photo",
    "3) Car / Bike Listing Photo",
    "4) Short Video",
    "5) Bulk Seller Package"
  ].join("\n");
};

export const extractSelectedPackage = (text?: string): string | null => {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  if (!PACKAGE_WORDS.has(normalized)) return null;
  return normalized;
};
