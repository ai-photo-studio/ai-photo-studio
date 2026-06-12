import { Queue, Worker } from "bullmq";
import type { AppConfig } from "../apps/api/src/config/env";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = { url: REDIS_URL };

const config = {
  REDIS_URL,
  queueDryRun: false,
  aiProvider: "mock",
  deliveryMode: "LOG_ONLY"
} as any;

async function runLoadTest(jobCount: number) {
  console.log(`\n=== SYNTHETIC LOAD TEST: ${jobCount} jobs ===`);
  const queue = new Queue("image-processing-load-test", { connection });
  const startTime = Date.now();
  const jobIds: string[] = [];

  for (let i = 0; i < jobCount; i++) {
    const job = await queue.add("test-load", {
      index: i,
      timestamp: Date.now(),
      simulated: true
    }, {
      attempts: 3,
      backoff: { type: "fixed", delay: 100 }
    });
    jobIds.push(job.id!);
  }

  const enqueueTime = Date.now() - startTime;
  console.log(`Enqueue ${jobCount} jobs: ${enqueueTime}ms (${(enqueueTime / jobCount).toFixed(2)}ms/job)`);

  let completed = 0;
  let failed = 0;
  const latencies: number[] = [];

  await new Promise<void>((resolve, reject) => {
    const worker = new Worker("image-processing-load-test", async (job) => {
      const latency = Date.now() - job.data.timestamp;
      latencies.push(latency);
      completed++;
      return { processed: true, index: job.data.index };
    }, { connection, concurrency: 5 });

    worker.on("completed", (job) => {
      if (completed >= jobCount) {
        const totalTime = Date.now() - startTime;
        worker.close();
        console.log(`Completed: ${completed}, Failed: ${failed}`);
        console.log(`Total time: ${totalTime}ms`);
        console.log(`Avg latency: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)}ms`);
        console.log(`Max latency: ${Math.max(...latencies)}ms`);
        console.log(`Min latency: ${Math.min(...latencies)}ms`);
        console.log(`Throughput: ${(jobCount / (totalTime / 1000)).toFixed(2)} jobs/sec`);
        resolve();
      }
    });

    worker.on("failed", (job, err) => {
      failed++;
      console.error(`Job ${job?.id} failed: ${err.message}`);
    });

    setTimeout(() => {
      worker.close();
      reject(new Error(`Timeout: ${completed}/${jobCount} completed`));
    }, 30000);
  });

  await queue.close();
  console.log(`=== LOAD TEST ${jobCount} COMPLETE ===\n`);
}

async function main() {
  console.log("SYNTHETIC LOAD TEST - AI Photo Studio WhatsApp");
  console.log("================================================");
  console.log(`Redis: ${REDIS_URL}`);
  console.log(`Worker concurrency: 5`);
  console.log(`Max runtime per test: 30s`);

  try {
    await runLoadTest(10);
    await runLoadTest(50);
    await runLoadTest(100);
    console.log("\nAll load tests passed.");
  } catch (error) {
    console.error("Load test failed:", error);
    process.exit(1);
  }
}

main();
