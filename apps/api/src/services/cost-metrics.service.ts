import { prisma } from "../db/prisma";
import type { ProviderCostType } from "@prisma/client";

export type CostMetrics = {
  totalEstimatedCost: number;
  totalActualCost: number;
  costByProvider: Record<string, number>;
  creditConsumption: number;
};

export class CostMetricsService {
  async getMetrics(hoursBack = 24): Promise<CostMetrics> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [providerCostLogs, providerBreakdown] = await Promise.all([
      prisma.providerCostLog.findMany({
        where: { createdAt: { gte: since } }
      }),
      prisma.providerCostLog.groupBy({
        by: ["provider"],
        where: { createdAt: { gte: since } },
        _sum: { estimatedCost: true, actualCost: true }
      })
    ]);

    const totalEstimatedCost = providerCostLogs.reduce((sum, log) => sum + Number(log.estimatedCost), 0);
    const totalActualCost = providerCostLogs.reduce((sum, log) => sum + (Number(log.actualCost) || 0), 0);
    const creditConsumption = providerCostLogs
      .filter((log) => log.costType === "FLAT_LAY" || log.costType === "LIFESTYLE_SCENE" || log.costType === "VIRTUAL_MODEL" || log.costType === "VIDEO_GENERATION")
      .reduce((sum, log) => sum + 1, 0);

    const costByProvider: Record<string, number> = {};
    for (const row of providerBreakdown) {
      costByProvider[row.provider] = Number(row._sum.estimatedCost || 0);
    }

    return {
      totalEstimatedCost,
      totalActualCost,
      costByProvider,
      creditConsumption
    };
  }

  async getCreativeCostMetrics(hoursBack = 24): Promise<{
    flatLayCost: number;
    lifestyleCost: number;
    virtualModelCost: number;
    videoCost: number;
    totalCreativeCost: number;
  }> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [flatLayLogs, lifestyleLogs, virtualModelLogs, videoLogs] = await Promise.all([
      prisma.providerCostLog.findMany({ where: { createdAt: { gte: since }, costType: "FLAT_LAY" } }),
      prisma.providerCostLog.findMany({ where: { createdAt: { gte: since }, costType: "LIFESTYLE_SCENE" } }),
      prisma.providerCostLog.findMany({ where: { createdAt: { gte: since }, costType: "VIRTUAL_MODEL" } }),
      prisma.providerCostLog.findMany({ where: { createdAt: { gte: since }, costType: "VIDEO_GENERATION" } })
    ]);

    const flatLayCost = flatLayLogs.reduce((sum, log) => sum + Number(log.actualCost || log.estimatedCost), 0);
    const lifestyleCost = lifestyleLogs.reduce((sum, log) => sum + Number(log.actualCost || log.estimatedCost), 0);
    const virtualModelCost = virtualModelLogs.reduce((sum, log) => sum + Number(log.actualCost || log.estimatedCost), 0);
    const videoCost = videoLogs.reduce((sum, log) => sum + Number(log.actualCost || log.estimatedCost), 0);

    return {
      flatLayCost,
      lifestyleCost,
      virtualModelCost,
      videoCost,
      totalCreativeCost: flatLayCost + lifestyleCost + virtualModelCost + videoCost
    };
  }
}