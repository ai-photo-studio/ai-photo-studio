# AI Provider Routing

## Goal
Keep AI integration provider-independent so the pipeline can switch between Photoroom, Fal.ai, and a local fallback without changing the worker or queue shape.

## Provider Interface
- `processProductImage(input)`
- `processVehicleImage(input)`

## Supported Providers
- `mock`
- `photoroom`
- `fal`

## Configuration
- `AI_PROVIDER` selects the active provider.
- `PHOTOROOM_API_KEY` is required when `AI_PROVIDER=photoroom`.
- `FAL_API_KEY` is required when `AI_PROVIDER=fal`.
- `DELIVERY_MODE=LOG_ONLY` is the default and keeps outbound completion notifications in logs only.
- `DELIVERY_MODE=WHATSAPP` is reserved for future live message delivery.

## Workflow Routing
- Product workflow modes:
  - `WHITE_BACKGROUND`
  - `SOLID_COLOR_BACKGROUND`
  - `SHADOW_ENHANCEMENT`
  - `PRODUCT_STUDIO`
- Vehicle workflow modes:
  - `SHOWROOM`
  - `PREMIUM_ROAD`
  - `DARK_STUDIO`
  - `PLATE_BLUR`
- The worker chooses the product or vehicle pipeline from the persisted job metadata.
- The worker records provider name, workflow type, and workflow mode on `ProcessingJob`.

## Operational Notes
- Persist provider responses and failures in `ProcessingJob`.
- Track provider failures separately from queue/dead-letter failures in admin stats.
- Keep original and processed file references in storage and order fields, not local worker memory.
