# Modal Cost Analysis

## Pricing Model

### GPU Compute
- **A100**: $0.002/minute
- **H100**: $0.008/minute
- **RTX 4090**: $0.001/minute

### Background Removal Estimates

| Image Size | Processing Time | A100 Cost | RTX 4090 Cost |
|------------|-----------------|-----------|---------------|
| 1200px | 2-3 seconds | $0.0001 | $0.00005 |
| 2000px | 5-8 seconds | $0.0003 | $0.00015 |
| 4000px | 15-25 seconds | $0.001 | $0.0005 |

### Monthly Estimates (1000 images)

| Tier | Avg Size | Time | Monthly Cost (A100) |
|------|----------|------|---------------------|
| preview | 1200px | 3s | $0.30 |
| standard | 2000px | 7s | $0.70 |
| HD | 4000px | 20s | $2.00 |

## Comparison

| Platform | Per Image | 1000 Images/Month |
|----------|-----------|-------------------|
| ModelLab | $0 (free tier) | $0 |
| Modal A100 | $0.0003 avg | ~$3 |
| RunPod | $0.002-0.01 | ~$2-10 |
| Replicate | $0.01-0.05 | ~$10-50 |

## Recommendation
Use Modal for production due to:
- Predictable pricing
- Fast cold starts
- Reliable GPU availability