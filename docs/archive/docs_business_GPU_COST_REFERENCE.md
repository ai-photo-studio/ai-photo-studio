# GPU Infrastructure

## Hardware Specifications

| Component | Value |
|-----------|-------|
| GPU Type | NVIDIA L4 |
| Region | us-central1 (Google Cloud) |
| CPU | 8 vCPUs (AMD EPYS) |
| RAM | 32 GB |
| CUDA Version | 11.8 |
| PyTorch Version | 2.x (compiled with CUDA 11.8) |
| SAM2 Version | 1.0+ (sam2_hiera_b+ model) |

---

# Performance

## Load Test Results (Sequential, 100 requests)

| Metric | Value |
|--------|-------|
| Mean latency | 665.14 ms |
| P50 latency | 600.06 ms |
| P95 latency | 889.82 ms |
| P99 latency | 2931.25 ms |
| Throughput | 5,412 images/hour |
| Success rate | 100% |

## Concurrency Results

| Concurrency | Success Rate | Mean Latency | P95 Latency | Throughput (req/hr) |
|-------------|--------------|--------------|-------------|---------------------|
| 1 (Sequential) | 100% | 665.14 ms | 889.82 ms | 5,412 |
| 5 | 100% | 872.09 ms | 1,358.96 ms | 4,140 |
| 10 | 100% | 1,522.87 ms | 1,860.69 ms | 2,365 |

---

# GPU Memory

| Metric | Value |
|--------|-------|
| Allocated (mean) | 4,856.45 MB |
| Allocated (max) | 4,856.45 MB |
| Reserved (peak) | 5,070.00 MB |
| Memory growth | 0 MB (stable) |

---

# Cost

## Infrastructure Cost (us-central1)

| Resource | Cost/Hour |
|----------|-----------|
| GPU (NVIDIA L4) | $0.1260 |
| CPU (8 vCPUs) | $0.0864 |
| Memory (32 GB) | $0.2880 |
| **Total Hourly** | **$0.5004** |

## Cost Per Image

| Metric | Value |
|--------|-------|
| Cost per image | $0.000092 |
| Throughput | 5,412 images/hour |

---

## Daily Cost Projections

| Daily Volume | GPU Hours | Cost |
|--------------|-----------|------|
| 100 images | 0.02 | $0.0092 |
| 500 images | 0.09 | $0.0462 |
| 1,000 images | 0.18 | $0.0925 |
| 5,000 images | 0.92 | $0.4623 |
| 10,000 images | 1.85 | $0.9245 |
| 25,000 images | 4.62 | $2.3114 |
| 50,000 images | 9.24 | $4.6227 |
| 100,000 images | 18.48 | $9.2454 |

---

## Monthly Cost Projections

| Daily Volume | Monthly Images | Monthly Cost |
|--------------|----------------|--------------|
| 100 images/day | 3,000 | $0.28 |
| 1,000 images/day | 30,000 | $2.77 |
| 5,000 images/day | 150,000 | $13.87 |
| 10,000 images/day | 300,000 | $27.74 |
| 50,000 images/day | 1,500,000 | $138.68 |
| 100,000 images/day | 3,000,000 | $277.36 |

---

# Capacity Planning

## Recommended Instance Count

| Business Tier | Daily Volume | Instances | Notes |
|---------------|--------------|-----------|-------|
| MVP | 100-500 images | 1 | Single instance, min 1, max 1 |
| Small Business | 1,000-5,000 images | 1-2 | Auto-scaling enabled |
| Medium Business | 10,000-25,000 images | 2-4 | Auto-scaling enabled |
| Enterprise | 50,000+ images | 4-10 | Auto-scaling enabled, min 2 |

### Instance Configuration

- **CPU**: 8 vCPUs per instance
- **Memory**: 32 GB RAM per instance
- **GPU**: 1 x NVIDIA L4 per instance
- **Max instances**: 10 (adjustable based on quota)

---

# Break-even Calculator

## Formulas

**Images per hour (throughput):**
```
throughput = 3,600,000 / mean_latency_ms
```

**Cost per image:**
```
cost_per_image = total_hourly_cost / throughput
```

**Daily cost:**
```
daily_cost = (daily_images / throughput) * total_hourly_cost
```

**Monthly cost:**
```
monthly_cost = daily_cost * 30
```

**Instances needed:**
```
instances = ceil(daily_volume / (throughput * 16 / 60))  # 16 working hours
```

---

# Assumptions

## Pricing Assumptions

1. **GPU Cost (NVIDIA L4)**: $0.126/hour (Google Cloud us-central1, on-demand)
2. **CPU Cost**: $0.0864/hour (8 vCPUs, Google Cloud standard)
3. **Memory Cost**: $0.009/hour per GB (32 GB = $0.288/hour)
4. **Region**: us-central1 (lowest price zone in US)
5. **Pricing Source**: Google Cloud Platform pricing as of July 2026
6. **No committed use discounts applied**
7. **No sustained use discounts applied**
8. **Cloud Run pricing**: Pay-per-use with 240-minute maximum request timeout
9. **Auto-scaling**: Max instances configurable, min instances can be set for consistent latency
10. **Working days**: 16 hours/day assumed for capacity planning

## Performance Assumptions

1. **Mean latency**: 665.14 ms (measured from sequential load test)
2. **Throughput**: Calculated from mean latency (5,412 images/hour)
3. **Success rate**: 100% (no failures in load testing)
4. **GPU memory**: 4,856 MB allocated, stable across requests
5. **Model**: SAM2 hiera_b+ with center-point prompt

## Operational Assumptions

1. **Container startup**: Cold start ~145ms, warm start ~140ms
2. **Health checks**: /health, /torch, /cuda, /sam2 endpoints available
3. **Auto-scaling**: Configured with max 3 instances (adjustable)
4. **Quota limits**: GPU quota may require increase for production volumes