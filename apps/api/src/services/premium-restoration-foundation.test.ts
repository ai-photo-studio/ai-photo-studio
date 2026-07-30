import { StructuralDamageScoreService } from "./structural-damage-score.service";
import { acceptPremiumCandidate, canStartPremiumProcessing } from "./premium-restoration-gate.service";
const score = new StructuralDamageScoreService(); const base = { missingTornArea: 0, faceRegionDamage: 0, scratchesCracks: 0, blurNoise: 0, lowResolution: 0, fadingExposure: 0 };
if (score.score(base).route !== "standard") throw new Error("light must use standard");
if (score.score({ ...base, missingTornArea: 100, faceRegionDamage: 80 }).route !== "premium_only") throw new Error("severe tear must be premium");
if (canStartPremiumProcessing(false, true) || !canStartPremiumProcessing(true, true)) throw new Error("payment gate failed");
if (acceptPremiumCandidate({ identitySimilarity:.8, landmarkSimilarity:1, unchangedAreaPreservation:1, maskCompletion:1, artifactScore:0, ageExpressionConsistency:1, validImage:true })) throw new Error("failed candidate must reject");
console.log("premium restoration foundation tests passed");
