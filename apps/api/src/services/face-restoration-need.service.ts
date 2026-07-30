export type FaceRoute = "skip" | "conservative_candidate" | "guarded_candidate" | "manual_review";
export type FaceMetrics = { blur: number; pixelSize: number; noise: number; damageInsideFace: number; landmarkConfidence: number; exposureContrast: number; };
export type FaceDecision = { score: number; route: FaceRoute; components: FaceMetrics; ruleVersion: string; };
export type FaceValidation = { identitySimilarity: number; landmarkSimilarity: number; sharpnessImprovement: number; artifactIncrease: number; accepted: boolean; };

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** Offline-only scoring contract. It is intentionally not connected to GFPGAN while the gate flag is false. */
export class FaceRestorationNeedService {
  score(metrics: FaceMetrics, thresholds = { skip: 29, conservative: 59, guarded: 79 }): FaceDecision {
    const score = Math.round(clamp(metrics.blur) * .30 + clamp(metrics.pixelSize) * .20 + clamp(metrics.noise) * .15 + clamp(metrics.damageInsideFace) * .20 + (100 - clamp(metrics.landmarkConfidence)) * .10 + clamp(metrics.exposureContrast) * .05);
    const route: FaceRoute = score <= thresholds.skip ? "skip" : score <= thresholds.conservative ? "conservative_candidate" : score <= thresholds.guarded ? "guarded_candidate" : "manual_review";
    return { score, route, components: metrics, ruleVersion: "face-gate/1" };
  }

  validate(validation: Omit<FaceValidation, "accepted">): FaceValidation {
    return { ...validation, accepted: validation.identitySimilarity >= .92 && validation.landmarkSimilarity >= .95 && validation.sharpnessImprovement > 0 && validation.artifactIncrease <= 0 };
  }
}
