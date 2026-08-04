import type { RestorationRequest } from "../interfaces/IRestorationProvider";
import type { ProviderExecutionPort } from "./RestorationExecutionPorts";
import type { PipelineResult, PipelineTier } from "./PipelineOrchestrator";
import { logProviderSelection } from "./ProviderNeutralContracts";

/**
 * The only restoration provider selections this API knows about.
 *
 * R9.2: Replicate is the sole reachable production provider. `"mock"` is the
 * local/dry-run seam and routes to the same Replicate/PipelineOrchestrator
 * executor. There is deliberately NO third provider member: no external GPU
 * vendor routing, endpoint, secondary dispatch, or activation path exists in
 * the release path, not even conditionally or disabled-by-default. Anything
 * else is a hard error.
 */
export type RestorationProviderSelection = "replicate" | "mock";

export class InvalidProviderSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProviderSelectionError";
  }
}

export interface RestorationProviderRouterDeps {
  /** Mirrors AppConfig.restorationProvider. */
  selection: RestorationProviderSelection;
  /** The current, unchanged Replicate/replay/dry-run seam (PipelineOrchestratorProviderExecutor in production). */
  replicateExecutor: ProviderExecutionPort;
}

/**
 * The only place that decides which restoration provider executes. This is an
 * exhaustive switch over exactly two values; any other runtime value (a bad
 * env var, a bypassed type, a future typo) is rejected before the executor is
 * touched — it is never silently treated as Replicate.
 *
 * There is no secondary provider and no retry-on-another-provider behaviour
 * anywhere in this class. A Replicate dispatch failure propagates to the
 * caller unchanged.
 */
export class RestorationProviderRouter implements ProviderExecutionPort {
  constructor(private readonly deps: RestorationProviderRouterDeps) {}

  async execute(request: RestorationRequest, tier: PipelineTier): Promise<PipelineResult> {
    logProviderSelection({ selection: this.deps.selection, itemId: request.options?.itemId, orderId: request.options?.orderId });

    switch (this.deps.selection) {
      case "replicate":
      case "mock":
        return this.deps.replicateExecutor.execute(request, tier);

      default: {
        // Exhaustiveness: if RestorationProviderSelection ever gains a new
        // member without a case above, this line fails to compile. At
        // runtime (a value that bypassed the type, e.g. from `as any`),
        // this still throws instead of silently choosing a provider.
        const unexpected: never = this.deps.selection;
        throw new InvalidProviderSelectionError(`Unsupported restoration provider selection: ${String(unexpected)}`);
      }
    }
  }
}
