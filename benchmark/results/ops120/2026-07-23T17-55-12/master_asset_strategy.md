# OPS-120 — Master Asset Strategy

**Date:** 2026-07-23T17:56:01.933Z

## Principle

Run Replicate exactly **once** per paid order. Store the master restored image.
All downstream assets (download sizes, print assets) derive from the master.

## Implementation

```
1. Payment verified
2. PipelineOrchestrator.execute(request, 'replicate')
   → ReplicatePipelineProvider (3 predictions)
     a. flux-kontext-apps/restore-image ($0.034)
     b. tencentarc/gfpgan face ($0.006)
     c. tencentarc/gfpgan upscale ($0.014)
3. Store master image to R2: finals/restoration-{itemId}-{ts}.jpg
4. Generate download sizes via sharp (no Replicate):
   - Original: master resolution (e.g. 4736x3520, ~20MB)
   - 2X: half resolution (~5MB via sharp resize)
   - 4X: quarter resolution (~1.3MB via sharp resize)
5. Print uses master — crop/resize to print dimensions (no Replicate)
```

## Sharp Generation (No Additional Cost)

| Package | Method | Cost |
|---|---|---|
| Original | Same as master | $0.00 |
| 2X | sharp.resize(master, width/2) | $0.00 |
| 4X | sharp.resize(master, width/4) | $0.00 |
| Print assets | sharp.resize/crop to print size | $0.00 |

## File Storage

Only the master image is stored in R2. Download sizes can be generated on-the-fly or
cached with a short TTL. Print assets are ephemeral (generated at order time).
