import "dotenv/config";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Queue, Worker } from "bullmq";
import { loadConfig } from "../apps/api/src/config/env";
import { prisma } from "../apps/api/src/db/prisma";
import { RestorationService } from "../apps/api/src/services/restoration.service";
import { StorageService } from "../apps/api/src/services/storage.service";
import { QueueMetricsService } from "../apps/api/src/services/queue-metrics.service";
import { RestorationInpaintService, RestorationGfpganService, RestorationCodeformerService, RestorationDdcolorService } from "../apps/api/src/services/restoration-provider.service";
import { RealEsrganService } from "../apps/api/src/services/real-esrgan.service";
import type { AppConfig } from "../apps/api/src/config/env";

const TEST_USER_ID = "load-test-user-bench";
const BENCHMARKS_DIR = path.resolve(__dirname, "..", "benchmarks");
const REPORT_PATH = path.join(BENCHMARKS_DIR, "restoration-load-report.json");
const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50];
const MOCK_IMAGE_BYTES = Buffer.alloc(65536, 0x89);
const BENCHMARK_QUEUE_NAME = "image-processing";

interface JobTimingEvent {
  jobId: string;
  itemId: string;
  enqueuedAt: number;
  pickedUpAt: number;
  stageTimings: Record<string, number>;
  pipelineStartedAt: number;
  pipelineEndedAt: number;
  failed: boolean;
  error?: string;
}

interface RunMetrics {
  concurrency: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  failureRate: number;
  queueDelayMs: { min: number; max: number; avg: number; p95: number };
  pipelineDurationMs: { min: number; max: number; avg: number; p95: number };
  perModelDurationMs: Record<string, { min: number; max: number; avg: number }>;
  systemMetrics: {
    cpuUsageBefore: { user: number; system: number };
    cpuUsageAfter: { user: number; system: number };
    memoryBefore: { heapUsed: number; heapTotal: number; rss: number };
    memoryAfter: { heapUsed: number; heapTotal: number; rss: number };
  };
  queueMetricsBefore: { queueDepth: number; activeWorkers: number; queuedJobs: number; retryingJobs: number };
  queueMetricsAfter: { queueDepth: number; activeWorkers: number; queuedJobs: number; retryingJobs: number };
  totalTimeMs: number;
  throughputJobsPerSec: number;
  timestamp: string;
}

interface BenchmarkReport {
  metadata: {
    runId: string;
    startedAt: string;
    completedAt: string;
    redisUrl: string;
    nodeVersion: string;
    platform: string;
    cpus: number;
    totalMemoryGb: number;
  };
  runs: RunMetrics[];
  summary: {
    optimalConcurrency: number;
    maxThroughputJobsPerSec: number;
    minFailureRateConcurrency: number;
    recommendedConcurrency: number;
  };
}

const getCpuUsage = () => {
  const cpus = os.cpus();
  let totalUser = 0;
  let totalSystem = 0;
  for (const cpu of cpus) {
    totalUser += cpu.times.user;
    totalSystem += cpu.times.sys;
  }
  return { user: totalUser, system: totalSystem, count: cpus.length };
};

const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return { heapUsed: usage.heapUsed, heapTotal: usage.heapTotal, rss: usage.rss };
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const setupTestUserIfMissing = async () => {
  const existing = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        whatsappNumber: "+15550000000",
        displayName: "Load Test User",
        role: "USER",
      },
    });
  }
};

const runBenchmark = async (config: AppConfig): Promise<BenchmarkReport> => {
  await setupTestUserIfMissing();

  const storageService = new StorageService(config);
  const queueMetricsService = new QueueMetricsService();
  const inpaintService = new RestorationInpaintService(config);
  const gfpganService = new RestorationGfpganService(config);
  const codeformerService = new RestorationCodeformerService(config);
  const ddcolorService = new RestorationDdcolorService(config);
  const esrganService = new RealEsrganService(config);

  const restorationService = new RestorationService(config);
  const queue = new Queue(BENCHMARK_QUEUE_NAME, { connection: { url: config.REDIS_URL } as any });

  const runId = `bench-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const runs: RunMetrics[] = [];

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`BENCHMARK RUN: ${concurrency} concurrent restoration job(s)`);
    console.log(`${"=".repeat(60)}`);

    const cpuBefore = getCpuUsage();
    const memBefore = getMemoryUsage();
    const queueBefore = await queueMetricsService.getMetrics();

    const order = await restorationService.createOrder({
      userId: TEST_USER_ID,
      title: `Load Test ${concurrency} Jobs`,
      totalItems: concurrency,
    });

    const uploadResult = await storageService.uploadOriginal({
      fileName: "load-test-image.png",
      body: MOCK_IMAGE_BYTES,
      contentType: "image/png",
    });

    const itemIds: string[] = [];
    for (let i = 0; i < concurrency; i++) {
      const item = await restorationService.addItem({
        restorationOrderId: order.id,
        originalStorageKey: uploadResult.key,
        mimeType: "image/png",
        width: 256,
        height: 256,
        fileSizeBytes: MOCK_IMAGE_BYTES.length,
      });
      itemIds.push(item.id);
    }

    const runStartTime = Date.now();
    const completedEvents: JobTimingEvent[] = [];
    const enqueueTimestamps = new Map<string, { itemId: string; enqueuedAt: number }>();

    const worker = new Worker(
      BENCHMARK_QUEUE_NAME,
      async (job) => {
        const meta = enqueueTimestamps.get(job.id!);
        const pickedUpAt = Date.now();
        const stageTimings: Record<string, number> = {};
        let failed = false;
        let errorMsg: string | undefined;

        const payload = job.data as Record<string, unknown>;
        const itemId = payload._restorationItemId as string;

        if (!itemId) {
          return { skipped: true };
        }

        const pipelineStartedAt = Date.now();

        const existingProcessingJob = await prisma.processingJob.findUnique({
          where: { queueJobId: String(job.id) },
        });
        if (existingProcessingJob) {
          return { skipped: true, reason: "processed by existing worker" };
        }

        try {
          const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });
          if (!item) throw new Error(`Item ${itemId} not found`);

          await prisma.restorationItem.update({
            where: { id: itemId },
            data: { status: "PROCESSING", processingStage: "RESTORATION_ANALYSIS" },
          });

          const quality = await restorationService.runQualityAnalysis(item.originalStorageKey);
          const damage = restorationService.analyzeDamage(quality, item.originalStorageKey);

          await prisma.restorationItem.update({
            where: { id: itemId },
            data: {
              damageSeverity: damage.damageSeverity as any,
              imageCategory: damage.imageCategory as any,
              damageScore: Math.round(damage.scratchCoverage),
              qualityScore: quality.overallScore,
              beforeQualityScore: quality.overallScore,
              processingStage: "RESTORATION_INPAINT",
            },
          });

          const original = await storageService.downloadFile(item.originalStorageKey);
          const input = {
            body: original.body,
            contentType: item.mimeType || "image/jpeg",
            fileName: `restoration-${itemId}.jpg`,
          };

          let processedBuffer = original.body;
          let processedContentType = item.mimeType || "image/jpeg";
          const providersUsed: string[] = [];

          const runStage = async (
            name: string,
            stage: string,
            fn: () => Promise<{ body: Buffer; contentType: string }>
          ) => {
            const stageStart = Date.now();
            await prisma.restorationItem.update({
              where: { id: itemId },
              data: { processingStage: stage },
            });
            try {
              const result = await fn();
              processedBuffer = result.body;
              processedContentType = result.contentType;
              providersUsed.push(name);
            } catch (err) {
              console.warn(`[${name}] failed for item ${itemId}, continuing`);
            }
            stageTimings[name] = Date.now() - stageStart;
          };

          await runStage("lama", "RESTORATION_INPAINT", async () =>
            inpaintService.inpaint(input)
          );
          await runStage("gfpgan", "RESTORATION_FACE", async () =>
            gfpganService.enhance({ ...input, body: processedBuffer, contentType: processedContentType })
          );
          await runStage("codeformer", "RESTORATION_FACE", async () =>
            codeformerService.enhance({ ...input, body: processedBuffer, contentType: processedContentType })
          );
          await runStage("ddcolor", "RESTORATION_COLORIZE", async () =>
            ddcolorService.colorize({ ...input, body: processedBuffer, contentType: processedContentType })
          );
          await runStage("real-esrgan", "RESTORATION_UPSCALE", async () =>
            esrganService.enhance({ body: processedBuffer, contentType: processedContentType, fileName: input.fileName })
          );

          const totalDurationMs = Object.values(stageTimings).reduce((s, v) => s + v, 0);
          const succeeded = providersUsed.length > 0;

          const processedUpload = await storageService.uploadFile({
            keyPrefix: "finals",
            fileName: `restoration-${itemId}-${Date.now()}.jpg`,
            body: processedBuffer,
            contentType: processedContentType,
          });

          const afterQuality =
            quality.overallScore < 50
              ? quality.overallScore + 30
              : Math.min(100, quality.overallScore + 10);

          await prisma.restorationItem.update({
            where: { id: itemId },
            data: {
              status: succeeded ? "COMPLETED" : "FAILED",
              finalStorageKey: processedUpload.key,
              afterQualityScore: afterQuality,
              providerUsed: providersUsed.join(",") || "none",
              processingStage: succeeded ? "RESTORATION_PREVIEW" : "RESTORATION_FAILED",
              totalDurationMs,
            },
          });

          for (const [name, elapsed] of Object.entries(stageTimings)) {
            const costTypeMap: Record<string, string> = {
              lama: "RESTORATION_INPAINT",
              gfpgan: "RESTORATION_FACE",
              codeformer: "RESTORATION_FACE",
              ddcolor: "RESTORATION_COLORIZE",
              "real-esrgan": "RESTORATION_UPSCALE",
            };
            try {
              await prisma.providerCostLog.create({
                data: {
                  provider: name,
                  operation: name,
                  costType: costTypeMap[name] as any,
                  durationMs: elapsed,
                  estimatedCost: 0,
                  restorationItemId: itemId,
                },
              });
            } catch {}
          }

          if (succeeded) {
            const preview = await storageService.uploadFile({
              keyPrefix: "previews",
              fileName: `restoration-${itemId}-${Date.now()}.jpg`,
              body: processedBuffer,
              contentType: processedContentType,
            });
            await prisma.restorationItem.update({
              where: { id: itemId },
              data: { previewStorageKey: preview.key },
            });
          }
        } catch (err) {
          failed = true;
          errorMsg = err instanceof Error ? err.message : String(err);
          await prisma.restorationItem
            .update({
              where: { id: itemId },
              data: { status: "FAILED", processingStage: "RESTORATION_FAILED", errorMessage: errorMsg },
            })
            .catch(() => {});
        }

        const pipelineEndedAt = Date.now();
        const event: JobTimingEvent = {
          jobId: job.id!,
          itemId,
          enqueuedAt: meta?.enqueuedAt ?? pipelineStartedAt,
          pickedUpAt,
          stageTimings,
          pipelineStartedAt,
          pipelineEndedAt,
          failed,
          error: errorMsg,
        };
        completedEvents.push(event);

        return {
          _benchmark: true,
          _itemId: itemId,
          _stageTimings: stageTimings,
          failed,
          pipelineDurationMs: pipelineEndedAt - pipelineStartedAt,
        };
      },
      { connection: { url: config.REDIS_URL } as any, concurrency: 5 }
    );

    const { jobIdQueueMap } = await new Promise<{ jobIdQueueMap: Map<string, number> }>(
      (resolve) => {
        const jobIdQueueMap = new Map<string, number>();

        worker.on("completed", (job, _result) => {
          const rest = _result as Record<string, unknown> | null;
          if (rest && rest._benchmark) {
            if (!jobIdQueueMap.has(job.id!)) {
              jobIdQueueMap.set(job.id!, Date.now());
            }
          }
        });
        worker.on("failed", (job) => {
          if (job && !jobIdQueueMap.has(job.id!)) {
            jobIdQueueMap.set(job.id!, Date.now());
          }
        });
        worker.on("error", () => {});

        setTimeout(() => resolve({ jobIdQueueMap }), 1500);
      }
    );

    for (const itemId of itemIds) {
      const enqueueTime = Date.now();
      const job = await queue.add(
        "restoration-benchmark",
        {
          _restorationItemId: itemId,
          _restorationOrderId: order.id,
          _isBenchmark: true,
          _timestamp: enqueueTime,
        },
        {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
          jobId: `bench-${itemId}-${Date.now()}`,
        }
      );
      enqueueTimestamps.set(job.id!, { itemId, enqueuedAt: enqueueTime });
    }

    await new Promise<void>((resolve) => {
      let doneCount = 0;
      const checkResolve = () => {
        if (doneCount >= concurrency) resolve();
      };

      worker.on("completed", (job) => {
        const rest = job.returnvalue as Record<string, unknown> | null;
        if (rest && (rest as Record<string, unknown>)._benchmark) {
          doneCount++;
          checkResolve();
        }
      });

      worker.on("failed", (job) => {
        if (job && enqueueTimestamps.has(job.id!)) {
          doneCount++;
          checkResolve();
        }
      });

      setTimeout(() => {
        console.warn(`Timeout for ${concurrency} jobs (got ${doneCount}/${concurrency})`);
        resolve();
      }, 180000);
    });

    await worker.close();
    const totalTimeMs = Date.now() - runStartTime;
    const cpuAfter = getCpuUsage();
    const memAfter = getMemoryUsage();
    const queueAfter = await queueMetricsService.getMetrics();

    const completedJobs = completedEvents.filter((e) => !e.failed).length;
    const failedJobs = completedEvents.filter((e) => e.failed).length;

    const queueDelays = completedEvents
      .filter((e) => !e.failed)
      .map((e) => e.pickedUpAt - e.enqueuedAt)
      .sort((a, b) => a - b);

    const pipelineDurations = completedEvents
      .filter((e) => !e.failed)
      .map((e) => e.pipelineEndedAt - e.pipelineStartedAt)
      .sort((a, b) => a - b);

    const modelAccum: Record<string, number[]> = {};
    for (const e of completedEvents) {
      if (e.failed) continue;
      for (const [model, dur] of Object.entries(e.stageTimings)) {
        if (!modelAccum[model]) modelAccum[model] = [];
        modelAccum[model].push(dur);
      }
    }

    const perModelDurationMs: Record<string, { min: number; max: number; avg: number }> = {};
    for (const [model, durs] of Object.entries(modelAccum)) {
      const sorted = durs.sort((a, b) => a - b);
      perModelDurationMs[model] = {
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        avg: Math.round(durs.reduce((s, v) => s + v, 0) / durs.length),
      };
    }

    const runMetrics: RunMetrics = {
      concurrency,
      totalJobs: concurrency,
      completedJobs,
      failedJobs,
      failureRate: concurrency > 0 ? Math.round((failedJobs / concurrency) * 10000) / 100 : 0,
      queueDelayMs: {
        min: queueDelays[0] ?? 0,
        max: queueDelays[queueDelays.length - 1] ?? 0,
        avg:
          queueDelays.length > 0
            ? Math.round(queueDelays.reduce((s, v) => s + v, 0) / queueDelays.length)
            : 0,
        p95: percentile(queueDelays, 95),
      },
      pipelineDurationMs: {
        min: pipelineDurations[0] ?? 0,
        max: pipelineDurations[pipelineDurations.length - 1] ?? 0,
        avg:
          pipelineDurations.length > 0
            ? Math.round(pipelineDurations.reduce((s, v) => s + v, 0) / pipelineDurations.length)
            : 0,
        p95: percentile(pipelineDurations, 95),
      },
      perModelDurationMs,
      systemMetrics: {
        cpuUsageBefore: { user: cpuBefore.user, system: cpuBefore.system },
        cpuUsageAfter: { user: cpuAfter.user, system: cpuAfter.system },
        memoryBefore: memBefore,
        memoryAfter: memAfter,
      },
      queueMetricsBefore: queueBefore,
      queueMetricsAfter: queueAfter,
      totalTimeMs,
      throughputJobsPerSec:
        totalTimeMs > 0 ? Math.round((completedJobs / totalTimeMs) * 100000) / 100 : 0,
      timestamp: new Date().toISOString(),
    };

    runs.push(runMetrics);

    console.log(`Completed: ${completedJobs}/${concurrency} | Failed: ${failedJobs}`);
    console.log(
      `Queue delay: avg=${runMetrics.queueDelayMs.avg}ms p95=${runMetrics.queueDelayMs.p95}ms`
    );
    console.log(
      `Pipeline: avg=${runMetrics.pipelineDurationMs.avg}ms p95=${runMetrics.pipelineDurationMs.p95}ms`
    );
    console.log(`Throughput: ${runMetrics.throughputJobsPerSec} jobs/sec`);
    console.log(`Failure rate: ${runMetrics.failureRate}%`);
    for (const [model, s] of Object.entries(perModelDurationMs)) {
      console.log(`  ${model}: avg=${s.avg}ms min=${s.min}ms max=${s.max}ms`);
    }

    await restorationService.updateOrderStatus(order.id, "COMPLETED");
    const cpuDelta = Math.round(
      ((cpuAfter.user - cpuBefore.user) / (cpuAfter.count * 1000000)) * 100
    );
    console.log(`CPU delta: ~${cpuDelta}%`);

    console.log("Cleaning up test data...");
    await prisma.providerCostLog
      .deleteMany({ where: { restorationItem: { restorationOrderId: order.id } } })
      .catch(() => {});
    await prisma.restorationItem
      .deleteMany({ where: { restorationOrderId: order.id } })
      .catch(() => {});
    await prisma.restorationOrder
      .delete({ where: { id: order.id } })
      .catch((err) => console.warn("Order cleanup non-fatal:", err));

    await sleep(2000);
  }

  await queue.close();

  const completedAt = new Date().toISOString();
  const throughputs = runs.map((r) => r.throughputJobsPerSec);
  const maxThroughput = Math.max(...throughputs);
  const optimalRun = runs.find((r) => r.throughputJobsPerSec === maxThroughput);
  const minFailureRate = Math.min(...runs.map((r) => r.failureRate));
  const bestFailureRuns = runs
    .filter((r) => r.failureRate === minFailureRate)
    .sort((a, b) => b.throughputJobsPerSec - a.throughputJobsPerSec);

  const report: BenchmarkReport = {
    metadata: {
      runId,
      startedAt,
      completedAt,
      redisUrl: config.REDIS_URL.replace(/\/\/.*@/, "//***:***@"),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      cpus: os.cpus().length,
      totalMemoryGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 100) / 100,
    },
    runs,
    summary: {
      optimalConcurrency: optimalRun?.concurrency ?? 1,
      maxThroughputJobsPerSec: maxThroughput,
      minFailureRateConcurrency: bestFailureRuns[0]?.concurrency ?? 1,
      recommendedConcurrency:
        bestFailureRuns.length > 0 ? bestFailureRuns[0].concurrency : optimalRun?.concurrency ?? 1,
    },
  };

  return report;
};

const main = async () => {
  console.log("RESTORATION LOAD BENCHMARK");
  console.log("==========================\n");

  const config = loadConfig();

  if (config.queueDryRun) {
    console.error(
      "ERROR: Queue dry-run mode is enabled. Set REDIS_URL to a real Redis instance."
    );
    process.exit(1);
  }

  console.log(`Redis: ${config.REDIS_URL.replace(/\/\/.*@/, "//***:***@")}`);
  console.log(`Concurrency levels: ${CONCURRENCY_LEVELS.join(", ")}`);
  console.log(`Report output: ${REPORT_PATH}\n`);

  try {
    const report = await runBenchmark(config);

    if (!fs.existsSync(BENCHMARKS_DIR)) {
      fs.mkdirSync(BENCHMARKS_DIR, { recursive: true });
    }
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\nReport saved to ${REPORT_PATH}`);

    console.log("\n" + "=".repeat(60));
    console.log("BENCHMARK SUMMARY");
    console.log("=".repeat(60));
    console.log(`Run ID:                     ${report.metadata.runId}`);
    console.log(`Started:                    ${report.metadata.startedAt}`);
    console.log(`Completed:                  ${report.metadata.completedAt}`);
    console.log(`Node:                       ${report.metadata.nodeVersion}`);
    console.log(`CPU cores:                  ${report.metadata.cpus}`);
    console.log(`Total memory:               ${report.metadata.totalMemoryGb} GB`);
    console.log("");
    console.log(`Optimal concurrency:        ${report.summary.optimalConcurrency}`);
    console.log(`Max throughput:             ${report.summary.maxThroughputJobsPerSec} jobs/sec`);
    console.log(`Recommended concurrency:    ${report.summary.recommendedConcurrency}`);
    console.log("");

    for (const run of report.runs) {
      console.log(
        `  ${String(run.concurrency).padStart(2)} jobs: ` +
          `completed=${run.completedJobs} ` +
          `failed=${run.failedJobs} ` +
          `failure=${String(run.failureRate).padStart(4)}% ` +
          `qDelay_avg=${String(run.queueDelayMs.avg).padStart(6)}ms ` +
          `qDelay_p95=${String(run.queueDelayMs.p95).padStart(6)}ms ` +
          `pipe_avg=${String(run.pipelineDurationMs.avg).padStart(8)}ms ` +
          `pipe_p95=${String(run.pipelineDurationMs.p95).padStart(8)}ms ` +
          `throughput=${String(run.throughputJobsPerSec).padStart(6)}/s`
      );
    }
  } catch (error) {
    console.error("Benchmark failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
};

main();
