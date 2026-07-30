import type { PremiumQualityScores } from "../restoration-providers/interfaces/IPremiumRestorationPipeline";
export const canStartPremiumProcessing = (paymentConfirmed: boolean, premiumSelected: boolean) => paymentConfirmed && premiumSelected;
export const acceptPremiumCandidate = (q: PremiumQualityScores) => q.validImage && q.identitySimilarity >= .92 && q.landmarkSimilarity >= .95 && q.unchangedAreaPreservation >= .95 && q.maskCompletion >= .8 && q.artifactScore <= .1 && q.ageExpressionConsistency >= .9;
