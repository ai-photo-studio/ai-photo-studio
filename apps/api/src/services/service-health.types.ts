export type ServiceHealthStatus = "ok" | "unconfigured" | "error";

export type ServiceHealth = {
  healthy: boolean;
  status: ServiceHealthStatus;
  endpoint?: string;
  message?: string;
  statusCode?: number;
  checkedAt: string;
};
