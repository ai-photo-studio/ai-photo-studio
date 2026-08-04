import { assertMarketConfirmed, deriveMarketFromCountry, MarketConfirmationError } from "./market";

function expectThrows(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    if (err instanceof MarketConfirmationError) return;
    throw new Error(`${name}: expected MarketConfirmationError, got ${(err as Error).message}`);
  }
  throw new Error(`${name}: expected to throw`);
}

// Pakistan -> PAKISTAN/PKR
{
  const derived = deriveMarketFromCountry("pk");
  if (derived.market !== "PAKISTAN" || derived.currency !== "PKR" || derived.country !== "PK") {
    throw new Error(`unexpected derivation for PK: ${JSON.stringify(derived)}`);
  }
}

// Any other well-formed country -> INTERNATIONAL/USD
for (const country of ["US", "GB", "AE", "ca"]) {
  const derived = deriveMarketFromCountry(country);
  if (derived.market !== "INTERNATIONAL" || derived.currency !== "USD") {
    throw new Error(`unexpected derivation for ${country}: ${JSON.stringify(derived)}`);
  }
}

expectThrows("empty country", () => deriveMarketFromCountry(""));
expectThrows("numeric country", () => deriveMarketFromCountry("12"));
expectThrows("3-letter country", () => deriveMarketFromCountry("PAK"));
expectThrows("non-string country", () => deriveMarketFromCountry(undefined as unknown as string));

expectThrows("unconfirmed market (false)", () => assertMarketConfirmed(false));
expectThrows("unconfirmed market (missing)", () => assertMarketConfirmed(undefined));
expectThrows("unconfirmed market (truthy non-boolean)", () => assertMarketConfirmed("true"));

// does not throw
assertMarketConfirmed(true);

console.log("market derivation tests passed");
