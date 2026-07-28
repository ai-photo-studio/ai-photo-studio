# Restoration SOTA Research

**Date:** 2026-07-13  
**Research Type:** State-of-the-Art Analysis for Digital Restoration Platform  

---

## Executive Summary

This document presents a comprehensive analysis of state-of-the-art (SOTA) open-source restoration projects and compares them against the existing AI Product Photo Studio platform. The research identifies the most suitable features, models, and architectures for implementing a digital restoration MVP.

**Key Findings:**
1. **Microsoft's Bringing Old Photos Back to Life** is the most academically rigorous implementation, using latent space translation for comprehensive restoration
2. **Real-ESRGAN, GFPGAN, and CodeFormer** are the dominant models for upscaling and face restoration
3. **ComfyUI ecosystem** provides the best modular pipeline architecture
4. The existing platform has solid foundations (auth, billing, queue, storage) that can be extended
5. Recommended approach: Adopt Microsoft's pipeline architecture with local models (Real-ESRGAN, GFPGAN, CodeFormer)

**Recommendation:** Proceed with Phase R1 implementation using local model providers, extending existing infrastructure rather than replacing it.

---

## Repository Comparison

### 1. Microsoft - Bringing Old Photos Back to Life

| Attribute | Value |
|-----------|-------|
| **GitHub Stars** | 15,700+ |
| **Last Update** | July 2021 (archived) |
| **License** | MIT |
| **Language** | Python |
| **Framework** | PyTorch |
| **Architecture** | Monolithic Python scripts |
| **Deployment** | Python CLI, Docker available |
| **Docker** | ✅ Yes |
| **API** | ❌ No REST API |
| **Queue** | ❌ No queue system |
| **Database** | ❌ No database |
| **Authentication** | ❌ No auth |
| **Admin Panel** | ❌ No admin panel |
| **Worker System** | ❌ No worker system |
| **GPU Support** | ✅ CUDA required |
| **ComfyUI** | ❌ No |
| **REST API** | ❌ No |
| **CLI** | ✅ Yes |
| **Batch Processing** | ✅ Yes |
| **Video Support** | ❌ No |
| **Album Support** | ❌ No |
| **Printing Support** | ❌ No |
| **Commercial Ready** | ⚠️ Research only |

**Key Features:**
- Global restoration (scratch removal, quality enhancement)
- Face enhancement with progressive generator
- Scratch detection and processing
- High-resolution support
- No commercial wrapper

---

### 2. 302AI - 302 Photo Restore

| Attribute | Value |
|-----------|-------|
| **GitHub Stars** | 24 |
| **Last Update** | Recent |
| **License** | GPL-3.0 |
| **Language** | TypeScript |
| **Framework** | Next.js 14 |
| **Architecture** | Web application |
| **Deployment** | Vercel-ready |
| **Docker** | ✅ Yes |
| **API** | ✅ Internal API |
| **Queue** | ✅ API-based queuing |
| **Database** | ✅ Prisma + PostgreSQL |
| **Authentication** | ✅ Google OAuth |
| **Admin Panel** | ⚠️ Basic |
| **Worker System** | ✅ External API workers |
| **GPU Support** | ❌ External API |
| **ComfyUI** | ❌ No |
| **REST API** | ⚠️ Internal only |
| **CLI** | ❌ No |
| **Batch Processing** | ✅ Yes |
| **Video Support** | ✅ Yes |
| **Album Support** | ✅ Yes |
| **Printing Support** | ✅ Yes |
| **Commercial Ready** | ✅ Yes |

**Key Features:**
- Multi-language support (Chinese, English, Japanese)
- Video generation from photos
- History records
- Task management
- Commercial API integration

---

### 3. thepirat000 - Photo Restoration API

| Attribute | Value |
|-----------|-------|
| **GitHub Stars** | 11 |
| **Last Update** | Recent |
| **License** | MIT |
| **Language** | C# |
| **Framework** | .NET |
| **Architecture** | Web API |
| **Deployment** | Azure-ready |
| **Docker** | ❌ No |
| **API** | ✅ REST API |
| **Queue** | ❌ No |
| **Database** | ❌ No |
| **Authentication** | ❌ No |
| **Admin Panel** | ❌ No |
| **Worker System** | ❌ No |
| **GPU Support** | ⚠️ Via API |
| **ComfyUI** | ❌ No |
| **REST API** | ✅ Yes |
| **CLI** | ✅ C# CLI |
| **Batch Processing** | ✅ Yes |
| **Video Support** | ❌ No |

**Key Features:**
- Web API wrapper around Microsoft models
- Live demo available
- C# implementation

---

### 4. Haoming02 - ComfyUI Old Photo Restoration

| Attribute | Value |
|-----------|-------|
| **GitHub Stars** | 66 |
| **Last Update** | July 2025 (archived) |
| **License** | MIT |
| **Language** | Python |
| **Framework** | ComfyUI |
| **Architecture** | Custom nodes |
| **Deployment** | ComfyUI |
| **Docker** | ✅ Yes |
| **API** | ✅ ComfyUI API |
| **Queue** | ✅ Built-in |
| **Database** | ❌ No |
| **Authentication** | ❌ No |
| **Admin Panel** | ❌ No |
| **Worker System** | ✅ ComfyUI workers |
| **GPU Support** | ✅ CUDA |
| **ComfyUI** | ✅ Native |
| **REST API** | ✅ ComfyUI API |
| **CLI** | ✅ Yes |
| **Batch Processing** | ✅ Yes |
| **Video Support** | ✅ Yes |
| **Album Support** | ❌ No |
| **Printing Support** | ❌ No |
| **Commercial Ready** | ⚠️ Requires ComfyUI |

**Key Features:**
- ComfyUI custom nodes
- Workflow visualization
- Multiple checkpoint support
- GPU acceleration

---

### 5. Anil-matcha - Awesome Generative AI Apps

| Attribute | Value |
|-----------|-------|
| **GitHub Stars** | 2,600+ |
| **Last Update** | Recent |
| **License** | MIT |
| **Language** | JavaScript/TypeScript |
| **Framework** | Next.js, React |
| **Architecture** | SaaS templates |
| **Deployment** | Vercel |
| **Docker** | ✅ Yes |
| **API** | ✅ External API |
| **Queue** | ✅ External API |
| **Database** | ✅ Prisma |
| **Authentication** | ✅ Stripe + Google |
| **Admin Panel** | ✅ Built-in |
| **Worker System** | ✅ External API |
| **GPU Support** | ❌ External API |
| **ComfyUI** | ❌ No |
| **REST API** | ⚠️ Template-based |
| **CLI** | ❌ No |
| **Batch Processing** | ✅ Credit-based |
| **Video Support** | ✅ Yes |
| **Album Support** | ✅ Yes |
| **Printing Support** | ✅ Yes |
| **Commercial Ready** | ✅ Yes |

**Key Features:**
- 50+ SaaS templates
- Stripe billing integration
- Google OAuth
- Credit-based system
- Pre-built UIs

---

## Feature Matrix

| Feature | Our Project | Microsoft | 302AI | ComfyUI | Anil-matcha |
|---------|-------------|-----------|-------|---------|-------------|
| Authentication | ✅ JWT | ❌ | ✅ OAuth | ❌ | ✅ OAuth |
| Billing | ✅ Stripe | ❌ | ✅ | ❌ | ✅ Stripe |
| Credits | ✅ Wallet | ❌ | ✅ | ❌ | ✅ Credit packs |
| Queue | ✅ BullMQ | ❌ | ✅ | ✅ | ✅ External |
| Storage | ✅ R2 | ❌ | ✅ | ✅ | ✅ |
| Cloudflare R2 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Notifications | ⚠️ WhatsApp | ❌ | ❌ | ❌ | ❌ |
| Email | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin Panel | ✅ | ❌ | ⚠️ | ❌ | ✅ |
| Audit | ✅ Logs | ❌ | ❌ | ❌ | ❌ |
| Logging | ✅ Winston | ❌ | ❌ | ❌ | ❌ |
| SAM2 | ✅ GPU | ❌ | ❌ | ❌ | ❌ |
| Image Pipeline | ✅ | ✅ | ✅ | ✅ | ✅ |
| Background Jobs | ✅ Worker | ❌ | ✅ | ✅ | ✅ |
| API Middleware | ✅ | ❌ | ❌ | ❌ | ❌ |
| Rate Limiting | ✅ | ❌ | ❌ | ❌ | ❌ |
| Validation | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Architecture Matrix

| Component | Our Project | Microsoft | 302AI | ComfyUI | Anil-matcha |
|-----------|-------------|-----------|-------|---------|-------------|
| **Backend** | Express + TypeScript | Python | Next.js | Python | Next.js |
| **Frontend** | React + Vite | None | Next.js | None | React |
| **Database** | PostgreSQL | None | PostgreSQL | None | PostgreSQL |
| **ORM** | Prisma | None | Prisma | None | Prisma |
| **Queue** | BullMQ | None | API | Built-in | External API |
| **Storage** | Cloudflare R2 | Local | Local | Local | Local |
| **Deployment** | Cloud Run | Docker | Vercel | Docker | Vercel |
| **Auth** | JWT | None | Google OAuth | None | Google OAuth |
| **Billing** | Payment providers | None | Stripe | None | Stripe |

---

## Pipeline Matrix

| Stage | Our Project | Microsoft | ComfyUI | 302AI |
|-------|-------------|-----------|---------|-------|
| **Image Assessment** | ❌ | ✅ | ✅ | ✅ |
| **Scratch Detection** | ❌ | ✅ | ✅ | ✅ |
| **Damage Scoring** | ❌ | ✅ | ✅ | ✅ |
| **Scratch Removal** | ❌ | ✅ | ✅ | ✅ |
| **Dust Removal** | ❌ | ❌ | ✅ | ✅ |
| **Crack Repair** | ❌ | ❌ | ✅ | ✅ |
| **Face Restoration** | ❌ | ✅ | ✅ | ✅ |
| **Colorization** | ❌ | ✅ | ✅ | ✅ |
| **Upscaling** | ❌ | ✅ | ✅ | ✅ |
| **Background Cleanup** | ❌ | ✅ | ✅ | ✅ |
| **Quality Scoring** | ❌ | ✅ | ✅ | ✅ |
| **Preview Generation** | ❌ | ❌ | ✅ | ✅ |
| **Approval Workflow** | ❌ | ❌ | ❌ | ✅ |

---

## AI Model Matrix

| Model | Purpose | Our Project | Microsoft | GFPGAN | CodeFormer | Real-ESRGAN | LaMa |
|-------|---------|-------------|-----------|--------|------------|-------------|------|
| **Scratch Removal** | Inpainting | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Crack Repair** | Inpainting | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Dust Removal** | Denoising | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Noise Removal** | Denoising | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Face Restoration** | Enhancement | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Colorization** | Color add | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Upscaling** | Super-res | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Inpainting** | Mask-based | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Background Cleanup** | Segmentation | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Document Repair** | Text restoration | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Film Restoration** | Video | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Video Restoration** | Video | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## Commercial Readiness

| Aspect | Our Project | Microsoft | 302AI | ComfyUI | Anil-matcha |
|--------|-------------|-----------|-------|---------|-------------|
| **SaaS Ready** | ✅ | ❌ | ✅ | ⚠️ | ✅ |
| **Billing** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Auth** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Queue** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Storage** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ❌ | ⚠️ | ❌ | ✅ |
| **Multi-tenant** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Scalable** | ✅ | ⚠️ | ✅ | ✅ | ✅ |

---

## Scalability

| Metric | Our Project | Microsoft | 302AI | ComfyUI |
|--------|-------------|-----------|-------|---------|
| **Horizontal Scaling** | ✅ | ❌ | ✅ | ✅ |
| **Auto-scaling** | ✅ | ❌ | ✅ | ⚠️ |
| **Load Balancing** | ✅ | ❌ | ✅ | ✅ |
| **Queue-based** | ✅ | ❌ | ✅ | ✅ |
| **Retry Logic** | ✅ | ❌ | ✅ | ✅ |

---

## License Compatibility

| Repository | License | Compatible with MIT |
|------------|---------|---------------------|
| Our Project | MIT | N/A |
| Microsoft | MIT | ✅ Yes |
| 302AI | GPL-3.0 | ⚠️ Requires review |
| ComfyUI | MIT + Model licenses | ✅ Yes |
| Anil-matcha | MIT | ✅ Yes |
| GFPGAN | MIT | ✅ Yes |
| CodeFormer | NTU S-Lab | ⚠️ Non-commercial |
| Real-ESRGAN | BSD-3-Clause | ✅ Yes |
| LaMa | MIT | ✅ Yes |

---

## Production Readiness

| Criterion | Our Project | Microsoft | 302AI | ComfyUI |
|-----------|-------------|-----------|-------|---------|
| **Error Handling** | ✅ | ⚠️ | ✅ | ✅ |
| **Logging** | ✅ | ❌ | ✅ | ⚠️ |
| **Monitoring** | ✅ | ❌ | ✅ | ⚠️ |
| **Health Checks** | ✅ | ❌ | ✅ | ✅ |
| **Alerts** | ⚠️ | ❌ | ✅ | ⚠️ |
| **Backups** | ✅ | ❌ | ✅ | ❌ |
| **Disaster Recovery** | ⚠️ | ❌ | ⚠️ | ⚠️ |

---

## What We Should Adopt

### Models
1. **Real-ESRGAN** - For upscaling (already in project)
2. **GFPGAN** - For face restoration (extend gpu-sam2.provider.ts)
3. **CodeFormer** - Alternative face restoration (higher quality)
4. **LaMa** - For inpainting/scratch removal
5. **DDColor** - For colorization

### Pipeline Stages
1. Image assessment and damage scoring (Microsoft approach)
2. Scratch/dust detection with mask generation
3. Selective inpainting for damage repair
4. Face restoration with GFPGAN/CodeFormer
5. Upscaling with Real-ESRGAN
6. Color correction and colorization
7. Preview generation
8. Approval workflow

### Architecture
1. **Extend** existing provider abstraction (not replace)
2. **Add** restoration-specific services
3. **Use** existing queue workers with new job types
4. **Reuse** storage layer for artifacts
5. **Extend** admin dashboard for restoration views

---

## What We Should Reject

1. **Replace** existing auth system - extend instead
2. **Replace** billing system - extend instead
3. **Replace** queue infrastructure - extend instead
4. **Replace** storage layer - extend instead
5. **Monorepo** approach from 302AI - keep microservices
6. **External API** dependency - use local models
7. **GPL-3.0** licensed components (302AI) - incompatible

---

## Gap Analysis

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| **No quality analysis service** | High | Build QualityAnalysisService |
| **No restoration models** | High | Integrate Real-ESRGAN, GFPGAN, LaMa |
| **No preview generation** | Medium | Use existing StorageService |
| **No approval workflow** | Medium | Extend OrderService |
| **No album support** | Low | Phase R3 |
| **No print integration** | Low | Phase R2 |
| **No courier tracking** | Low | Phase R5 |
| **Email provider missing** | Medium | Add SMTP integration |
| **No restoration admin views** | High | Build RestorationDashboard |

---

## Recommended Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Customer Portal                         │
│  - Package selection                                         │
│  - Upload flow                                               │
│  - Quality preview                                           │
│  - Approval workflow                                         │
│  - Digital download                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Express)                     │
│  - /restorations/* (NEW)                                     │
│  - /prints/* (NEW)                                           │
│  - /albums/* (NEW)                                           │
│  - Existing routes (UNCHANGED)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Queue (BullMQ)                            │
│  - image-processing (existing)                             │
│  - restoration-jobs (NEW)                                    │
│  - print-jobs (NEW)                                          │
│  - Dead letter queues                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Workers                                   │
│  - Image Processing Worker (existing, extended)            │
│  - Restoration Worker (NEW)                                  │
│  - Print Worker (NEW)                                        │
│  - Cleanup Worker (existing)                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI Providers                              │
│  - local-rembg (existing)                                    │
│  - local-yolo (existing)                                     │
│  - local-esrgan (existing)                                 │
│  - gpu-sam2 (existing)                                       │
│  - local-lama (NEW)                                          │
│  - local-gfpgan (NEW)                                        │
│  - local-codeformer (NEW)                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Storage (Cloudflare R2)                   │
│  - originals/                                                │
│  - previews/                                                 │
│  - finals/                                                   │
│  - masks/ (NEW)                                              │
│  - artifacts/ (NEW)                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                     │
│  - Existing models (unchanged)                               │
│  - restoration_orders (NEW)                                │
│  - restoration_items (NEW)                                   │
│  - restoration_jobs (NEW)                                    │
│  - restoration_artifacts (NEW)                               │
│  - print_orders (NEW)                                        │
│  - album_projects (NEW)                                      │
│  - courier_shipments (NEW)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Recommended Final AI Pipeline

```
┌─────────────────┐
│  Image Upload   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Quality Analysis│
│ - Damage scoring│
│ - Blur detection│
│ - Color analysis│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Scratch Detection│
│ - Mask generation│
│ - Severity score │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Dust Removal    │
│ - Denoising     │
│ - Speckle removal│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Scratch Removal │
│ - Inpainting    │
│ - Texture aware │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Face Restoration│
│ - GFPGAN/CodeFormer│
│ - Identity preserve│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Color Correction│
│ - White balance │
│ - Contrast adj  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Colorization    │
│ - B&W to color  │
│ - Historical   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Upscaling       │
│ - Real-ESRGAN   │
│ - 2x/4x/8x      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Background Clean│
│ - Segmentation  │
│ - Cleanup       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Preview Gen     │
│ - Low-res       │
│ - Before/After  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Customer Review │
│ - Approval      │
│ - Revisions     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Final Export    │
│ - High-res      │
│ - Download link │
└─────────────────┘
```

---

## Recommended Future Roadmap

### Phase R1 (0-10 weeks) - Digital Restoration MVP
- [ ] Quality analysis service
- [ ] Scratch detection & removal
- [ ] Dust removal
- [ ] Face restoration (GFPGAN)
- [ ] Upscaling (Real-ESRGAN)
- [ ] Color correction
- [ ] Preview generation
- [ ] Approval workflow
- [ ] Digital download

### Phase R2 (10-18 weeks) - Printing
- [ ] Print order model
- [ ] Print vendor integration
- [ ] Print quality control
- [ ] Packaging options

### Phase R3 (18-26 weeks) - Albums
- [ ] Album project model
- [ ] Template engine
- [ ] Layout selection
- [ ] Chronological grouping

### Phase R4 (26-30 weeks) - Frames
- [ ] Frame size catalog
- [ ] Border styles
- [ ] Layout generation

### Phase R5 (30-38 weeks) - Courier
- [ ] Courier API integration
- [ ] Shipment manifests
- [ ] Tracking webhooks

### Phase R6 (38+ weeks) - Own AI Models
- [ ] Model training pipeline
- [ ] Model serving
- [ ] A/B testing framework

---

## Conclusion

The research confirms that:

1. **Existing infrastructure is sufficient** - Auth, billing, queue, storage are production-ready
2. **Microsoft's pipeline is academically superior** - Use as reference for restoration workflow
3. **Local models are viable** - Real-ESRGAN, GFPGAN, LaMa provide good quality
4. **Commercial deployment requires integration** - Use existing platform as foundation
5. **Phased approach recommended** - Start with digital restoration, extend to printing/albums

**Next Step:** Proceed with Phase R1 implementation using local AI models, extending the existing provider abstraction.