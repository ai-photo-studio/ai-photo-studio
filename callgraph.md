# Repository Dependency Graph — OPS-145

## RESTORATION FLOW (Active Production Path)

```
Browser → /restore/new
  → RestoreNewPage.tsx
      ├── useAuth() → AuthProvider → POST /api/auth/login | POST /api/auth/register | GET /api/auth/me
      ├── usePackages() → GET /api/packages → PackageController → PackageService
      │                                                └── listPublicPackages() → Prisma
      ├── customerApi.createRestorationOrder() → POST /api/restorations
      │   → RestorationController.createOrder()
      │       → RestorationService.createOrder() → Prisma
      ├── customerApi.addRestorationItem() → POST /api/restorations/:id/items
      │   → RestorationController.addItem()
      │       → StorageService.uploadOriginal() → R2
      │       → RestorationService.addItem() → Prisma
      └── customerApi.runQualityAnalysis() → POST /api/restorations/:id/items/:itemId/quality-analysis
          → RestorationController.runQualityAnalysis()
              → RestorationEngineService.analyzeAndStore()
                  ├── ImageAnalysisService.analyzeImage() → R2 → in-memory analysis
                  ├── DamageDetectionService.detectDamage() → R2 → in-memory analysis
                  └── Prisma (store results)

Browser → /restore/:orderId
  → RestoreOrderPage.tsx
      ├── customerApi.getRestorationOrder() → GET /api/restorations/:id
      │   → RestorationController.getOrder()
      │       → RestorationService.getOrder() → Prisma
      └── customerApi.getRestorationPreview() → POST /api/restorations/:id/items/:itemId/preview
          → RestorationController.generatePreview()
              → RestorationService.generatePreview() → StorageService → R2

PROCESSING (Server-side, triggered via /restore/:id/items/:itemId/process):
  → RestorationController.processItem()
      ├── [PAYMENT GUARD] checks order.status APPROVED | COMPLETED
      └── RestorationService.processItem()
          └── PipelineOrchestrator.execute() [default tier: "replicate"]
              └── ReplicatePipelineProvider
                  └── 3 sequential Replicate API calls
```

## ORDER / WHATSAPP FLOW (Alternative Path)

```
WhatsApp Webhook → POST /api/webhooks/whatsapp
  → WhatsAppController.receiveWebhook()
      → WhatsAppService.downloadMedia() → Facebook API
      → PhaseCOrderPipelineService.createOrderForIncomingImage()
          ├── OrderService.createOrder() → Prisma
          └── PhaseCImageProcessingQueue.enqueueImageProcessing() → BullMQ
              └── worker → ImageProcessingService
                  └── Provider chain → local providers | RunPod (legacy)

Web Upload → POST /api/orders/:orderNo/web-upload
  → OrderController.uploadWebImage()
      ├── WalletService.reserveCredits() → Prisma
      ├── StorageService.uploadOriginal() → R2
      └── PhaseCImageProcessingQueue.enqueueImageProcessing() → BullMQ
```

## SINGLE-IMAGE FLOW (HomePage — deprecated path)

```
Browser → /
  → HomePage.tsx
      ├── customerApi.removeBackgroundPreview() → POST /api/previews/background-removal
      │   → PreviewController.removeBackgroundPreview()
      │       → BackgroundRemoverService.productTransparent()
      │           → runRunPodRequest() | HTTP POST → Replicate | RunPod (legacy)
      └── (in-browser resolution tier selection, no backend order creation)
```

## DEAD / UNUSED CODE

| Code | Reason |
|------|--------|
| `customerApi.processRestorationItem()` | Never called from any page |
| `customerApi.approveRestorationItem()` | Never called from any page |
| `customerApi.getRestorationDownload()` | Never called from any page |
| `RemoveBackgroundPreview` flow | Only used by HomePage, not restoration flow |
| `AdminOrderDetail.tsx` page | NOT registered in App.tsx routes |
| `AdminFailedJobs.tsx` page | NOT registered in App.tsx routes |
| `AdminPaymentsPage.tsx` page | NOT registered in App.tsx routes |
| `AdminWalletsPage.tsx` page | NOT registered in App.tsx routes |
| `AdminSubscriptionsPage.tsx` page | NOT registered in App.tsx routes |
| `AdminUsersPage.tsx` page | NOT registered in App.tsx routes |
| `AdminPackagesPage.tsx` page | NOT registered in App.tsx routes |
| `AdminStoragePage.tsx` page | NOT registered in App.tsx routes |
| `AdminSettingsPage.tsx` page | NOT registered in App.tsx routes |
| `RunPodProvider.ts` | Disabled by ProviderPolicyEngine |
| `runpod.transport.ts` (as active route) | Only called when endpoint is RunPod ID; not in active path |
