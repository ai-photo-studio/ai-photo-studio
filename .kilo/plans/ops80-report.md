# OPS-80 — Hybrid Commercial Provider Implementation Plan

**Model:** Gemini 2.5 Flash Lite  
**Mode:** PLAN  
**Timestamp:** 2026-07-21T23:15:00+05:00  

---

## SUMMARY

OPS-80 produces a validated hybrid provider implementation plan based on the OPS-73 benchmark (MVP: 3% improved, 58% regressed). The plan defines 9 new files, 2 modified files, 4 provider implementations, and a graded failover router — all without modifying frontend code or existing RunPod infrastructure.

---

## PLAN FILE

`.kilo/plans/ops80-implementation-plan.md` — complete implementation plan with:

- Interfaces and types (IRestorationProvider, RestorationRequest/Result)
- RestorationRouter with failover, A/B testing, shadow mode
- 4 provider implementations (FalAiProvider, ReplicateProvider, RunPodProvider, MockProvider)
- Tier-based production routing (premium/standard/budget/internal)
- Database migration (5 new columns on ProcessingJob)
- Implementation sprint plan (3 sprints, ~22 hr total)
- Risk assessment (5 risks identified)

---

## KEY DECISIONS

| Decision | Rationale |
|---|---|
| **fal.ai = primary commercial** | Fastest latency (1-10s), cheapest ($0.001-0.010/image) |
| **Replicate = fallback** | Better specialist models (colorization, face) |
| **RunPod = last resort** | Cost control, data privacy |
| **Tier-based routing** | Different quality/cost for different customers |
| **Shadow mode before switch** | 7-day parallel run before enabling new primary |

| Decision | Rationale |
|---|---|
| No frontend changes | Protected Scope |
| No existing provider modifications | Protected Scope |
| 9 new files, 2 modified | Minimal codebase impact |
| API keys pending procurement | Sprint A blocked without keys |

---

## DELIVERABLES

| # | Deliverable | Status |
|---|---|---|
| 1 | `apipln.md` | ✅ `.kilo/plans/ops80-implementation-plan.md` |
| 2 | Provider interfaces | ✅ IRestorationProvider + types |
| 3 | Router design | ✅ Failover + A/B + shadow mode |
| 4 | Provider implementations | ✅ 4 providers defined |
| 5 | Shadow mode design | ✅ Parallel execution with metrics |
| 6 | Provider ranking | ✅ Expected quality with benchmark gaps noted |
| 7 | Routing policy | ✅ 4 tiers (premium/standard/budget/internal) |
| 8 | Sprint plan | ✅ 3 sprints, ~22 hr total |

---

## GIT COMMIT

No code changes — documentation only. Git status is clean.

## BUILD

| Step | Result |
|---|---|
| `npm run typecheck` | N/A (no code changes) |
| `npm run build` | N/A |
