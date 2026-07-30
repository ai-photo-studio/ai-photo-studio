export type PremiumProviderCandidate = "gpt-image-2" | "nano-banana-pro" | "seedream-5-pro";
export interface PremiumRestorationRequest { original: Buffer; mask: Buffer; preservationInstruction: string; provider: PremiumProviderCandidate; outputFormat: "png" | "jpeg" | "webp"; idempotencyKey: string; }
export interface PremiumQualityScores { identitySimilarity: number; landmarkSimilarity: number; unchangedAreaPreservation: number; maskCompletion: number; artifactScore: number; ageExpressionConsistency: number; validImage: boolean; }
/** Benchmark-only. This interface is separate from Standard and never imports legacy unified restoration. */
export interface IPremiumRestorationPipeline { run(request: PremiumRestorationRequest): Promise<{ image: Buffer; contentType: string; quality: PremiumQualityScores }>; }
