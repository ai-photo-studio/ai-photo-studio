import type { VehicleWorkflowMode } from "../providers/provider.interface";

export const DEFAULT_VEHICLE_WORKFLOW_MODE: VehicleWorkflowMode = "SHOWROOM";

export const resolveVehicleWorkflowMode = (hint?: string | null): VehicleWorkflowMode => {
  const normalized = (hint || "").trim().toUpperCase();

  if (normalized.includes("PLATE")) return "PLATE_BLUR";
  if (normalized.includes("DARK")) return "DARK_STUDIO";
  if (normalized.includes("ROAD")) return "PREMIUM_ROAD";
  if (normalized.includes("PREMIUM")) return "PREMIUM_ROAD";
  if (normalized.includes("SHOWROOM")) return "SHOWROOM";

  return DEFAULT_VEHICLE_WORKFLOW_MODE;
};
