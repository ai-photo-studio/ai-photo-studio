# Cloud Run Runtime Report — OPS-153

## Active Revision

| Property | Value |
|----------|-------|
| Revision | `ai-photo-studio-api-00098-dpf` |
| Image | `sha256:1f3118617f6fceb5f563217331ecd16a07274fd0af3361e6384e10edc749ae94` |
| Created | 2026-07-24T15:02:36Z (48+ hours stale) |
| Traffic | 100% |
| Memory | 1Gi |
| CPU | 1 |
| Port | 8080 HTTP/1 |
| Min instances | 1 (always warm) |
| Max instances | 10 |
| Startup probe | TCP check, 240s timeout |
| Liveness probe | **NOT CONFIGURED** |
| Readiness probe | **NOT CONFIGURED** |

## Health Conditions

| Condition | Status | Details |
|-----------|--------|---------|
| Ready | True | Scaling succeeded |
| Active | True | Serving |
| ContainerHealthy | True | Became healthy in 3.68s |
| ContainerReady | True | Image import completed |
| MinInstancesProvisioned | True | Provisioned successfully |
| ResourcesAvailable | True | Provisioning completed |

**All conditions are True. No container failures, no restarts, no OOM from Cloud Run's perspective.**

---

## Revision History

| Revision | Created | Status | Notes |
|----------|---------|--------|-------|
| 00104-t7f | Jul 24 17:12 | Retired | Never served traffic |
| cors-fix | Jul 24 15:36 | Retired | Never served traffic |
| 00099-dwc | Jul 24 15:08 | **Failed** | Container startup error |
| **00098-dpf** | Jul 24 15:02 | **Active** | Serving 100% traffic (48+ hours stale) |

**The active revision has NOT been updated since July 24. All OPS-150 watchdog fixes are NOT deployed.**
