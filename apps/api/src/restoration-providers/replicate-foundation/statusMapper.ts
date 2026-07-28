import type { ReplicateInternalStatus, ReplicatePrediction, ReplicatePredictionStatus } from "./types";

export const mapReplicateStatus = (status: string | undefined | null): ReplicatePredictionStatus => {
  switch (status) {
    case "starting":
    case "processing":
    case "succeeded":
    case "failed":
    case "canceled":
      return status;
    default:
      return "unknown";
  }
};

export const mapReplicateInternalStatus = (status: string | undefined | null): ReplicateInternalStatus => {
  switch (mapReplicateStatus(status)) {
    case "starting":
      return "queued";
    case "processing":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    case "unknown":
    default:
      return "verification_required";
  }
};

export const isTerminalPrediction = (prediction: ReplicatePrediction): boolean =>
  prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled";

