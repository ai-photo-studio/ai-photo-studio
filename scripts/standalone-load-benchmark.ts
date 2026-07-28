import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50];
const REPORT_PATH = path.resolve(__dirname, "..", "benchmarks", "restoration-load-report.json");

interface StageTiming {
  lama: number;
  gfpgan: number;
  codeformer: number;
  ddcolor: number;
  "real-esrgan": number;
}

interface JobResult {
  concurrency: number;
  index: number;
  queueDelayMs: number;
  pipelineDurationMs: number;
  stageTimings: StageTiming;
  failed: boolean;
}

interface RunResult {
  concurrency: number;
  completedJobs: number;
  failedJobs: number;
  failureRate: number;
  queueDelayMs: { avg: number; min: number; max: number; p50: number; p95: number };
  pipelineDurationMs: { avg: number; min: number; max: number; p50: number; p95: number };
  stageTimings: { [K in keyof StageTiming]: { avg: number; min: number; max: number; p95: number } };
  totalDurationMs: number;
  throughputJobsPerSec: number;
}

interface LoadReport {
  metadata: {
    runId: string;
    startedAt: string;
    completedAt: string;
    nodeVersion: string;
    platform: string;
    cpus: number;
    totalMemoryGb: string;
    freeMemoryGb: string;
  };
  runs: RunResult[];
  summary: {
    optimalConcurrency: number;
    maxThroughputJobsPerSec: number;
    recommendedConcurrency: number;
  };
}

const randomBuffer = (size: number) => {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 7919 + 104729) & 0xff;
  return buf;
};

const simulateStage = async (name: string, durationMs: number): Promise<Buffer> => {
  return new Promise((resolve) => {
    const start = Date.now();
    const buf = randomBuffer(1024);
    const work = () => {
      if (Date.now() - start >= durationMs) {
        resolve(buf);
        return;
      }
      setImmediate(work);
    };
    setImmediate(work);
  });
};

const simulateFullPipeline = async (stageTimings: StageTiming): Promise<Buffer> => {
  let result = randomBuffer(1024);
  result = await simulateStage("lama", stageTimings.lama);
  result = await simulateStage("gfpgan", stageTimings.gfpgan);
  result = await simulateStage("codeformer", stageTimings.codeformer);
  result = await simulateStage("ddcolor", stageTimings.ddcolor);
  result = await simulateStage("real-esrgan", stageTimings["real-esrgan"]);
  return result;
};

const runSingleConcurrency = async (concurrency: number): Promise<RunResult> => {
  const jobs: JobResult[] = [];
  const totalStart = Date.now();

  const stageTimingsTemplate: StageTiming = {
    lama: 120 + Math.random() * 80,
    gfpgan: 200 + Math.random() * 100,
    codeformer: 250 + Math.random() * 150,
    ddcolor: 150 + Math.random() * 50,
    "real-esrgan": 100 + Math.random() * 60,
  };

  const enqueueAllStart = Date.now();
  const enqueueTimes: number[] = [];

  const batchSize = concurrency;
  for (let i = 0; i < batchSize; i++) {
    const simulatedQueueWait = Math.random() * 200 + 50;
    enqueueTimes.push(simulatedQueueWait);
  }
  const enqueueEnd = Date.now();

  const processJob = async (index: number): Promise<JobResult> => {
    const queueDelayMs = enqueueTimes[index];
    const pipelineStart = Date.now();

    const timings: StageTiming = {
      lama: stageTimingsTemplate.lama + (Math.random() - 0.5) * 40,
      gfpgan: stageTimingsTemplate.gfpgan + (Math.random() - 0.5) * 40,
      codeformer: stageTimingsTemplate.codeformer + (Math.random() - 0.5) * 60,
      ddcolor: stageTimingsTemplate.ddcolor + (Math.random() - 0.5) * 20,
      "real-esrgan": stageTimingsTemplate["real-esrgan"] + (Math.random() - 0.5) * 20,
    };

    try {
      await simulateFullPipeline(timings);
      const pipelineDurationMs = Date.now() - pipelineStart;
      return { concurrency, index, queueDelayMs, pipelineDurationMs, stageTimings: timings, failed: false };
    } catch {
      return { concurrency, index, queueDelayMs, pipelineDurationMs: Date.now() - pipelineStart, stageTimings: timings, failed: true };
    }
  };

  const pool: Promise<JobResult>[] = [];
  for (let i = 0; i < batchSize; i++) {
    pool.push(processJob(i));
  }

  const results = await Promise.all(pool);
  jobs.push(...results);

  const totalDurationMs = Date.now() - totalStart;
  const completedJobs = jobs.filter((j) => !j.failed).length;
  const failedJobs = jobs.filter((j) => j.failed).length;
  const failureRate = Math.round((failedJobs / jobs.length) * 100);

  const sortedQueueDelay = [...jobs.map((j) => j.queueDelayMs)].sort((a, b) => a - b);
  const sortedPipeline = [...jobs.map((j) => j.pipelineDurationMs)].sort((a, b) => a - b);

  const percentile = (sorted: number[], p: number) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  };

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const buildStageStats = (key: keyof StageTiming) => {
    const vals = jobs.map((j) => j.stageTimings[key]).sort((a, b) => a - b);
    return { avg: avg(vals), min: Math.round(vals[0]), max: Math.round(vals[vals.length - 1]), p95: Math.round(percentile(vals, 95)) };
  };

  return {
    concurrency,
    completedJobs,
    failedJobs,
    failureRate,
    queueDelayMs: {
      avg: avg(sortedQueueDelay),
      min: Math.round(sortedQueueDelay[0]),
      max: Math.round(sortedQueueDelay[sortedQueueDelay.length - 1]),
      p50: Math.round(percentile(sortedQueueDelay, 50)),
      p95: Math.round(percentile(sortedQueueDelay, 95)),
    },
    pipelineDurationMs: {
      avg: avg(sortedPipeline),
      min: Math.round(sortedPipeline[0]),
      max: Math.round(sortedPipeline[sortedPipeline.length - 1]),
      p50: Math.round(percentile(sortedPipeline, 50)),
      p95: Math.round(percentile(sortedPipeline, 95)),
    },
    stageTimings: {
      lama: buildStageStats("lama"),
      gfpgan: buildStageStats("gfpgan"),
      codeformer: buildStageStats("codeformer"),
      ddcolor: buildStageStats("ddcolor"),
      "real-esrgan": buildStageStats("real-esrgan"),
    },
    totalDurationMs,
    throughputJobsPerSec: Math.round((completedJobs / totalDurationMs) * 1000 * 100) / 100,
  };
};

const main = async () => {
  console.log("RESTORATION LOAD BENCHMARK (Standalone)");
  console.log("========================================\n");

  const startedAt = new Date().toISOString();
  const runId = `bench-${Date.now().toString(36)}`;

  const results: RunResult[] = [];

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`\n--- Running ${concurrency} concurrent job(s) ---`);
    const start = Date.now();
    const result = await runSingleConcurrency(concurrency);
    const elapsed = Date.now() - start;
    results.push(result);

    console.log(`  Completed: ${result.completedJobs}, Failed: ${result.failedJobs}`);
    console.log(`  Failure rate: ${result.failureRate}%`);
    console.log(`  Queue delay avg: ${result.queueDelayMs.avg}ms, p95: ${result.queueDelayMs.p95}ms`);
    console.log(`  Pipeline duration avg: ${result.pipelineDurationMs.avg}ms, p95: ${result.pipelineDurationMs.p95}ms`);
    console.log(`  Throughput: ${result.throughputJobsPerSec} jobs/sec`);
    console.log(`  Run duration: ${elapsed}ms`);
    console.log(`  Stage timings (avg) - Lama: ${result.stageTimings.lama.avg}ms, GFPGAN: ${result.stageTimings.gfpgan.avg}ms, CodeFormer: ${result.stageTimings.codeformer.avg}ms, DDColor: ${result.stageTimings.ddcolor.avg}ms, ESRGAN: ${result.stageTimings["real-esrgan"].avg}ms`);
  }

  const optimalRun = [...results].sort((a, b) => b.throughputJobsPerSec - a.throughputJobsPerSec)[0];
  const maxThroughput = Math.max(...results.map((r) => r.throughputJobsPerSec));
  const bestFailureRuns = results.filter((r) => r.failureRate === 0);

  const report: LoadReport = {
    metadata: {
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      cpus: os.cpus().length,
      totalMemoryGb: (os.totalmem() / 1073741824).toFixed(2),
      freeMemoryGb: (os.freemem() / 1073741824).toFixed(2),
    },
    runs: results,
    summary: {
      optimalConcurrency: optimalRun?.concurrency ?? 1,
      maxThroughputJobsPerSec: maxThroughput,
      recommendedConcurrency: bestFailureRuns.length > 0
        ? bestFailureRuns.reduce((a, b) => (b.throughputJobsPerSec > a.throughputJobsPerSec ? b : a)).concurrency
        : optimalRun?.concurrency ?? 1,
    },
  };

  if (!fs.existsSync(path.dirname(REPORT_PATH))) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(60));
  console.log(`Run ID:                     ${report.metadata.runId}`);
  console.log(`Started:                    ${report.metadata.startedAt}`);
  console.log(`Completed:                  ${report.metadata.completedAt}`);
  console.log(`Node:                       ${report.metadata.nodeVersion}`);
  console.log(`CPU cores:                  ${report.metadata.cpus}`);
  console.log(`Total memory:               ${report.metadata.totalMemoryGb} GB`);
  console.log(`Free memory:                ${report.metadata.freeMemoryGb} GB`);
  console.log("");
  console.log(`Optimal concurrency:        ${report.summary.optimalConcurrency}`);
  console.log(`Max throughput:             ${report.summary.maxThroughputJobsPerSec} jobs/sec`);
  console.log(`Recommended concurrency:    ${report.summary.recommendedConcurrency}`);
  console.log("");
  console.log("Concurrency | Completed | Failed | Failure% | QueueDelay(avg/p95)  | Pipeline(avg/p95)    | Throughput");
  console.log("-".repeat(110));
  for (const run of results) {
    console.log(
      `  ${String(run.concurrency).padStart(3)}       | ${String(run.completedJobs).padStart(8)} | ${String(run.failedJobs).padStart(5)} | ${String(run.failureRate).padStart(6)}%   | ${String(run.queueDelayMs.avg).padStart(6)}/${String(run.queueDelayMs.p95).padStart(6)}ms    | ${String(run.pipelineDurationMs.avg).padStart(7)}/${String(run.pipelineDurationMs.p95).padStart(7)}ms   | ${String(run.throughputJobsPerSec).padStart(7)}/s`
    );
  }
  console.log(`\nReport saved to ${REPORT_PATH}`);
};

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
