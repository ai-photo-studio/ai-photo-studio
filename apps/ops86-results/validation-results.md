# OPS-86 Provider Validation Results

Generated: 2026-07-22T07:55:24.836Z

## Input
- Format: PNG
- Size: 69 bytes
- Content type: image/png

## Results
| Provider | Status | Latency | Cost | Output Size | Error |
|---|---|---|---|---|---|
| mock | success | 2ms | $0.0000 | 69 bytes | - |
| openai | error | 21320ms | $0.0000 | 0 bytes | fetch failed |
| fal-ai | error | 3125ms | $0.0000 | 0 bytes | fal.ai API failed (403): {"detail": "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."} |
| replicate | error | 21171ms | $0.0000 | 0 bytes | fetch failed |
| runpod | error | 3ms | $0.0000 | 0 bytes | restore service is not configured |
