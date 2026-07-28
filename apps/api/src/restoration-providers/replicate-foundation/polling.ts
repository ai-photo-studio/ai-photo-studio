import type { ReplicatePollingOptions, ReplicateProviderContract, ReplicatePrediction } from "./types";
import { isTerminalPrediction } from "./statusMapper";
import { mapReplicateInternalStatus } from "./statusMapper";

export class ReplicatePollingService {
  constructor(private readonly provider: Pick<ReplicateProviderContract, "getPrediction">) {}

  async poll(predictionId: string, options: ReplicatePollingOptions = {}): Promise<ReplicatePrediction> {
    const intervalMs = options.intervalMs ?? 1000;
    const timeoutMs = options.timeoutMs ?? 60000;
    const maxAttempts = options.maxAttempts ?? Math.max(1, Math.ceil(timeoutMs / intervalMs));
    const deadline = Date.now() + timeoutMs;

    let attempt = 0;
    while (Date.now() < deadline && attempt < maxAttempts) {
      const prediction = await this.provider.getPrediction(predictionId);
      const internalStatus = mapReplicateInternalStatus(prediction.status);
      options.onStatus?.(prediction, internalStatus);

      if (isTerminalPrediction(prediction)) {
        return prediction;
      }

      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const finalPrediction = await this.provider.getPrediction(predictionId);
    if (isTerminalPrediction(finalPrediction)) {
      return finalPrediction;
    }

    throw new Error(`Replicate prediction polling timed out for ${predictionId}`);
  }
}

