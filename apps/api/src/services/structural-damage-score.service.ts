export type StructuralRoute = "standard" | "standard_or_premium" | "premium_only";
export type StructuralMetrics = { missingTornArea: number; faceRegionDamage: number; scratchesCracks: number; blurNoise: number; lowResolution: number; fadingExposure: number; };
export type StructuralRouting = { calculatedScore: number; baseRoute: StructuralRoute; finalRoute: StructuralRoute; forcedPremium: boolean; overrideReason: "forced" | "severe_face_loss" | "excessive_missing_torn_area" | "excessive_mask_coverage" | null; components: StructuralMetrics; ruleVersion: string; };
export class StructuralDamageScoreService {
  score(metrics: StructuralMetrics, options: { forcePremium?: boolean; maskCoverage?: number; missingTornThreshold?: number; faceLossThreshold?: number; maskCoverageThreshold?: number } = {}): StructuralRouting {
    const c = (v: number) => Math.max(0, Math.min(100, v));
    const score = Math.round(c(metrics.missingTornArea) * .35 + c(metrics.faceRegionDamage) * .25 + c(metrics.scratchesCracks) * .15 + c(metrics.blurNoise) * .10 + c(metrics.lowResolution) * .10 + c(metrics.fadingExposure) * .05);
    const baseRoute: StructuralRoute = score <= 39 ? "standard" : score <= 79 ? "standard_or_premium" : "premium_only";
    const reason = options.forcePremium ? "forced" : metrics.faceRegionDamage >= (options.faceLossThreshold ?? 80) ? "severe_face_loss" : metrics.missingTornArea >= (options.missingTornThreshold ?? 70) ? "excessive_missing_torn_area" : (options.maskCoverage ?? 0) >= (options.maskCoverageThreshold ?? 35) ? "excessive_mask_coverage" : null;
    return { calculatedScore: score, baseRoute, finalRoute: reason ? "premium_only" : baseRoute, forcedPremium: Boolean(reason), overrideReason: reason, components: metrics, ruleVersion: "structural-score/2" };
  }
}
