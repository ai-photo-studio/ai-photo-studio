# AI Code Audit Report RI

## Final Status

**API: UP** (200 at api.thannow.com)  
**Deployed SHA**: `278a14f7` (old — Jul 27, without watchdog removal or OPS-116 changes)  
**Build HEAD**: `dd84902` (clean repo with watchdog removed, OPS-116 only)  
**Northflank build**: FAILURE at 33-45s for all builds — blocking deployment of new code

## Build Failure Analysis

| Attempt | SHA | Dockerfile variation | Time to fail |
|---------|-----|---------------------|-------------|
| 1 | `e8a1d78` | `--max-old-space-size` from original working SHA | 33s |
| 2 | `bdd7b3d` | Same as #1 (public repo) | 23s |
| 3 | `6328dcf` | `apt-get only` ? **SUCCESS** | 22s |
| 4 | `5e0a477` | Combined RUN layers, prefer-offline | 33s |
| 5 | `6399131` | Restored exactly SHA 278a14f7 Dockerfile | 34s |
| 6 | `937bc4e` | Pre-compiled dist, no tsc | 11s (dist not in git) |
| 7 | Various | All full Dockerfile builds | 33-45s |

The build consistently fails at 33-45s regardless of Dockerfile content. The only successful build was `RUN apt-get update && apt-get install && echo "DONE"` (22s). This pattern indicates a **Northflank build infrastructure limitation** on the `nf-compute-10` plan — likely an npm registry timeout or network egress limit.

## What's ready to deploy

The `main` branch at SHA `dd84902` contains:
- ? Memory watchdog removed (file deleted, import removed from index.ts)
- ? Only OPS-116 providers: BaseReplicateProvider, FluxRestoreProvider, GFPGANProvider, ReplicatePipelineProvider
- ? PipelineOrchestrator only instantiates ReplicatePipelineProvider (3-stage: flux?GFPGAN face?GFPGAN upscale)
- ? All legacy providers, scripts, docs deleted
- ? TypeScript compilation passes locally

## Fix needed

Investigate Northflank build logs in Dashboard ? Service ? Builds ? find first error line. The `npm install` step appears to time out after ~30s of network activity. Options:
1. **Northflank support**: Ask why npm registry is unreachable from build containers
2. **Increase build timeout**: Check if nf-compute-10 has a build timeout setting
3. **Pre-build node_modules**: Commit package-lock.json and use `npm ci` instead of `npm install`
