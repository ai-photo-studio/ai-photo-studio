# Restoration Implementation Backlog

## Phase R1 - Digital Restoration (MVP - Planning Audit)

### Epic: Digital Restoration Platform

| Feature | Priority | Dependencies | Existing Reusable Components | New Components Required | Risk | Est. Effort | Testing Required | Deployment Impact | Rollback Impact |
|---------|----------|--------------|------------------------------|-------------------------|------|-------------|------------------|-------------------|---------------|
| Restoration Order Creation | P0 | Auth, Billing, Storage | OrderService, PaymentService, StorageService, WalletService, SubscriptionService | RestorationOrder model, RestorationItem model, RestorationJob model | Medium | 2 weeks | Unit, Integration | New DB tables, API routes | Migration rollback |
| Image Upload & Ingestion | P0 | Storage, Queue | StorageService, PhaseCImageProcessingQueue, OrderController | RestorationUploadController, Restoration routes | Low | 1 week | Unit, E2E | API routes | Route rollback |
| AI Quality Analysis | P0 | AI Provider Framework | ImageProcessingService, ProviderFactory, ImageProvider interface | QualityAnalysisService, DamageDetector model | High | 3 weeks | Unit, AI Validation | New provider capabilities | Service rollback |
| Scratch Detection | P1 | Quality Analysis | ProviderFactory, ImageProvider | ScratchDetectionProvider, MaskGenerator | High | 2 weeks | Unit, AI Validation | Provider extension | Provider rollback |
| Scratch Removal | P0 | Scratch Detection | InpaintingProvider, StorageService | InpaintingService, MaskProcessor | High | 3 weeks | Unit, AI Validation | Worker extension | Job rollback |
| Dust Removal | P1 | Quality Analysis | DenoisingProvider | DustRemovalProvider | Medium | 1.5 weeks | Unit | Provider extension | Service rollback |
| Crack Repair | P1 | Quality Analysis | InpaintingProvider | CrackRepairService, PatchReconstructor | High | 2.5 weeks | Unit | New service | Service rollback |
| Face Restoration | P0 | Image Processing | FaceEnhancementProvider, YOLODetector | FaceRestorationService, FaceEnhancer | High | 3 weeks | Unit, AI Validation | Provider extension | Service rollback |
| Upscaling | P0 | Image Processing | RealESRGANProvider, StorageService | UpscalerService | Medium | 1.5 weeks | Unit | Provider extension | Service rollback |
| Color Correction | P0 | Quality Analysis | ColorCorrectionProvider | ColorCorrectionService | Medium | 1.5 weeks | Unit | Service extension | Service rollback |
| Colorization | P1 | Color Correction | ColorizationProvider | ColorizationService | High | 2 weeks | Unit, AI Validation | Provider extension | Service rollback |
| Background Cleanup | P1 | Image Processing | SegmentationProvider, InpaintingProvider | BackgroundCleanupService | Medium | 1.5 weeks | Unit | Service extension | Service rollback |
| AI Enhancement Pipeline | P0 | All above | ProductWorkflowService, ImageProcessingService | EnhancementOrchestrator | High | 2 weeks | Integration | New orchestration | Orchestration rollback |
| Preview Generation | P0 | Storage, Image Processing | StorageService, ImageProcessingService | PreviewGenerator | Medium | 1 week | Unit, E2E | Worker extension | Job rollback |
| Approval Workflow | P0 | Order, Notification | OrderService, NotificationService | ApprovalWorkflowService | Medium | 1.5 weeks | Unit, E2E | Service extension | Workflow rollback |
| Digital Download | P0 | Storage, Auth | StorageService, AuthMiddleware | DownloadController | Medium | 1 week | Unit, E2E | API routes | Route rollback |
| Print Ordering | P0 | Order, Billing | OrderService, PaymentService, StorageService | PrintOrderService, PrintPackage model | High | 2.5 weeks | Integration | New models, routes | Migration rollback |
| Courier Integration | P1 | Print Ordering | External API clients | CourierService, Shipment model | High | 2 weeks | Integration | New model, service | Migration rollback |
| Tracking | P1 | Courier | CourierService, NotificationService | TrackingService | Medium | 1 week | Integration | Service extension | Service rollback |
| Admin Dashboard - Restorations | P0 | Admin, Order | AdminService, AdminController, AdminLayout | RestorationDashboard, RestorationOrderPage | Medium | 1.5 weeks | E2E | New pages | Page rollback |
| Order Management - Restorations | P0 | Order | OrderService, AdminController, AdminLayout | RestorationOrderManagement | Medium | 1 week | E2E | New pages | Page rollback |
| Production Queue - Restoration | P0 | Queue | PhaseCImageProcessingQueue, Worker | RestorationQueueService, RestorationWorker | Medium | 1 week | Integration | Worker extension | Worker rollback |
| Print Queue | P0 | Print Ordering | ImageQueueService, Worker | PrintQueueService, PrintWorker | Medium | 1 week | Integration | Worker extension | Worker rollback |
| Album Builder | P1 | Image Processing | CreativeStudioJob, StorageService | AlbumBuilderService, AlbumProject model | High | 2 weeks | Integration | New model, service | Migration rollback |
| Frame Builder | P1 | Print Pipeline | StorageService, ImageProcessingService | FrameBuilderService | Medium | 1 week | Integration | Service extension | Service rollback |
| Gift Packaging | P1 | Print Pipeline | Package model, OrderService | PackagingService | Low | 0.5 weeks | Unit | Service extension | Service rollback |
| Notifications - Restoration | P0 | Notification | NotificationService, DeliveryService | RestorationNotifications | Low | 0.5 weeks | Unit | Service extension | Service rollback |
| Email - Restoration | P0 | Email Provider | Email templates, DeliveryService | RestorationEmailTemplates | Low | 0.5 weeks | Unit | Template update | Template rollback |
| Admin - Restorations Analytics | P0 | Admin, Order | AdminService, AdminController | RestorationAnalyticsService | Medium | 1 week | E2E | New endpoints | Endpoint rollback |

---

### Phase R2 - Printing

| Feature | Priority | Dependencies | Existing Reusable Components | New Components Required | Risk | Est. Effort |
|---------|----------|--------------|------------------------------|-------------------------|------|-------------|
| Print Order Creation | P0 | Order, Billing | OrderService, PaymentService | PrintOrder model | Medium | 1 week |
| Print Size Catalog | P0 | Package | Package model | PrintSize model | Low | 0.5 weeks |
| Paper Type Catalog | P0 | Package | Package model | PaperType model | Low | 0.5 weeks |
| Print Vendor Integration | P0 | Courier | External API clients | PrintVendorService | High | 2 weeks |
| Print Quality Control | P0 | Print Pipeline | Admin dashboard | QCService | Medium | 1 week |
| Packaging Options | P1 | Print Ordering | Order model | PackagingOption model | Low | 0.5 weeks |

---

### Phase R3 - Albums

| Feature | Priority | Dependencies | Existing Reusable Components | New Components Required | Risk | Est. Effort |
|---------|----------|--------------|------------------------------|-------------------------|------|-------------|
| Album Project Creation | P0 | Image Processing | CreativeStudioJob, AlbumBuilder | AlbumProject model | Medium | 1 week |
| Album Template Engine | P0 | Album Builder | TemplateService | AlbumTemplateService | Medium | 1.5 weeks |
| Layout Selection | P0 | Album Builder | UI Components | AlbumLayoutPicker | Low | 1 week |
| Chronological Grouping | P1 | Album Builder | Image metadata | ChronologyService | Low | 0.5 weeks |
| Event Type Grouping | P1 | Album Builder | Image metadata | EventTypeGrouper | Low | 0.5 weeks |

---

### Phase R4 - Frames

| Feature | Priority | Dependencies | Existing Reusable Components | New Components Required | Risk | Est. Effort |
|---------|----------|--------------|------------------------------|-------------------------|------|-------------|
| Frame Size Catalog | P0 | Package | Package model | FrameSize model | Low | 0.5 weeks |
| Border Style Catalog | P0 | Package | Package model | BorderStyle model | Low | 0.5 weeks |
| Frame Layout Generation | P0 | Print Pipeline | StorageService | FrameLayoutService | Medium | 1 week |

---

### Phase R5 - Courier

| Feature | Priority | Dependencies | Existing Reusable Components | New Components Required | Risk | Est. Effort |
|---------|----------|--------------|------------------------------|-------------------------|------|-------------|
| Courier API Integration | P0 | Print Orders | External API clients | CourierApiService | High | 2 weeks |
| Shipment Manifest | P0 | Courier | Order model | ShipmentManifest model | Medium | 1 week |
| Delivery Tracking | P0 | Courier | NotificationService | TrackingService | Medium | 1 week |
| Courier Webhooks | P0 | Courier | Webhook handlers | CourierWebhookHandler | Medium | 0.5 weeks |

---

### Phase R6 - Own AI Models

| Feature | Priority | Dependencies | Existing Reusable Components | New Components Required | Risk | Est. Effort |
|---------|----------|--------------|------------------------------|-------------------------|------|-------------|
| Model Training Pipeline | P1 | SAM2, Inpainting | GPU services, Training scripts | TrainingPipeline | High | 4 weeks |
| Model Serving | P1 | Model Training | Cloud Run, GPU | ModelServer | High | 3 weeks |
| Model Versioning | P1 | Model Serving | Storage | ModelRegistry | Medium | 1 week |
| A/B Testing Framework | P1 | Model Serving | Feature flags | ABTestingService | Medium | 1 week |

---

## Reusable Modules Analysis

### Authentication
- **Status**: ✅ Existing
- **Location**: `apps/api/src/middleware/auth.middleware.ts`, `apps/api/src/services/auth.service.ts`
- **Reuse**: JWT-based authentication, token signing/verification, user context extraction

### Billing
- **Status**: ✅ Existing
- **Location**: `apps/api/src/services/payment.service.ts`, `apps/api/src/payments/`
- **Reuse**: Checkout creation, payment records, webhook handling, manual payment support

### Credits
- **Status**: ✅ Existing
- **Location**: `apps/api/src/services/wallet.service.ts`
- **Reuse**: Wallet management, credit reservation, settlement, release

### Queue
- **Status**: ✅ Existing
- **Location**: `apps/api/src/queues/phase-c-image-processing.queue.ts`, `apps/api/src/workers/image-processing.worker.ts`
- **Reuse**: BullMQ queue, dead letter queue, job processing, retry logic

### Storage
- **Status**: ✅ Existing
- **Location**: `apps/api/src/services/storage.service.ts`
- **Reuse**: Cloudflare R2 integration, signed URLs, file upload/download, retention policies

### Cloudflare R2
- **Status**: ✅ Existing
- **Location**: `apps/api/src/services/storage.service.ts`
- **Reuse**: S3-compatible client, R2 bucket access, lifecycle policies

### Notifications
- **Status**: ✅ Existing (Basic)
- **Location**: `apps/api/src/services/notification.service.ts`, `apps/api/src/services/delivery.service.ts`
- **Reuse**: Event logging, WhatsApp delivery modes, dry-run support
- **Gap**: Email provider integration incomplete

### Email
- **Status**: ⚠️ Partial
- **Location**: Not implemented
- **Gap**: Email provider integration, template management, SMTP configuration

### Admin
- **Status**: ✅ Existing
- **Location**: `apps/api/src/routes/admin.routes.ts`, `apps/api/src/controllers/admin.controller.ts`, `apps/api/src/services/admin.service.ts`
- **Reuse**: Role-based access, dashboard, order listing, job management, payments, wallets

### Audit
- **Status**: ✅ Existing
- **Location**: `apps/api/src/services/admin.service.ts` (audit log creation)
- **Reuse**: Audit log model, actor tracking, action logging

### Logging
- **Status**: ✅ Existing
- **Location**: `apps/api/src/utils/logger.ts`
- **Reuse**: Winston logger, structured logging, log levels

### SAM2 Pipeline
- **Status**: ✅ Existing
- **Location**: `apps/api/src/providers/gpu-sam2.provider.ts`
- **Reuse**: GPU-based segmentation, mask generation

### Image Pipeline
- **Status**: ✅ Existing
- **Location**: `apps/api/src/services/image-processing.service.ts`, `apps/api/src/providers/`
- **Reuse**: Provider factory, workflow routing, image processing pipeline

### Background Jobs
- **Status**: ✅ Existing
- **Location**: `apps/api/src/workers/`
- **Reuse**: Worker pattern, error handling, completion tracking

### API Middleware
- **Status**: ✅ Existing
- **Location**: `apps/api/src/middleware/`
- **Reuse**: Auth middleware, admin auth, rate limiting, CORS

### Rate Limiting
- **Status**: ✅ Existing
- **Location**: `apps/api/src/middleware/rate-limit.middleware.ts`
- **Reuse**: IP-based rate limiting, configurable windows

### Validation
- **Status**: ✅ Existing
- **Location**: Controllers, middleware
- **Reuse**: Request validation, error handling patterns

---

## Missing Modules

| Module | Gap Description | Required For |
|--------|-----------------|--------------|
| Email Provider | No email service implementation | Transactional emails |
| Print Vendor Integration | No print vendor API clients | Print fulfillment |
| Courier API Integration | No courier service implementation | Shipment tracking |
| Restoration Services | No restoration-specific services | Digital restoration |
| Album Builder Service | No album creation logic | Album orders |
| Frame Builder Service | No frame layout generation | Frame products |
| Quality Analysis Service | No AI quality scoring | Image assessment |
| Restoration DB Models | No restoration-specific tables | Orders, artifacts |
| Restoration API Routes | No restoration endpoints | Customer portal |
| Restoration Frontend | No restoration UI pages | Customer experience |

---

## Implementation Order

### Phase R1 - Digital Restoration
1. Restoration Order Creation (API + DB)
2. Image Upload & Ingestion
3. AI Quality Analysis
4. Scratch Detection & Removal
5. Dust Removal
6. Crack Repair
7. Face Restoration
8. Upscaling
9. Color Correction
10. Colorization
11. Background Cleanup
12. AI Enhancement Pipeline
13. Preview Generation
14. Approval Workflow
15. Digital Download
16. Admin Dashboard - Restorations

### Phase R2 - Printing
1. Print Order Model & API
2. Print Size/Paper Catalog
3. Print Vendor Integration
4. Print Quality Control
5. Packaging Options

### Phase R3 - Albums
1. Album Project Model
2. Album Template Engine
3. Layout Selection
4. Chronological/Event Grouping

### Phase R4 - Frames
1. Frame Size Catalog
2. Border Style Catalog
3. Frame Layout Generation

### Phase R5 - Courier
1. Courier API Integration
2. Shipment Manifest
3. Delivery Tracking
4. Courier Webhooks

### Phase R6 - Own AI Models
1. Model Training Pipeline
2. Model Serving
3. Model Versioning
4. A/B Testing Framework