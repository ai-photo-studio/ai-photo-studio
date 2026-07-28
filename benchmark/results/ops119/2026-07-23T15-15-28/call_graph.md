# Call Graph

**Date:** 2026-07-23T15:15:29.084Z

```
Frontend (upload + process buttons)
  ↓ API calls (no provider selection in frontend)

RestorationController
  ↓
RestorationService.processItem() ★ LINE 337: HARDCODED "hd" ★
  ↓
PipelineOrchestrator.execute(request, tier)
  ├── tier = "hd" (hardcoded, NEVER uses getDefaultTier())
  ├── Step 1: FluxRestoreProvider.restore()
  │       └── BaseReplicateProvider.createPrediction() → POST to Replicate API
  │       └── BaseReplicateProvider.pollPrediction() → GET status (polling)
  │       └── BaseReplicateProvider.handleResult() → download output
  └── Step 2: UnifiedLocalRestorationProvider.restore()  [LEGACY_LOCAL_PIPELINE]
          ├── analyzeDamage() (synthetic)
          ├── LaMa inpaint (conditional) → RestorationInpaintService
          │       └── UnifiedRestorationService → runViaRunPod()
          ├── GFPGAN face → RestorationGfpganService
          │       └── UnifiedRestorationService → runViaRunPod()
          ├── DDColor (conditional) → RestorationDdcolorService
          │       └── UnifiedRestorationService → runViaRunPod()
          └── Real-ESRGAN → RealEsrganService (passthrough if URL empty)

== LEGACY CODE PATHS (marked LEGACY_LOCAL_PIPELINE) ==

UnifiedLocalRestorationProvider.ts         — imported by ProviderFactory, PipelineOrchestrator
restoration-provider.service.ts            — RestorationGfpganService, RestorationDdcolorService, etc.
real-esrgan.service.ts                     — RealEsrganService (passthrough when URL empty)
```

## All Production Usages of Legacy Providers

| File | Line | Provider | Context |
|---|---|---|---|
| src\restoration-providers\factory\ProviderFactory.ts | 13 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\factory\ProviderFactory.ts | 13 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\factory\ProviderFactory.ts | 62 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\pipeline\PipelineOrchestrator.ts | 4 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\pipeline\PipelineOrchestrator.ts | 4 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\pipeline\PipelineOrchestrator.ts | 55 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\pipeline\PipelineOrchestrator.ts | 59 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 29 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops112-validate.ts | 5 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops112-validate.ts | 5 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops112-validate.ts | 347 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops112-validate.ts | 398 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 40 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 98 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 98 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 226 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 285 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 286 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 294 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 295 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 331 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 343 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 412 | UnifiedLocalRestorationProvider | PRODUCTION CODE |
| src\providers\local-gfpgan.provider.ts | 11 | RestorationGfpganService | PRODUCTION CODE |
| src\providers\local-gfpgan.provider.ts | 33 | RestorationGfpganService | PRODUCTION CODE |
| src\providers\local-gfpgan.provider.ts | 36 | RestorationGfpganService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 4 | RestorationGfpganService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 35 | RestorationGfpganService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 41 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 4 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 53 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 99 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 7 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 186 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 207 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 174 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 214 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 365 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 99 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 99 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 335 | RestorationGfpganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 344 | RestorationGfpganService | PRODUCTION CODE |
| src\services\restoration-provider.service.ts | 185 | RestorationGfpganService | PRODUCTION CODE |
| src\providers\local-ddcolor.provider.ts | 11 | RestorationDdcolorService | PRODUCTION CODE |
| src\providers\local-ddcolor.provider.ts | 33 | RestorationDdcolorService | PRODUCTION CODE |
| src\providers\local-ddcolor.provider.ts | 36 | RestorationDdcolorService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 6 | RestorationDdcolorService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 37 | RestorationDdcolorService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 43 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 5 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 54 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 8 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 240 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 261 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 176 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 216 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 367 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 100 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 100 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 337 | RestorationDdcolorService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 344 | RestorationDdcolorService | PRODUCTION CODE |
| src\services\restoration-provider.service.ts | 211 | RestorationDdcolorService | PRODUCTION CODE |
| src\providers\local-lama.provider.ts | 11 | RestorationInpaintService | PRODUCTION CODE |
| src\providers\local-lama.provider.ts | 33 | RestorationInpaintService | PRODUCTION CODE |
| src\providers\local-lama.provider.ts | 36 | RestorationInpaintService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 4 | RestorationInpaintService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 34 | RestorationInpaintService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 40 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 3 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 55 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 6 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 267 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 288 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 177 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 217 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 368 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 101 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 101 | RestorationInpaintService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 333 | RestorationInpaintService | PRODUCTION CODE |
| src\services\restoration-provider.service.ts | 172 | RestorationInpaintService | PRODUCTION CODE |
| src\controllers\monitoring.controller.ts | 9 | RealEsrganService | PRODUCTION CODE |
| src\controllers\monitoring.controller.ts | 19 | RealEsrganService | PRODUCTION CODE |
| src\controllers\monitoring.controller.ts | 27 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-esrgan.provider.ts | 3 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-esrgan.provider.ts | 60 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-esrgan.provider.ts | 63 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-yolo.provider.ts | 5 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-yolo.provider.ts | 70 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-yolo.provider.ts | 75 | RealEsrganService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 5 | RealEsrganService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 36 | RealEsrganService | PRODUCTION CODE |
| src\restoration-providers\providers\UnifiedLocalRestorationProvider.ts | 42 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 6 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 56 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 110 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 9 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 213 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops114-chaining.ts | 234 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 136 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 175 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 215 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 231 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 366 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 102 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 102 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 339 | RealEsrganService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 345 | RealEsrganService | PRODUCTION CODE |
| src\services\real-esrgan.service.ts | 22 | RealEsrganService | PRODUCTION CODE |
| src\providers\local-codeformer.provider.ts | 11 | RestorationCodeformerService | PRODUCTION CODE |
| src\providers\local-codeformer.provider.ts | 33 | RestorationCodeformerService | PRODUCTION CODE |
| src\providers\local-codeformer.provider.ts | 36 | RestorationCodeformerService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 103 | RestorationCodeformerService | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 103 | RestorationCodeformerService | PRODUCTION CODE |
| src\services\restoration-provider.service.ts | 198 | RestorationCodeformerService | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 71 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 73 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 86 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 87 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 88 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops113-verify.ts | 103 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 174 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 176 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 177 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 187 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 214 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 231 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 365 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 367 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops115-audit.ts | 368 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 104 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 104 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 334 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 336 | runViaRunPod | PRODUCTION CODE |
| src\scripts\ops119-audit.ts | 338 | runViaRunPod | PRODUCTION CODE |
| src\services\background-remover.service.ts | 22 | runViaRunPod | PRODUCTION CODE |
| src\services\background-remover.service.ts | 50 | runViaRunPod | PRODUCTION CODE |
| src\services\real-esrgan.service.ts | 38 | runViaRunPod | PRODUCTION CODE |
| src\services\real-esrgan.service.ts | 77 | runViaRunPod | PRODUCTION CODE |
| src\services\restoration-provider.service.ts | 40 | runViaRunPod | PRODUCTION CODE |
| src\services\restoration-provider.service.ts | 82 | runViaRunPod | PRODUCTION CODE |

Note: All legacy provider imports in production code are via PipelineOrchestrator or ProviderFactory — they are instantiated but their execution path is conditional on the pipeline tier selected.