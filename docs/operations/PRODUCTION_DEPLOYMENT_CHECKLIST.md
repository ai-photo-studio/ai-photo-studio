# Production Deployment Checklist

## Pre-Deployment

- [ ] Verify GPU quota is sufficient for expected load
- [ ] Request GPU quota increase if needed (NVIDIA L4 limit)
- [ ] Verify Cloud Run service account has necessary permissions
- [ ] Confirm Dockerfile.gpu.research builds successfully
- [ ] Verify SAM2 checkpoint file is available in container
- [ ] Test health endpoints: `/health`, `/torch`, `/cuda`, `/sam2`
- [ ] Verify environment variables are set:
  - [ ] `CUDA_VISIBLE_DEVICES=0`
  - [ ] `PORT=8080`
  - [ ] `SAM2_CHECKPOINT` path
- [ ] Run smoke test with sample image
- [ ] Verify GPU memory usage is within limits (4.8GB allocated)

---

## Deployment

- [ ] Build container image with GPU support
- [ ] Push image to Google Container Registry
- [ ] Deploy to Cloud Run with GPU enabled
  - [ ] Select NVIDIA L4 GPU
  - [ ] Set memory to 32 GB
  - [ ] Set CPU to 8 vCPUs
  - [ ] Configure auto-scaling (min 1, max 3 instances)
- [ ] Verify service URL is accessible
- [ ] Update DNS/load balancer if applicable

---

## Rollback Checklist

- [ ] Identify rollback trigger conditions:
  - [ ] >5% request failure rate
  - [ ] >99th percentile latency > 5,000ms
  - [ ] GPU memory errors
  - [ ] Container restarts > 3 in 5 minutes
- [ ] Rollback procedure:
  1. Document current deployment version
  2. Revert to previous container image tag
  3. Update Cloud Run service to previous revision
  4. Verify rollback successful via health check
  5. Monitor for 15 minutes post-rollback
- [ ] Maintain previous revision for 30 days
- [ ] Document rollback reason in incident log

---

## Monitoring Checklist

### Health Checks
- [ ] `/health` returns 200 OK
- [ ] `/torch` returns CUDA available status
- [ ] `/cuda` returns device information
- [ ] `/sam2` returns model loaded status

### Metrics to Monitor
- [ ] Request latency (mean, p50, p95, p99)
- [ ] Request success rate
- [ ] GPU utilization
- [ ] GPU memory allocated/reserved
- [ ] Container restart count
- [ ] Error rate (4xx, 5xx)
- [ ] CPU utilization
- [ ] Memory utilization

### Alerts
- [ ] Latency > 1,000ms for > 5% of requests
- [ ] Error rate > 1%
- [ ] GPU memory > 90%
- [ ] Container restarts > 3 in 5 minutes
- [ ] Health check failures > 3 consecutive

---

## Scaling Checklist

### Auto-scaling Configuration
- [ ] Set minimum instances: 1 (for consistent latency)
- [ ] Set maximum instances: Based on quota
- [ ] Configure CPU utilization target: 70%
- [ ] Configure memory utilization target: 70%
- [ ] Set concurrency limit: 10 (or based on testing)

### Scale-up Triggers
- [ ] Monitor request queue depth
- [ ] Check GPU utilization trends
- [ ] Verify quota availability
- [ ] Pre-warm instances during peak hours

### Scale-down
- [ ] Minimum instances set to prevent cold starts
- [ ] Monitor for unnecessary scale-down during traffic spikes

---

## Quota Checklist

### GPU Quota
- [ ] Verify NVIDIA L4 quota in us-central1
- [ ] Request increase if daily volume > 5,000 images
- [ ] Monitor quota usage via GCP console
- [ ] Set quota alerts at 80% utilization

### Other Quotas
- [ ] Cloud Run concurrent requests quota
- [ ] Container memory quota
- [ ] Storage quota (if caching models)
- [ ] Network egress quota

---

## Backup Checklist

### Data Backup
- [ ] Container image version tagged
- [ ] SAM2 checkpoint backed up
- [ ] Configuration stored in version control
- [ ] Environment variables documented

### Recovery
- [ ] Backup container image in Artifact Registry
- [ ] Document restore procedure
- [ ] Test restore procedure quarterly
- [ ] Maintain disaster recovery plan

---

## Post-Deployment Verification

- [ ] Verify service URL responds correctly
- [ ] Run 100 sequential inference tests
- [ ] Run 100 concurrent inference tests (5 concurrency)
- [ ] Run 100 concurrent inference tests (10 concurrency)
- [ ] Verify latency metrics are within expected range
- [ ] Verify success rate is 100%
- [ ] Verify GPU memory is stable
- [ ] Monitor for 24 hours post-deployment

---

## Go-Live Approval

- [ ] All checklist items verified
- [ ] Stakeholder approval obtained
- [ ] Incident response team notified
- [ ] Monitoring dashboards active
- [ ] Support team briefed