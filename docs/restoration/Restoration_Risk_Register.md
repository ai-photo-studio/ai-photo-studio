# Restoration Risk Register

**Document Version:** 1.0  
**Last Updated:** 2026-07-13  
**Author:** Planning Audit  
**Status:** Draft - Phase R1 Planning

---

## Risk Matrix

| ID | Risk Type | Description | Likelihood | Impact | Risk Score | Mitigation | Rollback | Priority |
|----|-----------|-------------|------------|--------|------------|------------|----------|----------|
| R001 | Technical | AI model quality varies by image condition | Medium | High | 15 | Quality scoring, human review, tiered packages | Use fallback provider | P0 |
| R002 | Technical | Commercial AI API costs may become unstable | Medium | High | 15 | Provider abstraction, future owned-model strategy | Disable paid providers flag | P0 |
| R003 | Technical | GPU service availability for SAM2 | High | Medium | 12 | Local model fallback, queue retries | Route to CPU provider | P1 |
| R004 | Technical | Image processing latency exceeds SLA | Medium | Medium | 9 | Batch processing, async previews, quality tiers | Reduce processing complexity | P1 |
| R005 | Technical | Storage costs for restoration artifacts | Low | Medium | 6 | Lifecycle policies, cleanup workers | Archive old artifacts | P2 |
| R006 | Technical | Database schema migration failures | Low | High | 12 | Staged migrations, backup strategy | Migration rollback scripts | P0 |
| R007 | Technical | API rate limiting from external providers | Medium | Medium | 9 | Provider caching, request batching | Use local providers | P1 |
| R008 | Technical | Worker queue dead letters accumulation | Low | Medium | 6 | Dead letter queue monitoring, auto-retry | Manual review process | P2 |
| R009 | Technical | Cloudflare R2 availability issues | Low | Medium | 6 | Multi-region buckets, CDN fallback | Direct download links | P2 |
| R010 | Technical | Provider API changes/deprecation | Medium | High | 15 | Provider abstraction layer, version pinning | Revert to previous provider | P0 |

---

## Technical Risks

### R001: AI Model Quality Variability
**Description:** AI restoration outputs may vary significantly based on input image condition (damage level, resolution, format).

**Evidence:** 
- Current codebase uses local models (u2netp, YOLOv8, ESRGAN) with quality scoring
- `ImageQualityScore` model exists for tracking before/after scores
- Enhancement delta tracking in place

**Mitigation:**
- Implement quality scoring before processing
- Use `ImageProcessingService` with provider abstraction
- Implement manual review queue for low-confidence results
- Tiered package pricing based on quality expected

**Rollback:** Disable enhancement steps, use basic background removal only

### R002: Commercial API Cost Instability
**Description:** Using paid AI providers (photoroom, fal, replicate) may have unpredictable pricing.

**Evidence:**
- `PROVIDER_CAPABILITIES` in `provider.interface.ts` shows paid providers disabled
- Cost logging model `ProviderCostLog` exists
- Current providers are local-only (mock, local-rembg, local-yolo, local-esrgan, local-iclight, gpu-sam2)

**Mitigation:**
- Start with local models only
- Use `ProviderCostLog` for cost tracking
- Implement cost caps per job
- Provider abstraction allows switching

**Rollback:** Disable paid providers via configuration

### R003: GPU Service Availability
**Description:** GPU-accelerated services (SAM2, background removal) may have limited availability.

**Evidence:**
- `gpu-sam2` provider exists and is enabled
- `gpu-research-sam2` service in Cloud Run
- Multiple GPU regions (us-central1, us-east4)

**Mitigation:**
- CPU fallback providers available (local-rembg)
- Queue-based job processing with retries
- Health checks on GPU services
- Dead letter queue for failed jobs

**Rollback:** Route GPU jobs to CPU providers

### R004: Processing Latency
**Description:** Restoration operations may exceed acceptable latency for customer experience.

**Evidence:**
- Worker pattern already established
- Queue monitoring endpoints exist
- Processing metrics service tracks duration

**Mitigation:**
- Async processing with status polling
- Preview generation for quick feedback
- Quality-based processing tiers
- Queue depth monitoring

**Rollback:** Reduce processing steps, increase queue workers

### R005: Storage Cost Escalation
**Description:** Storing restoration artifacts (originals, previews, finals, masks) may increase costs.

**Evidence:**
- `StorageService` has retention policies (72h originals, 7d previews, 30d finals)
- R2 bucket lifecycle rules in place
- Cleanup worker exists

**Mitigation:**
- Implement artifact retention policies
- Storage lifecycle rules (30 days for build artifacts)
- Archive old restoration jobs
- Monitor storage usage via metrics

**Rollback:** Reduce retention periods, delete old artifacts

### R006: Database Migration Failures
**Description:** Adding restoration-specific tables may cause migration failures or data loss.

**Evidence:**
- Prisma schema has `ImageQualityScore`, `AiJob`, `ProcessingJob` models
- Migration deployment pattern in `index.ts`
- Backup strategy would need to be established

**Mitigation:**
- Staging environment for migration testing
- Backup before migration
- Staged migration with rollback scripts
- Test migrations on copy of production data

**Rollback:** Migration rollback scripts, database restore from backup

### R007: Provider API Rate Limits
**Description:** External AI providers may impose rate limits affecting throughput.

**Evidence:**
- Provider abstraction layer allows multiple providers
- Queue-based processing can handle rate limits
- Local providers have no rate limits

**Mitigation:**
- Queue-based request throttling
- Provider fallback chain
- Rate limit monitoring
- Caching of results

**Rollback:** Use local providers exclusively

### R008: Dead Letter Queue Accumulation
**Description:** Failed restoration jobs may accumulate in dead letter queue.

**Evidence:**
- Dead letter queue mechanism exists in `PhaseCImageProcessingQueue`
- `moveToDeadLetter` method implemented
- Failed jobs endpoint in admin routes

**Mitigation:**
- Monitor DLQ size
- Auto-retry transient failures
- Alert on accumulation
- Manual review process

**Rollback:** Manual processing of DLQ jobs

### R009: Cloudflare R2 Availability
**Description:** R2 storage may have regional availability issues.

**Evidence:**
- R2 is primary storage for all processed images
- Single bucket in us-central1

**Mitigation:**
- Multi-region bucket strategy
- CDN fallback for downloads
- Local file system fallback (dev only)
- Monitoring of R2 health

**Rollback:** Use alternative storage provider

### R010: Provider API Changes
**Description:** External provider APIs may change, breaking integration.

**Evidence:**
- `provider.interface.ts` defines stable interfaces
- Local providers don't have this issue
- Provider factory handles selection

**Mitigation:**
- Versioned API clients
- Provider adapter pattern
- Integration tests for each provider
- Monitoring of provider health

**Rollback:** Revert to previous provider version

---

## Business Risks

| ID | Risk Type | Description | Likelihood | Impact | Risk Score | Mitigation | Rollback | Priority |
|----|-----------|-------------|------------|--------|------------|------------|----------|----------|
| B001 | Business | Customer expects unrealistic restoration quality | High | Medium | 12 | Quality previews, tiered pricing, clear expectations | Remove unrealistic promises | P0 |
| B002 | Business | Restoration costs exceed pricing | Medium | High | 15 | Cost tracking, tiered packages, provider selection | Adjust pricing model | P0 |
| B003 | Business | Brand reputation damage from poor quality | Medium | High | 15 | Quality control, human review, customer communication | Issue refunds, manual fixes | P0 |
| B004 | Business | Print quality issues | Medium | Medium | 9 | QC process, test prints, vendor SLAs | Manual QC, vendor switch | P1 |
| B005 | Business | Courier delivery delays | High | Medium | 12 | Multiple courier partners, tracking, communication | Manual dispatch, customer updates | P1 |
| B006 | Business | Privacy concerns for family photos | Low | High | 12 | Security controls, consent flows, audit logs | Disable processing, delete data | P0 |

---

## Operational Risks

| ID | Risk Type | Description | Likelihood | Impact | Risk Score | Mitigation | Rollback | Priority |
|----|-----------|-------------|------------|--------|------------|------------|----------|----------|
| O001 | Operational | Support team overwhelmed by restoration queries | Medium | Medium | 9 | Self-service portal, FAQ, clear documentation | Increase support staff | P1 |
| O002 | Operational | Print fulfillment capacity exceeded | Low | Medium | 6 | Capacity planning, order batching, partner network | Manual order processing | P2 |
| O003 | Operational | Courier exception handling | Medium | Medium | 9 | Exception workflows, customer communication | Manual exception handling | P1 |
| O004 | Operational | Customer data retention compliance | Low | High | 12 | Retention policies, deletion workflows | Manual data handling | P0 |
| O005 | Operational | Order status synchronization issues | Medium | Medium | 9 | Event-driven updates, status reconciliation | Manual status updates | P1 |

---

## Risk Register Summary

| Priority | Count | Risk Types |
|----------|-------|------------|
| P0 | 8 | Quality, Cost, Brand, Privacy, Migration, API |
| P1 | 9 | GPU, Latency, Courier, Support |
| P2 | 4 | Storage, DLQ, R2, Operations |

---

## Mitigation Strategy

### Immediate Actions (Pre-Launch)
1. Implement quality scoring before processing
2. Establish provider abstraction layer
3. Configure retention policies
4. Create rollback scripts for database migrations
5. Set up monitoring and alerting

### Short-term Actions (First 30 Days)
1. Monitor AI quality outputs
2. Track cost per restoration job
3. Review customer feedback
4. Adjust processing pipeline based on metrics

### Long-term Actions (3-6 Months)
1. Evaluate transition to owned AI models
2. Optimize storage costs
3. Expand courier partner network
4. Implement A/B testing for quality improvements

---

## Rollback Procedures

### Database Rollback
1. Restore from backup (taken before migration)
2. Apply reverse migration scripts
3. Verify data integrity
4. Update application code to previous version

### Service Rollback
1. Route traffic to previous revision
2. Disable new features via feature flags
3. Monitor for errors
4. Communicate with customers if affected

### Feature Rollback
1. Disable feature flag
2. Remove new API routes
3. Hide UI elements
4. Redirect users to previous flow