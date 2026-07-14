# Restoration Images Plan

## Executive Summary
- This plan defines the implementation blueprint for an AI Memory Restoration Platform that extends the existing AI Product Photo Studio platform into restoration, enhancement, print fulfillment, and album creation services.
- The platform will initially target Pakistan and later expand globally.
- The solution will reuse the existing authentication, user management, billing, credits, API, queue, storage, Cloudflare R2, background removal, product beautifier, frontend, admin, CI/CD, and production baseline already available in the current platform.
- The initial scope focuses on digital restoration MVP, followed by printing and album services, then AI model ownership and scale-out.
- Priority: P0
- Complexity: High
- Dependencies: Existing auth, billing, queues, storage, admin, CI/CD, Cloudflare R2, AI processing services
- Estimated implementation time: 16-20 weeks for MVP, 9-12 months for full commercialization

## Business Vision
- Create a trusted AI restoration brand for preserving family memories, wedding albums, historical photographs, damaged documents, and important certificates.
- Serve Pakistani consumers and businesses first through a simple digital-first customer journey and a later print-and-delivery model.
- Build a hybrid business model combining digital restoration purchases, print orders, album creation, gifting, and B2B workflows for photographers, studios, and wedding businesses.
- Position the platform as a premium but accessible service that combines AI restoration with fulfillment and delivery.
- Priority: P0
- Complexity: Medium
- Dependencies: Product positioning, pricing model, fulfillment partners, customer support operating model
- Estimated implementation time: 3-4 weeks for business planning and packaging design

## Technical Architecture
- Reuse the current monolithic-but-modular platform architecture with API, queue workers, storage, admin, and frontend.
- Introduce a new restoration domain with dedicated services for image analysis, scratch repair, face restoration, colorization, quality scoring, preview generation, and printing orchestration.
- Core layers:
  - Customer portal and web app
  - API gateway and domain services
  - Background job workers and queue
  - AI inference services
  - Cloudflare R2 object storage
  - Database for orders, jobs, artifacts, print jobs, and admin operations
  - Notification and delivery layer
  - Admin dashboard and operations console
- Recommended deployment pattern:
  - Frontend: existing web app shell
  - API: existing API service extended with restoration endpoints
  - Queue workers: existing queues extended with restoration and print pipelines
  - AI services: first use commercial APIs, later transition to owned models
- Priority: P0
- Complexity: High
- Dependencies: Reuse of platform services, API versioning, storage lifecycle policies, queue reliability
- Estimated implementation time: 4-6 weeks for architecture finalization and implementation scaffolding

## Functional Requirements

### 1. Customer Portal
- Provide a customer-facing portal for sign-up, package selection, upload, order tracking, approval, payment, and downloads.
- Support Pakistani language and currency defaults with later localization support.
- Enable account history for restoration orders, print orders, albums, and frame orders.
- Priority: P0
- Complexity: Medium
- Dependencies: Existing auth, user profiles, payments, order workflow
- Estimated implementation time: 3-4 weeks

### 2. Upload
- Support upload of single and bulk photos including family albums, wedding photos, documents, and certificates.
- Support drag-and-drop, mobile upload, batch upload, and retry handling.
- Capture metadata such as category, original date, quality level, and intended output type.
- Priority: P0
- Complexity: Medium
- Dependencies: Storage abstraction, validation rules, order creation workflow
- Estimated implementation time: 2-3 weeks

### 3. AI Quality Analysis
- Analyze incoming images for damage level, blur level, contrast, noise, scratches, dust, fading, color cast, and document legibility.
- Generate a restoration suitability score and recommend a package tier.
- Display quality analysis results to the customer before processing begins.
- Priority: P0
- Complexity: High
- Dependencies: AI provider integration, image analysis service, scoring model
- Estimated implementation time: 3-4 weeks

### 4. Scratch Detection
- Detect visible scratches, scuffs, and line marks on scanned photos and printed documents.
- Classify scratch severity into low, medium, and high damage categories.
- Output mask overlays for targeted scratch repair.
- Priority: P0
- Complexity: High
- Dependencies: Computer vision service, segmentation masks, quality scoring
- Estimated implementation time: 3-4 weeks

### 5. Scratch Removal
- Remove or soften detected scratches while preserving texture and structure.
- Support selective inpainting and texture-aware reconstruction.
- Provide before/after previews in the approval workflow.
- Priority: P0
- Complexity: High
- Dependencies: Inpainting model, mask generation, preview pipeline
- Estimated implementation time: 4-5 weeks

### 6. Dust Removal
- Remove fine dust, specks, and small debris from scanned images and documents.
- Apply non-destructive cleaning to preserve photo integrity.
- Priority: P1
- Complexity: Medium
- Dependencies: Dust detection model, image denoising service
- Estimated implementation time: 2-3 weeks

### 7. Crack Repair
- Repair torn or cracked image regions without distorting facial or object structure.
- Support varying crack severity and document restoration use cases.
- Priority: P1
- Complexity: High
- Dependencies: Structural inpainting model, patch reconstruction logic
- Estimated implementation time: 4-6 weeks

### 8. Face Restoration
- Restore faces in family and wedding photos including sharpening, deblurring, and skin tone correction.
- Support age-related degradation and low-resolution old face restoration.
- Priority: P0
- Complexity: High
- Dependencies: Face detection, face enhancement model, privacy controls
- Estimated implementation time: 4-6 weeks

### 9. Upscaling
- Upscale low-resolution historical photos, scanned images, and damaged photographs.
- Support outputs for digital download and print-ready formats.
- Priority: P0
- Complexity: Medium
- Dependencies: Super-resolution model, output sizing rules
- Estimated implementation time: 2-3 weeks

### 10. Color Correction
- Correct fading, yellowing, color cast, low contrast, and exposure problems.
- Support both automatic and manual adjustment modes for premium workflows.
- Priority: P0
- Complexity: Medium
- Dependencies: Color analysis model, image adjustment engine
- Estimated implementation time: 2-3 weeks

### 11. Colorization
- Add plausible color to black and white images while preserving historical realism.
- Offer selective colorization options for portraits, clothing, and backgrounds.
- Priority: P1
- Complexity: High
- Dependencies: Colorization model, user approval workflow
- Estimated implementation time: 4-5 weeks

### 12. Background Cleanup
- Remove stains, folds, creases, and distracting background elements from photo restoration outputs.
- Support document cleanup and photo background enhancement.
- Priority: P1
- Complexity: Medium
- Dependencies: Segmentation, background removal service, inpainting
- Estimated implementation time: 3-4 weeks

### 13. AI Enhancement
- Combine multiple restoration operations into a premium end-to-end enhancement pipeline.
- Offer AI enhancement packages for family albums, wedding memories, and historical archives.
- Priority: P0
- Complexity: High
- Dependencies: Orchestration engine, AI provider pipeline, pricing tiers
- Estimated implementation time: 4-6 weeks

### 14. Preview Generation
- Create low-resolution previews for customer review before final download or print order.
- Generate side-by-side before/after previews and quality thumbnails.
- Priority: P0
- Complexity: Medium
- Dependencies: Preview rendering pipeline, storage, notification service
- Estimated implementation time: 2-3 weeks

### 15. Approval Workflow
- Allow customers to review, approve, or request reprocessing before purchase or fulfillment.
- Capture approval status and revision history per image or order.
- Priority: P0
- Complexity: Medium
- Dependencies: Order state engine, notifications, review UI
- Estimated implementation time: 3-4 weeks

### 16. Payment
- Support package-based billing, credit top-up, service bundles, wholesale pricing, and print add-ons.
- Integrate with local and regional payment options appropriate for Pakistan and later cross-border expansion.
- Priority: P0
- Complexity: High
- Dependencies: Existing billing module, payment providers, refund rules
- Estimated implementation time: 4-5 weeks

### 17. Digital Download
- Allow customers to download high-resolution restored images in digital format after approval.
- Support secure, signed links and expiry policies for protected files.
- Priority: P0
- Complexity: Medium
- Dependencies: Storage access controls, download permissions, signed URL generation
- Estimated implementation time: 2-3 weeks

### 18. Print Ordering
- Enable customers to order physical prints in multiple formats and sizes.
- Offer packaging options, delivery speed, and print quality choices.
- Priority: P0
- Complexity: High
- Dependencies: Printing vendor integration, production queue, address capture
- Estimated implementation time: 4-6 weeks

### 19. Courier Integration
- Connect print orders with courier services for domestic and regional shipment.
- Track manifest generation, shipping status, and delivery confirmation.
- Priority: P1
- Complexity: High
- Dependencies: Courier API integration, order fulfillment workflow
- Estimated implementation time: 4-6 weeks

### 20. Tracking
- Provide order tracking for print jobs, courier shipments, and delivery milestones.
- Expose shipment updates to the customer and admin team.
- Priority: P1
- Complexity: Medium
- Dependencies: Courier webhooks, notifications, order status engine
- Estimated implementation time: 2-3 weeks

### 21. Admin Dashboard
- Provide admin views for orders, revenue, refunds, production, printing, courier, customers, and analytics.
- Support role-based access for operations and finance teams.
- Priority: P0
- Complexity: Medium
- Dependencies: Existing admin platform, role permissions, dashboard widgets
- Estimated implementation time: 3-4 weeks

### 22. Order Management
- Manage order creation, revisions, approvals, payments, fulfillment, shipping, and delivery status.
- Support operations teams with exception handling and manual interventions.
- Priority: P0
- Complexity: High
- Dependencies: Order state engine, admin workflows, notification service
- Estimated implementation time: 4-5 weeks

### 23. Production Queue
- Orchestrate restoration jobs, quality checks, preview creation, and output delivery.
- Support retries, backoff, queue visibility, and failure handling.
- Priority: P0
- Complexity: High
- Dependencies: Existing queue infrastructure, worker orchestration, AI service health checks
- Estimated implementation time: 3-4 weeks

### 24. Print Queue
- Manage print-job batching, file packaging, proof generation, and shipping preparation.
- Support print operations and fulfillment prioritization.
- Priority: P0
- Complexity: High
- Dependencies: Production queue, print vendor integration, label generation
- Estimated implementation time: 3-4 weeks

### 25. Album Builder
- Build chronological albums, memory books, wedding albums, and family albums from uploaded images.
- Support album templates, layout selection, title pages, captions, and print-ready export.
- Priority: P1
- Complexity: High
- Dependencies: Album template engine, print pipeline, design assets
- Estimated implementation time: 5-7 weeks

### 26. Frame Builder
- Create frame-ready layouts for selected restored images and premium photo gift products.
- Support multiple frame sizes and border styles.
- Priority: P1
- Complexity: Medium
- Dependencies: Print pipeline, asset rendering, product catalog
- Estimated implementation time: 3-4 weeks

### 27. Gift Packaging
- Support gift packaging options for prints, albums, and framed products.
- Include packaging material selection, gift note, and delivery instructions.
- Priority: P1
- Complexity: Medium
- Dependencies: Product catalog, fulfillment workflow
- Estimated implementation time: 2-3 weeks

### 28. Notifications
- Send order updates, payment confirmations, processing status, approval requests, shipment events, and delivery notices.
- Support email and SMS-first channels with WhatsApp as a future enhancement.
- Priority: P0
- Complexity: Medium
- Dependencies: Email service, notification templates, event bus
- Estimated implementation time: 2-3 weeks

### 29. Email
- Send transactional emails for welcome, order creation, approval, payment, delivery, and support communication.
- Support branded templates and localization.
- Priority: P0
- Complexity: Medium
- Dependencies: Email provider integration, template management
- Estimated implementation time: 2-3 weeks

### 30. WhatsApp (Future Only)
- Prepare the platform for future WhatsApp-based intake, order updates, approval reminders, and support messaging.
- Keep this as a future phase and do not make it a blocker for the MVP.
- Priority: P2
- Complexity: Medium
- Dependencies: WhatsApp business API, webhook architecture, message templates
- Estimated implementation time: 4-6 weeks

## Non Functional Requirements
- Reliability: restoration and print jobs must be durable, retry-safe, and observable.
- Performance: preview generation should complete within acceptable SLA ranges for standard image sizes.
- Scalability: support bursts during wedding season and bulk album orders.
- Security: protect customer images, signed downloads, and payment information.
- Privacy: enforce consent rules for family photos and sensitive documents.
- Auditability: each restoration and fulfillment step must be logged with timestamps and actor metadata.
- Accessibility: admin and customer flows must be usable on desktop and mobile.
- Localization: support Urdu and English in the initial Pakistan launch.
- Priority: P0
- Complexity: High
- Dependencies: Infrastructure monitoring, observability, security review, content policy handling
- Estimated implementation time: 3-4 weeks for baseline requirements and controls

## Database Changes
- The plan assumes schema additions only and does not redesign the existing database.
- Proposed additions:
  - restoration_orders: order-level metadata, package type, restoration tier, approval status, shipping preference
  - restoration_items: image-level records, source file references, processing status, quality score, revision count
  - restoration_jobs: background job state, worker type, AI provider, retry count, output artifact references
  - restoration_artifacts: original, preview, final, mask, and before/after versions
  - print_orders: print job metadata, print size, paper type, frame selection, packaging option
  - album_projects: album creation jobs, layout template, page count, cover design, print status
  - courier_shipments: shipment ID, carrier, status, tracking URL, address snapshot
  - quality_reviews: reviewer notes, approval decision, issue flag, customer feedback
  - customer_support_cases: operational cases linked to orders and shipments
- Recommended indexing strategy: order number, customer ID, job status, artifact type, shipment tracking number, and approval state.
- Priority: P0
- Complexity: Medium
- Dependencies: Existing Prisma or ORM schema, migration discipline, data retention policy
- Estimated implementation time: 2-3 weeks for schema design and migration planning

## API Design
- The API layer should be extended with restoration-specific routes that mirror the current platform’s structure and permission model.
- Proposed endpoints:

| Endpoint | Purpose | Request | Response | Permissions |
|---|---|---|---|---|
| POST /restorations | Create a new restoration order | customerId, packageId, itemCount, serviceTier | restorationOrder summary | Customer |
| GET /restorations/:id | Retrieve restoration order details | orderId | order, progress, artifacts | Customer/Admin |
| POST /restorations/:id/items | Attach uploaded images to a restoration order | imageIds, metadata | item list | Customer |
| POST /restorations/:id/quality-analysis | Run AI quality analysis | imageIds | quality report and recommendations | Customer/System |
| POST /restorations/:id/preview | Generate preview set | imageIds, options | preview URLs | Customer/System |
| POST /restorations/:id/approve | Approve or reject restoration output | approvalDecision, notes | updated order state | Customer/Admin |
| POST /restorations/:id/reprocess | Request a revision or reprocessing | reason, selected steps | new job state | Customer/Admin |
| POST /restorations/:id/download | Create secure download access | fileType, expiry | signed URL | Customer |
| POST /prints | Create a print order | itemIds, size, paper, frame, address | print order summary | Customer |
| GET /prints/:id | Fetch print order status | printId | status, packaging, shipment | Customer/Admin |
| POST /prints/:id/ship | Submit print order for fulfillment | carrier, labelData | shipment summary | Admin |
| GET /couriers/track/:trackingNo | Track shipment | trackingNo | shipment milestone list | Customer/Admin |
| POST /albums | Create album project | sourceItems, templateId, coverStyle | album project summary | Customer |
| GET /albums/:id | Fetch album project progress | albumId | layout and status | Customer/Admin |
| POST /albums/:id/approve | Approve album design | approvalDecision | updated album state | Customer |
| POST /notifications/send | Trigger a notification event | channel, template, recipient | delivery status | System/Admin |
| GET /admin/restorations | List all restoration orders | filters | paginated order list | Admin |
| GET /admin/prints | List all print orders | filters | paginated print list | Admin |
| GET /admin/analytics | Retrieve revenue and operations analytics | range | KPI report | Admin |
| POST /admin/refunds | Create refund workflow | orderId, reason | refund reference | Admin |
| POST /admin/production/assign | Assign work to operations team | jobId, assignee | job assignment result | Admin |
- Priority: P0
- Complexity: High
- Dependencies: Existing API structure, auth middleware, role-based access control, storage signed URLs
- Estimated implementation time: 4-5 weeks for core API surface

## Frontend
- The frontend should be expanded with a restoration-first customer experience and an admin console optimized for operations.
- Customer-facing screens:
  - package selection and pricing
  - upload and drag-and-drop flow
  - quality analysis preview
  - restoration preview and approval
  - digital download and print order
  - order history and tracking
- Admin screens:
  - restoration order management
  - print queue and fulfillment board
  - courier tracking and exception handling
  - refund and support case views
  - revenue and operations analytics
- Priority: P0
- Complexity: High
- Dependencies: Existing web app shell, design system, admin routes, state management
- Estimated implementation time: 6-8 weeks for customer and admin UI

## Backend
- Extend existing backend services with dedicated modules for restoration orchestration, print orchestration, album generation, quality scoring, approvals, notifications, and fulfillment dispatch.
- Core backend services:
  - RestorationService
  - QualityAnalysisService
  - InpaintingServiceAdapter
  - FaceRestorationServiceAdapter
  - PrintFulfillmentService
  - AlbumBuilderService
  - NotificationService
  - AdminOperationsService
- Worker responsibilities:
  - process restoration jobs
  - generate previews
  - manage retries and failure states
  - trigger print workflow after approval
  - create courier manifest and shipping events
- Priority: P0
- Complexity: High
- Dependencies: Existing service architecture, queue workers, storage layer, AI provider abstraction
- Estimated implementation time: 6-8 weeks

## AI Pipeline
- The AI pipeline should be implemented in phases to balance speed, cost, and future independence.
- Phase 1: commercial API approach
  - Use external APIs for scratch removal, face restoration, super-resolution, colorization, and enhancement.
  - Keep the orchestration layer provider-agnostic so the platform can swap providers without redesign.
  - Best candidate providers should be evaluated by quality, cost, latency, and compliance for Pakistan-first launch.
- Phase 2: own models
  - Introduce in-house or open-source models for core restoration tasks once demand and quality thresholds are met.
  - Open-source options should be evaluated for inpainting, face restoration, denoising, and super-resolution.
  - Migration path should preserve the same job contract and artifact storage standard so model swaps are low-risk.
- Recommended pipeline sequence:
  1. Image assessment and damage scoring
  2. Scratch and dust detection
  3. Damage region inpainting or reconstruction
  4. Face restoration and enhancement
  5. Color correction and colorization
  6. Upscaling and final quality check
  7. Preview generation and approval
  8. Final export for digital download or print
- Priority: P0
- Complexity: Very High
- Dependencies: AI provider evaluation, GPU capacity, model licensing, local validation pipeline
- Estimated implementation time: 8-12 weeks for Phase 1, 6-9 months for Phase 2

## Printing Pipeline
- The printing workflow should be designed for digital restoration outputs that are then turned into physical products.
- Workflow:
  1. Customer selects print type and size
  2. Approved final asset is exported in print-ready resolution
  3. Print job is queued and validated for size, color profile, and cropping
  4. File is packaged and sent to printing vendor
  5. Print job is reviewed for quality control
  6. Packaging and courier dispatch are executed
  7. Tracking and support visibility are enabled
- Supported products:
  - 4x6
  - 5x7
  - 8x10
  - A4
  - A3
  - Canvas
  - Frames
  - Albums
- Priority: P0
- Complexity: High
- Dependencies: Print vendor integration, quality control SOPs, packaging process, courier API
- Estimated implementation time: 6-8 weeks

## Album Pipeline
- The album pipeline should support multiple album types created from uploaded photo sets.
- Workflow:
  1. Customer uploads 10, 50, 100, or 500 photos
  2. System groups them chronologically or by event type
  3. Album template is selected from wedding, family, memory book, or chronology options
  4. Layouts are generated and reviewed by the customer
  5. Approved album is sent to print queue for production
- Supported album formats:
  - Chronological Album
  - Memory Book
  - Wedding Album
  - Family Album
- Priority: P1
- Complexity: High
- Dependencies: Template engine, packaging workflow, print queue, customer approval
- Estimated implementation time: 5-7 weeks

## Operations
- Define operating procedures for quality control, fulfillment, packaging, courier handoff, returns, and customer support.
- Recommended operating model:
  - Customer support handles case intake and status updates
  - Operations team reviews print quality and exception orders
  - Production team manages queue health and reprocessing requests
  - Finance handles refunds and payment disputes
- Operational stages:
  - Print workflow
  - Quality control checkpoints
  - Packaging and dispatch
  - Courier handoff
  - Returns and replacement policy
  - Customer support escalation path
- Priority: P0
- Complexity: Medium
- Dependencies: SOPs, support tooling, warehouse/fulfillment partner, admin dashboard
- Estimated implementation time: 3-4 weeks for SOP design and rollout

## Deployment Strategy
- Deploy the platform in staged release waves to reduce risk.
- Phase 0: planning and design
- Phase 1: digital restoration MVP for Pakistan
- Phase 2: printing and shipping
- Phase 3: album and gift products
- Phase 4: owned AI models and infrastructure optimization
- Phase 5: scaling and international expansion
- Recommended environment model:
  - staging environment for QA and AI provider validation
  - production environment with isolated jobs and monitoring
  - backup/restore and artifact retention policies
- Priority: P0
- Complexity: Medium
- Dependencies: Existing CI/CD, environment variables, monitoring stack, release governance
- Estimated implementation time: 2-3 weeks for release planning and process setup

## Testing Strategy
- Testing must cover both product experience and AI reliability.
- Test categories:
  - Unit tests for service logic and pricing rules
  - Integration tests for orders, uploads, queues, and downloads
  - End-to-end tests for customer flow and admin workflow
  - AI validation tests for restoration quality, masking, and output consistency
  - Print workflow tests for file output and packaging metadata
  - Regression tests for payments, approvals, and notifications
- Priority: P0
- Complexity: Medium
- Dependencies: QA environment, test fixtures, provider sandbox access, admin test accounts
- Estimated implementation time: 3-4 weeks for test harness design and execution planning

## Security
- Secure customer images and personal data throughout the restoration lifecycle.
- Security controls:
  - role-based access for customers and admins
  - signed URLs for media download
  - encryption at rest and in transit
  - audit logs for order changes and admin actions
  - approval gates for refunds and sensitive operations
  - vendor and API key management
- Priority: P0
- Complexity: High
- Dependencies: Security review, secrets management, compliance checks, retention policy
- Estimated implementation time: 2-3 weeks for baseline controls and review

## KPIs
- Digital restoration conversion rate
- Restoration completion rate
- Average processing time per job
- Approval-to-purchase conversion rate
- Print order conversion rate
- Cost per restoration job
- Refund rate and reprocessing rate
- Customer satisfaction score and repeat purchase rate
- Priority: P0
- Complexity: Low
- Dependencies: Analytics instrumentation, dashboard reporting, event logging
- Estimated implementation time: 2 weeks for KPI design and instrumentation

## Risk Analysis
- AI output quality may vary by image condition; mitigate through quality scoring, human review, and tiered packages.
- Print vendor reliability may affect delivery SLAs; mitigate with backup vendors and SLAs.
- Courier delays may impact customer satisfaction; mitigate with proactive notifications and delivery guarantees.
- Cost of commercial AI APIs may become unstable; mitigate with provider abstraction and future owned-model strategy.
- Privacy concerns for family and historical images; mitigate with explicit consent flows and secure storage controls.
- Priority: P0
- Complexity: Medium
- Dependencies: Supplier evaluation, operational readiness, support policy design
- Estimated implementation time: 2 weeks for risk review and mitigation mapping

## Launch Checklist
- Finalize package catalog and pricing for Pakistan
- Configure payment methods and refund policy
- Validate upload, processing, preview, approval, and download flows
- Activate notification templates and email delivery
- Test print order and courier workflows in staging
- Prepare support SOPs and admin workflows
- Verify storage retention and cleanup rules
- Launch with limited initial capacity and monitor KPIs closely
- Priority: P0
- Complexity: Medium
- Dependencies: Cross-functional readiness, vendor onboarding, support staffing
- Estimated implementation time: 2 weeks for launch readiness

## Success Metrics
- Reach a stable digital restoration completion rate with low failure volume
- Achieve strong approval and purchase conversion for restoration packages
- Deliver print orders with acceptable turnaround time and low defect rate
- Build strong repeat purchase behavior from family, wedding, and professional customers
- Establish a reliable foundation for expansion into global markets after Pakistan launch
- Priority: P0
- Complexity: Low
- Dependencies: Analytics instrumentation and reporting cadence
- Estimated implementation time: 1-2 weeks for success metric definition

## Implementation Timeline
- Phase 0: Planning and product design, 2-3 weeks
- Phase 1: Digital restoration MVP, 8-10 weeks
- Phase 2: Printing and fulfillment, 6-8 weeks
- Phase 3: Albums and premium gifting, 5-7 weeks
- Phase 4: Owned AI models and optimization, 6-9 months
- Phase 5: Scaling and global expansion, 6-12 months
- Priority: P0
- Complexity: Medium
- Dependencies: Delivery team capacity, AI provider onboarding, fulfillment partner setup
- Estimated implementation time: 16-20 weeks for MVP delivery and 9-12 months for full roadmap maturity

## Future Roadmap
- Add WhatsApp-based order intake and updates after the core platform is stable
- Add more advanced restoration features such as document reconstruction and archival preservation
- Expand to B2B service offerings for photographers, wedding studios, and historical institutions
- Introduce subscription-based memory preservation and recurring restoration packages
- Build a stronger global operations layer for international fulfillment and multilingual support
- Priority: P1
- Complexity: Medium
- Dependencies: MVP success, vendor partnerships, regional expansion readiness
- Estimated implementation time: 6-12 months
