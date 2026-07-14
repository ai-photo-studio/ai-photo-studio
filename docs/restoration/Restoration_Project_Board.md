# Restoration Project Board

**Board ID:** restoration-r1-planning  
**Created:** 2026-07-13  
**Status:** Planning Audit Complete  

---

## Kanban Board

### BACKLOG

#### Digital Restoration - Core Features
- [ ] Restoration Order Creation API
- [ ] Restoration Item Model (Database)
- [ ] Restoration Job Model (Database)
- [ ] Image Upload Endpoint
- [ ] AI Quality Analysis Service
- [ ] Scratch Detection Provider
- [ ] Scratch Removal Provider
- [ ] Dust Removal Provider
- [ ] Crack Repair Provider
- [ ] Face Restoration Provider
- [ ] Upscaling Provider
- [ ] Color Correction Provider
- [ ] Colorization Provider
- [ ] Background Cleanup Provider
- [ ] Enhancement Orchestration
- [ ] Preview Generation Service
- [ ] Approval Workflow Service
- [ ] Digital Download Endpoint

#### Printing Pipeline
- [ ] Print Order Model (Database)
- [ ] Print Size Catalog
- [ ] Paper Type Catalog
- [ ] Print Order API
- [ ] Print Vendor Integration
- [ ] Print Quality Control
- [ ] Packaging Options

#### Album Builder
- [ ] Album Project Model (Database)
- [ ] Album Template Engine
- [ ] Layout Selection Logic
- [ ] Chronological Grouping
- [ ] Event Type Grouping
- [ ] Album Print Export

#### Frame Builder
- [ ] Frame Size Model
- [ ] Border Style Model
- [ ] Frame Layout Generator
- [ ] Frame Order API

#### Courier Integration
- [ ] Courier API Integration
- [ ] Shipment Manifest Model
- [ ] Tracking Service
- [ ] Courier Webhooks

#### Admin & Analytics
- [ ] Restoration Dashboard
- [ ] Restoration Order Management
- [ ] Print Queue Management
- [ ] Courier Tracking Admin
- [ ] Restoration Analytics

#### Infrastructure
- [ ] Database Migrations
- [ ] API Documentation
- [ ] Monitoring Setup
- [ ] Alerting Rules

---

### READY

#### Phase R1 - Digital Restoration MVP (Priority: P0)
- [ ] Restoration API Routes
- [ ] Restoration Services
- [ ] Quality Analysis Provider
- [ ] Preview Generation
- [ ] Download Endpoint
- [ ] Admin Views

**Dependencies:** Auth, Billing, Storage, Queue  
**Estimated Effort:** 8-10 weeks

---

### DEVELOPMENT

#### Current Sprint (Empty - Planning Phase)
*No items currently in development*

---

### TESTING

#### QA Pipeline
*No items currently in testing*

---

### COMPLETED

#### Foundation Components
- [x] Authentication System
  - Location: `apps/api/src/middleware/auth.middleware.ts`
  - Status: ✅ Production ready
  
- [x] Billing System
  - Location: `apps/api/src/services/payment.service.ts`
  - Status: ✅ Production ready
  
- [x] Credits/Wallet System
  - Location: `apps/api/src/services/wallet.service.ts`
  - Status: ✅ Production ready
  
- [x] Queue Infrastructure
  - Location: `apps/api/src/queues/phase-c-image-processing.queue.ts`
  - Status: ✅ Production ready
  
- [x] Storage (Cloudflare R2)
  - Location: `apps/api/src/services/storage.service.ts`
  - Status: ✅ Production ready
  
- [x] Notification System
  - Location: `apps/api/src/services/notification.service.ts`
  - Status: ⚠️ Basic (WhatsApp dry-run mode)
  
- [x] Admin Dashboard
  - Location: `apps/web/src/pages/AdminDashboard.tsx`
  - Status: ✅ Production ready
  
- [x] API Middleware
  - Location: `apps/api/src/middleware/`
  - Status: ✅ Production ready
  
- [x] Rate Limiting
  - Location: `apps/api/src/middleware/rate-limit.middleware.ts`
  - Status: ✅ Production ready
  
- [x] AI Provider Framework
  - Location: `apps/api/src/providers/provider.interface.ts`
  - Status: ✅ Production ready
  
- [x] Image Processing Pipeline
  - Location: `apps/api/src/services/image-processing.service.ts`
  - Status: ✅ Production ready
  
- [x] Worker Infrastructure
  - Location: `apps/api/src/workers/image-processing.worker.ts`
  - Status: ✅ Production ready
  
- [x] Database Schema
  - Location: `apps/api/prisma/schema.prisma`
  - Status: ✅ Production ready
  
- [x] Audit Logging
  - Location: `apps/api/src/services/admin.service.ts`
  - Status: ✅ Production ready

---

## Sprint Planning

### Sprint 1 (Week 1-2): API Foundation
**Goal:** Establish restoration API surface

**Stories:**
1. Create Restoration API Routes
   - POST /restorations
   - GET /restorations/:id
   - POST /restorations/:id/items
   - DELETE /restorations/:id

**Tasks:**
- [ ] Create restoration.routes.ts
- [ ] Create restoration.controller.ts
- [ ] Create restoration.service.ts
- [ ] Add database models (Prisma)
- [ ] Add middleware for restoration endpoints

---

### Sprint 2 (Week 3-4): Upload & Processing
**Goal:** Enable image upload and initial processing

**Stories:**
1. Image Upload Endpoint
   - Support single and batch uploads
   - Metadata capture
   - Storage integration

**Stories:**
2. Quality Analysis Integration
   - Provider abstraction
   - Quality scoring
   - Damage assessment

**Tasks:**
- [ ] Create upload controller
- [ ] Integrate with StorageService
- [ ] Create quality analysis service
- [ ] Add quality score model

---

### Sprint 3 (Week 5-6): Restoration Operations
**Goal:** Implement core restoration operations

**Stories:**
1. Scratch Detection & Removal
2. Dust Removal
3. Crack Repair
4. Face Restoration
5. Upscaling

**Tasks:**
- [ ] Create restoration providers
- [ ] Implement mask generation
- [ ] Create inpainting service
- [ ] Add face enhancement
- [ ] Integrate with worker

---

### Sprint 4 (Week 7-8): Customer Experience
**Goal:** Enable customer workflows

**Stories:**
1. Preview Generation
2. Approval Workflow
3. Digital Download
4. Admin Dashboard Views

**Tasks:**
- [ ] Create preview endpoint
- [ ] Implement approval flow
- [ ] Add download controller
- [ ] Create restoration admin pages

---

## Epic Status

| Epic | Status | Progress | Next Action |
|------|--------|----------|-------------|
| Digital Restoration MVP | Backlog | 0% | Create implementation backlog |
| Printing Pipeline | Backlog | 0% | Define print models |
| Album Builder | Backlog | 0% | Define album models |
| Frame Builder | Backlog | 0% | Define frame models |
| Courier Integration | Backlog | 0% | Research courier APIs |
| Own AI Models | Backlog | 0% | Plan model training |

---

## Milestone Tracking

| Milestone | Target Date | Status | Dependencies |
|-----------|-------------|--------|--------------|
| API Routes Defined | 2026-07-20 | ✅ Planning | None |
| Database Models | 2026-07-27 | Pending | Schema design |
| Quality Analysis | 2026-08-10 | Pending | Provider selection |
| Upload Endpoint | 2026-08-17 | Pending | Storage ready |
| Restoration Worker | 2026-08-24 | Pending | Quality analysis |
| Preview Generation | 2026-08-31 | Pending | Processing complete |
| Download Endpoint | 2026-09-07 | Pending | Storage ready |
| Admin Dashboard | 2026-09-14 | Pending | API ready |
| Full MVP Launch | 2026-09-21 | Pending | All above |

---

## Labels

- `p0` - Priority 0 (Critical)
- `p1` - Priority 1 (High)
- `p2` - Priority 2 (Medium)
- `backend` - API/backend work
- `frontend` - Web UI work
- `database` - Database/schema work
- `provider` - AI provider integration
- `api` - API endpoint work
- `admin` - Admin dashboard work
- `customer` - Customer-facing features
- `infrastructure` - DevOps/infrastructure

---

## Board Settings

- **Default Assignee:** (Not set)
- **Default Reviewers:** (Not set)
- **Automation Rules:**
  - When status changes to "In Progress" → Assign to current sprint
  - When status changes to "Completed" → Remove from active sprint
  - When label added "P0" → Move to top of backlog