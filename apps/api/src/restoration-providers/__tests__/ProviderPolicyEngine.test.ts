import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderPolicyEngine, DEFAULT_POLICY_CONFIG } from "../policy/ProviderPolicyEngine";
import type { PackageTier, RoutingContext } from "../interfaces/IRestorationProvider";

describe("ProviderPolicyEngine", () => {
  let engine: ProviderPolicyEngine;

  const createContext = (tier: PackageTier): RoutingContext => ({
    packageTier: tier,
    imageCategory: "PORTRAIT",
    damageSeverity: "MEDIUM",
    hasFaces: true,
    isBlackAndWhite: false,
    imageSizeBytes: 102400,
  });

  describe("getPolicy", () => {
    it("should return policy for each tier", () => {
      engine = new ProviderPolicyEngine();

      const preview = engine.getPolicy("preview");
      assert.strictEqual(preview.tier, "preview");
      assert.strictEqual(preview.primaryProvider, "replicate");
      assert.strictEqual(preview.fallbackProvider, "openai");

      const basic = engine.getPolicy("basic");
      assert.strictEqual(basic.tier, "basic");
      assert.strictEqual(basic.primaryProvider, "replicate");

      const premium = engine.getPolicy("premium");
      assert.strictEqual(premium.tier, "premium");
      assert.strictEqual(premium.primaryProvider, "replicate");
      assert.strictEqual(premium.fallbackProvider, "openai");

      const print = engine.getPolicy("print");
      assert.strictEqual(print.tier, "print");
      assert.strictEqual(print.primaryProvider, "replicate");
      assert.strictEqual(print.fallbackProvider, "openai");

      const archive = engine.getPolicy("archive");
      assert.strictEqual(archive.tier, "archive");
      assert.strictEqual(archive.primaryProvider, "replicate");
    });

    it("should return default tier for unknown tier", () => {
      engine = new ProviderPolicyEngine();
      const policy = engine.getPolicy("unknown" as PackageTier);
      assert.strictEqual(policy.tier, "basic");
    });
  });

  describe("getPolicyForContext", () => {
    it("should return policy matching context package tier", () => {
      engine = new ProviderPolicyEngine();
      const context = createContext("premium");
      const policy = engine.getPolicyForContext(context);
      assert.strictEqual(policy.tier, "premium");
    });
  });

  describe("makeRoutingDecision", () => {
    it("should create routing decision for preview tier", () => {
      engine = new ProviderPolicyEngine();
      const context = createContext("preview");
      const decision = engine.makeRoutingDecision(context);

      assert.strictEqual(decision.primaryProvider, "replicate");
      assert.strictEqual(decision.fallbackProvider, "openai");
      assert.ok(decision.reason.includes("preview"));
    });

    it("should create routing decision for premium tier", () => {
      engine = new ProviderPolicyEngine();
      const context = createContext("premium");
      const decision = engine.makeRoutingDecision(context);

      assert.strictEqual(decision.primaryProvider, "replicate");
      assert.strictEqual(decision.fallbackProvider, "openai");
      assert.ok(decision.reason.includes("premium"));
    });

    it("should create routing decision for print tier", () => {
      engine = new ProviderPolicyEngine();
      const context = createContext("print");
      const decision = engine.makeRoutingDecision(context);

      assert.strictEqual(decision.primaryProvider, "replicate");
      assert.strictEqual(decision.fallbackProvider, "openai");
    });

    it("should create routing decision for basic tier", () => {
      engine = new ProviderPolicyEngine();
      const context = createContext("basic");
      const decision = engine.makeRoutingDecision(context);

      assert.strictEqual(decision.primaryProvider, "replicate");
      assert.strictEqual(decision.fallbackProvider, "openai");
    });

    it("should create routing decision for archive tier", () => {
      engine = new ProviderPolicyEngine();
      const context = createContext("archive");
      const decision = engine.makeRoutingDecision(context);

      assert.strictEqual(decision.primaryProvider, "replicate");
      assert.strictEqual(decision.fallbackProvider, "openai");
    });
  });

  describe("getAllPolicies", () => {
    it("should return all 5 policies", () => {
      engine = new ProviderPolicyEngine();
      const policies = engine.getAllPolicies();
      assert.strictEqual(policies.length, 5);
      assert.strictEqual(policies.map(p => p.tier).sort().join(","), "archive,basic,premium,preview,print");
    });
  });

  describe("getDefaultTier", () => {
    it("should return 'basic' as default", () => {
      engine = new ProviderPolicyEngine();
      assert.strictEqual(engine.getDefaultTier(), "basic");
    });
  });

  describe("isShadowModeEnabled", () => {
    it("should return false by default", () => {
      engine = new ProviderPolicyEngine();
      assert.strictEqual(engine.isShadowModeEnabled(), false);
    });

    it("should return true when configured", () => {
      engine = new ProviderPolicyEngine({ shadowMode: true, shadowProvider: "fal-ai" });
      assert.strictEqual(engine.isShadowModeEnabled(), true);
    });
  });

  describe("updateConfig", () => {
    it("should update shadow mode config", () => {
      engine = new ProviderPolicyEngine();
      engine.updateConfig({ shadowMode: true, shadowProvider: "replicate" });
      assert.strictEqual(engine.isShadowModeEnabled(), true);
      assert.strictEqual(engine.getShadowProvider(), "replicate");
    });
  });

  describe("DEFAULT_POLICY_CONFIG", () => {
    it("should have 5 policies", () => {
      assert.strictEqual(DEFAULT_POLICY_CONFIG.policies.length, 5);
    });

    it("should have correct default tier", () => {
      assert.strictEqual(DEFAULT_POLICY_CONFIG.defaultTier, "basic");
    });
  });

  describe("disabledProviders", () => {
    it("should have runpod disabled by default", () => {
      engine = new ProviderPolicyEngine();
      assert.deepStrictEqual(engine.getDisabledProviders(), ["runpod"]);
    });

    it("should detect disabled provider", () => {
      engine = new ProviderPolicyEngine();
      assert.strictEqual(engine.isProviderDisabled("runpod"), true);
      assert.strictEqual(engine.isProviderDisabled("replicate"), false);
    });

    it("should enable a disabled provider", () => {
      engine = new ProviderPolicyEngine();
      engine.enableProvider("runpod");
      assert.strictEqual(engine.isProviderDisabled("runpod"), false);
      assert.deepStrictEqual(engine.getDisabledProviders(), []);
    });

    it("should disable an enabled provider", () => {
      engine = new ProviderPolicyEngine();
      engine.disableProvider("replicate");
      assert.strictEqual(engine.isProviderDisabled("replicate"), true);
      assert.deepStrictEqual(engine.getDisabledProviders(), ["runpod", "replicate"]);
    });

    it("should not duplicate disabled provider", () => {
      engine = new ProviderPolicyEngine();
      engine.disableProvider("runpod");
      assert.deepStrictEqual(engine.getDisabledProviders(), ["runpod"]);
    });

    it("should update disabledProviders via updateConfig", () => {
      engine = new ProviderPolicyEngine();
      engine.updateConfig({ disabledProviders: ["runpod", "fal-ai"] });
      assert.deepStrictEqual(engine.getDisabledProviders(), ["runpod", "fal-ai"]);
    });
  });
});
