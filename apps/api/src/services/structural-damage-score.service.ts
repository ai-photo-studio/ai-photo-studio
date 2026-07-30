export type StructuralRoute = "standard" | "standard_or_premium" | "premium_only";
export type StructuralMetrics = { missingTornArea: number; faceRegionDamage: number; scratchesCracks: number; blurNoise: number; lowResolution: number; fadingExposure: number; };
export class StructuralDamageScoreService {
  score(metrics: StructuralMetrics, forcePremium = false) {
    const c = (v: number) => Math.max(0, Math.min(100, v));
    const score = Math.round(c(metrics.missingTornArea) * .35 + c(metrics.faceRegionDamage) * .25 + c(metrics.scratchesCracks) * .15 + c(metrics.blurNoise) * .10 + c(metrics.lowResolution) * .10 + c(metrics.fadingExposure) * .05);
    const route: StructuralRoute = forcePremium || metrics.faceRegionDamage >= 80 || metrics.missingTornArea >= 70 ? "premium_only" : score <= 39 ? "standard" : score <= 64 ? "standard_or_premium" : "premium_only";
    return { score, route, components: metrics, ruleVersion: "structural-score/1" };
  }
}
