# Memory Usage Report — OPS-153

## Active Revision Configuration
| Resource | Limit |
|----------|-------|
| Memory | 1Gi (1024 MB) |
| CPU | 1 |

## Actual Memory Usage (from memory watchdog logs)

Each MEMORY_WATCHDOG event reports:
```
heapTotal: 35MB
heapUsed: 32MB
rss: 165MB
threshold: 0.8 (80%)
usedPercent: 91%
```

| Metric | Value | Verdict |
|--------|-------|---------|
| Resident Set Size | **165 MB** | ✅ Well within 1Gi limit |
| Heap Used | **32 MB** | ✅ Negligible |
| Heap Total | **35 MB** | ✅ |
| Memory headroom | **~859 MB unused** (84% free) | |

## Analysis

The memory watchdog fires because **heapUsed/heapTotal = 91%** (32MB/35MB). This is NOT an out-of-memory condition — the application only uses 165MB RSS out of 1024MB available. The "threshold exceeded" message is triggered by garbage collection efficiency, not actual memory pressure.

**Memory was NEVER the cause of ERR_CONNECTION_CLOSED.** The 1Gi limit provides ~859MB of unused headroom. No OOM events were found.

## Effect of Increasing Memory (1Gi → 2Gi)

Increasing memory to 2Gi would NOT have changed the runtime behavior because:
1. Peak RSS is only 165MB — far below 1Gi
2. The watchdog fires based on heapUsed/heapTotal ratio (32/35 = 91%), not absolute memory
3. No OOM events were detected at 1Gi

**Memory increase was a hypothesis that did not address the root cause.**
