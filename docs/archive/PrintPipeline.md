# Print Pipeline

## Overview

The Print Preparation pipeline ensures restored images meet professional print quality standards before delivery.

## Supported Print Sizes

| Size | Dimensions (px @ 300 DPI) | Dimensions (mm) | Dimensions (inches) |
|---|---|---|---|
| 4×6 | 1200×1800 | 102×152 | 4×6 |
| 5×7 | 1500×2100 | 127×178 | 5×7 |
| 8×10 | 2400×3000 | 203×254 | 8×10 |
| A4 | 2480×3508 | 210×297 | 8.27×11.69 |
| A3 | 3508×4961 | 297×420 | 11.69×16.54 |

## DPI Calculation

DPI (dots per inch) is calculated as:

```
DPI_X = pixel_width / physical_width_inches
DPI_Y = pixel_height / physical_height_inches
```

Minimum DPI for print: **300**

## Minimum Resolution

Each print size has a minimum pixel resolution at 300 DPI:

| Size | Min Width | Min Height |
|---|---|---|
| 4×6 | 1200 | 1800 |
| 5×7 | 1500 | 2100 |
| 8×10 | 2400 | 3000 |
| A4 | 2480 | 3508 |
| A3 | 3508 | 4961 |

## Upscale Requirement

If the source image resolution is below the minimum for the target print size, the image is automatically upscaled. The `forceUpscale` flag can be set to `true` to always upscale.

## Sharpening

Sharpening is applied during the upscale process to compensate for interpolation artifacts. It can be disabled by setting `applySharpening=false`.

## Color Profile Handling

- Output format: PNG (lossless)
- Color space: sRGB
- The service ensures all output images use the sRGB color profile for consistent print reproduction

## Print Quality Validation

The service validates:

1. **Resolution score** — based on DPI vs. minimum requirement
2. **Quality score** — based on image size and pixel count
3. **Issues** — list of problems preventing print readiness
4. **Warnings** — non-blocking concerns

## Usage

```typescript
import { PrintPreparationService } from "./services/print-preparation.service";

const service = new PrintPreparationService(config);

const result = await service.prepareForPrint({
  image: imageBuffer,
  contentType: "image/jpeg",
  fileName: "restored-image.jpg",
  targetSize: "8x10",
  targetDpi: 300,
  forceUpscale: true,
  applySharpening: true,
});

console.log(result.isPrintReady); // true/false
console.log(result.issues); // list of issues
console.log(result.preparedImage); // upscaled buffer
```

## Integration

The `PrintReadinessService` wraps `PrintPreparationService` and provides:

- `assessPrintReadiness()` — check if an image meets print requirements
- `prepareForPrint()` — upscale and prepare for print
- `validatePrintQuality()` — validate output quality

## Architecture

```
RestorationService
  → PrintReadinessService (wrapper)
    → PrintPreparationService (core logic)
      → Image dimension extraction (JPEG, PNG, GIF, BMP)
      → DPI calculation
      → Resolution assessment
      → Upscale (placeholder)
      → Sharpening (placeholder)
      → Quality validation
```

No provider interfaces were modified. The print pipeline operates on the output of the restoration pipeline.
