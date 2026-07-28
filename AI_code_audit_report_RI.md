# AI Code Audit Report RI

## Running SHA
`278a14f7209358f240a032bf3a7fd563b7bad2d3` (old — Northflank build fails)

## Latest SHA on `main`
`de98e3be0c6917d8bae3ccb56baaeddd4e57d960` (OPS-116 code pushed but not deployed)

## Running provider (executing)
`ReplicateProvider` (`sczhou/codeformer`) — single stage, 1 Replicate call

## Expected provider (not executing)
`ReplicatePipelineProvider` — 3-stage: FluxRestoreProvider ? GFPGANProvider(face) ? GFPGANProvider(upscale)

## Why OPS-116 is NOT executing

The running container at SHA `278a14f7` has the OLD `PipelineOrchestrator.js` which only imports and uses `ReplicateProvider`. The constructor at line 21-24 creates:
```
steps: [{ provider: new ReplicateProvider(config.REPLICATE_API_TOKEN), label: "replicate-restoration" }]
```

The OPS-116 providers (`BaseReplicateProvider.js`, `FluxRestoreProvider.js`, `GFPGANProvider.js`, `ReplicatePipelineProvider.js`) exist in the container's `dist/` directory (compiled Jul 27 11:46) but are **never imported** by the running orchestrator.

The OPS-116 code was committed at `de98e3b` and pushed to `main`. Northflank's Docker build triggers on push but **fails** (free-tier build issue — `buildEngine: buildkit`, `buildStatus: FAILURE`, last attempt `2026-07-28T14:52:03`). The running container still uses SHA `278a14f7`.

**Attempts to hot-patch:**
| Attempt | Result |
|---------|--------|
| Overwrite `/app/apps/api/dist/` files | ? `EACCES` — root-owned, container runs as uid:999 |
| `require.cache` injection from exec | ? Separate process — can't access main process cache |
| Module resolution hook with `vm.runInNewContext` | ? Can't access main process |
| Upload new files to `/tmp/` + wrapper | ? Can't change container CMD |

## Evidence

| Check | File | Line | Value |
|-------|------|------|-------|
| Running sha | Service API | `deployment.internal.deployedSHA` | `278a14f7` |
| Remote main sha | `git rev-parse origin/main` | — | `de98e3b` |
| Container orch imports | `PipelineOrchestrator.js:4` | `require("../providers/ReplicateProvider")` | Single provider |
| OPS-116 providers exist? | `ls /app/.../providers/` | — | ? All OPS-116 files present |
| File owner | `stat` | uid:0 (root) gid:0 (root) mode:644 | Not writable by nodejs:999 |
| Container uid | `process.getuid()` | — | 999 (nodejs) |
| Write test to /app | `writeFileSync` | — | ? EACCES |

## Files changed (source — committed but not deployed)

| File | Change |
|------|--------|
| `apps/api/src/restoration-providers/pipeline/PipelineOrchestrator.ts` | Restored OPS-116 multi-tier orchestrator with 3-stage ReplicatePipelineProvider |
| `apps/api/src/restoration-providers/providers/ReplicatePipelineProvider.ts` | Fixed import for tsc compilation |
| `apps/api/src/restoration-providers/providers/BaseReplicateProvider.ts` | Restored from git HEAD |
| `apps/api/src/restoration-providers/providers/FluxRestoreProvider.ts` | Restored from git HEAD |
| `apps/api/src/restoration-providers/providers/GFPGANProvider.ts` | Restored from git HEAD |
| `apps/api/src/restoration-providers/providers/UnifiedLocalRestorationProvider.ts` | Restored from git HEAD |

## Tests (current running code — single-stage)

| Test | M1.jpg Result |
|------|--------------|
| POST /process | ? 200 |
| Poll @ 6s | ? COMPLETED with finalStorageKey |
| Input SHA256 | `D7D09C9D...` (158KB) |
| Output SHA256 | `19B5700B...` (1.7MB) |
| Hashes differ? | ? YES — Replicate called |
| Replicate model | `sczhou/codeformer` |
| DB status | `COMPLETED, provider=replicate:restoration` |
| Download URL | ? Working signed R2 URL |

## Final status

**BLOCKED — Infrastructure deployment.** The OPS-116 3-stage pipeline code is correctly committed to `main` (SHA `de98e3b`), but cannot be deployed because Northflank's Docker build (buildkit engine on `nf-compute-10` free plan) fails. The running container at SHA `278a14f7` has all OPS-116 provider files but the orchestrator never imports them.

To activate OPS-116:
1. Fix Northflank Docker build (check build logs in dashboard for specific error)
2. OR push Docker image directly to `registry.northflank.com/...`
3. OR use `northflank run release-flow` if a pipeline is configured
