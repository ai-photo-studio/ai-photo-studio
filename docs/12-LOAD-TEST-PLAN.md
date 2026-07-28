# Load Test Plan

## Goal
Validate the production pipeline without destructive testing and identify the most likely bottlenecks before launch.

## Tier 1: 100 images/day
- Expected concurrency: 1 to 2 active jobs at a time.
- Validation focus:
  - webhook intake latency
  - R2 upload throughput
  - worker startup stability
  - delivery notification generation
- Likely bottlenecks:
  - queue startup overhead
  - R2 upload latency
  - slow WhatsApp media downloads

## Tier 2: 1,000 images/day
- Expected concurrency: 5 to 10 active jobs at a time.
- Validation focus:
  - BullMQ queue depth behavior
  - job retry handling
  - worker saturation
  - DB writes for order/status/payment tracking
- Likely bottlenecks:
  - Redis contention
  - Prisma transaction latency
  - CPU-bound image processing

## Tier 3: 5,000 images/day
- Expected concurrency: bursty workloads with multiple workers required.
- Validation focus:
  - horizontal worker scaling
  - dead-letter handling
  - queue backlog recovery
  - monitoring alert thresholds
- Likely bottlenecks:
  - provider API throttling
  - sustained Redis load
  - storage egress and signed URL churn
  - DB connection pool pressure

## Safe Execution Rules
- Do not run destructive delete/load tests on production data.
- Use synthetic orders and isolated test credentials only.
- Measure queue depth, worker duration, failure rate, and delivery response times.
- Stop tests if queue depth grows faster than worker drain rate for more than one interval.

## Success Criteria
- 100/day stays near real-time with low queue depth.
- 1,000/day remains stable with bounded retries.
- 5,000/day requires scaling guidance but does not lose jobs.
