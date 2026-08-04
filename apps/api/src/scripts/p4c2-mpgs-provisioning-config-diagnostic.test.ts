import { describe, expect, it } from "vitest";
import {
  inspectBase64RoundTrip,
  inspectMerchantId,
  inspectSecret,
  inspectUsernameStructure,
  runDiagnostic
} from "./p4c2-mpgs-provisioning-config-diagnostic";

describe("p4c2 MPGS credential-provisioning diagnostic", () => {
  describe("inspectSecret", () => {
    it("reports missing for undefined/empty", () => {
      expect(inspectSecret("X", undefined).presence).toBe("missing");
      expect(inspectSecret("X", "").presence).toBe("missing");
    });

    it("reports length and whitespace/newline booleans without ever exposing the value", () => {
      const finding = inspectSecret("X", "  abc\n");
      expect(finding.presence).toBe("present");
      expect(finding.length).toBe(6);
      expect(finding.hasLeadingWhitespace).toBe(true);
      expect(finding.hasTrailingWhitespace).toBe(true);
      expect(finding.hasEmbeddedNewline).toBe(true);
      expect(JSON.stringify(finding)).not.toContain("abc");
    });

    it("detects placeholder-shaped values", () => {
      expect(inspectSecret("X", "changeme").placeholderSuspected).toBe(true);
      expect(inspectSecret("X", "REPLACE_ME").placeholderSuspected).toBe(true);
      expect(inspectSecret("X", "<set via environment>").placeholderSuspected).toBe(true);
      expect(inspectSecret("X", "a-genuinely-random-looking-value-9f8e").placeholderSuspected).toBe(false);
    });

    it("does not flag ordinary values as placeholders", () => {
      expect(inspectSecret("X", "MERCH12345").placeholderSuspected).toBe(false);
    });
  });

  describe("inspectMerchantId", () => {
    it("is undefined when merchant id absent", () => {
      expect(inspectMerchantId(undefined)).toBeUndefined();
    });

    it("validates character class and plausible length", () => {
      expect(inspectMerchantId("ABC123-xyz_9")).toEqual({ characterClassValid: true, lengthPlausible: true });
      expect(inspectMerchantId("ab")).toEqual({ characterClassValid: true, lengthPlausible: false });
      expect(inspectMerchantId("has a space")).toEqual({ characterClassValid: false, lengthPlausible: true });
      expect(inspectMerchantId("has/slash")).toEqual({ characterClassValid: false, lengthPlausible: true });
    });
  });

  describe("inspectUsernameStructure", () => {
    it("is undefined without a merchant id", () => {
      expect(inspectUsernameStructure(undefined)).toBeUndefined();
    });

    it("validates the merchant.<MERCHANT_ID> shape", () => {
      expect(inspectUsernameStructure("ABC123")).toEqual({ usernameStructureValid: true });
      expect(inspectUsernameStructure("has space")).toEqual({ usernameStructureValid: false });
    });
  });

  describe("inspectBase64RoundTrip", () => {
    it("is undefined without both merchant id and password", () => {
      expect(inspectBase64RoundTrip(undefined, "x")).toBeUndefined();
      expect(inspectBase64RoundTrip("x", undefined)).toBeUndefined();
    });

    it("is valid for a well-formed pair and matches Buffer's own encode/decode contract", () => {
      const result = inspectBase64RoundTrip("MERCH1", "s3cr3t-pass");
      expect(result).toEqual({ base64RoundTripValid: true });
    });

    it("stays valid even for passwords containing colons or unicode", () => {
      expect(inspectBase64RoundTrip("MERCH1", "pa:ss:word")).toEqual({ base64RoundTripValid: true });
      expect(inspectBase64RoundTrip("MERCH1", "pässwörd-9")).toEqual({ base64RoundTripValid: true });
    });
  });

  describe("runDiagnostic", () => {
    it("flags missing required secrets (excluding OPERATOR_ID, which is optional metadata)", () => {
      const report = runDiagnostic({});
      expect(report.ok).toBe(false);
      expect(report.missing).toEqual(
        expect.arrayContaining(["BANK_ALFALAH_MPGS_MERCHANT_ID", "BANK_ALFALAH_MPGS_API_PASSWORD"])
      );
    });

    it("is ok when both required secrets are present, regardless of OPERATOR_ID", () => {
      const report = runDiagnostic({
        BANK_ALFALAH_MPGS_MERCHANT_ID: "ABC123",
        BANK_ALFALAH_MPGS_API_PASSWORD: "s3cr3t"
      });
      expect(report.ok).toBe(true);
      expect(report.missing).toEqual([]);
      expect(report.base64?.base64RoundTripValid).toBe(true);
    });

    it("never includes a secret value anywhere in the serialized report", () => {
      const env = {
        BANK_ALFALAH_MPGS_MERCHANT_ID: "MERCH-UNIQUE-TOKEN-42",
        BANK_ALFALAH_MPGS_API_PASSWORD: "UNIQUE-PASSWORD-TOKEN-77",
        BANK_ALFALAH_MPGS_OPERATOR_ID: "UNIQUE-OPERATOR-TOKEN-13"
      };
      const report = runDiagnostic(env);
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("MERCH-UNIQUE-TOKEN-42");
      expect(serialized).not.toContain("UNIQUE-PASSWORD-TOKEN-77");
      expect(serialized).not.toContain("UNIQUE-OPERATOR-TOKEN-13");
    });
  });
});
