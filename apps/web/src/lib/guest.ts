const STORAGE_KEY = "ai-photo-studio-guest-ownership";

type GuestTokenStore = Record<string, string>;

const readStore = (): GuestTokenStore => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as GuestTokenStore;
  } catch {
    return {};
  }
};

const writeStore = (store: GuestTokenStore) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const setGuestOwnershipToken = (orderId: string, token: string) => {
  if (!orderId || !token) return;
  const store = readStore();
  store[orderId] = token;
  writeStore(store);
};

export const getGuestOwnershipToken = (orderId: string): string | null => {
  if (!orderId) return null;
  const store = readStore();
  return store[orderId] || null;
};

export const clearGuestOwnershipToken = (orderId: string) => {
  if (!orderId) return;
  const store = readStore();
  delete store[orderId];
  writeStore(store);
};
