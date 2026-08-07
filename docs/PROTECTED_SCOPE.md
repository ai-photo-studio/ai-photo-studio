# Protected Scope

The following areas are protected and may be changed only when a task explicitly authorizes the change:

- Finalized business logic and order/restoration workflows.
- Authentication and authorization middleware/controllers.
- Payment gateway code, payment readiness, payment-attempt flows, and merchant integration records.
- RunPod routing, endpoint identity, worker contracts, authorization gates, and related approval evidence.
- Working AI provider integrations, including the documented production Replicate path.
- Production deployment configuration and service topology, including Cloudflare Pages, Northflank, R2, PostgreSQL, Redis, and related deployment scripts.
- Database schema, Prisma migrations, migration history, and database verification tooling.
- WhatsApp webhook and delivery integrations.

Protected scope can be changed only by an explicitly authorized task with focused verification and documentation updates. Do not expose secrets or treat documentation claims as proof of live production state.

## Finalized UI scope (R9.3, 2026-08-07)
- The ThanNow public shell and homepage are finalized UI per the approved LOCKED design (`UI/DESIGN_LOCK.md`, `UI/index`, `UI/styles`): `apps/web/src/components/PublicLayout.tsx`, `apps/web/src/pages/HomePage.tsx`, the homepage/theme styles in `apps/web/src/styles.css` (scoped under `.thannow-home`), and `apps/web/index.html`.
- The published homepage image set under `/assets/` (`apps/web/public/assets/`, 16 approved human-memory files + `README_ASSETS.txt`) is finalized UI scope. Do not replace these with unapproved images, remove them, or repoint HomePage to other visuals without prior approval.
- Do not redesign the locked direction. Changes require prior intentional approval, consistent with `DESIGN_LOCK.md`.
- `UI/` remains the canonical source reference for the design and must stay tracked (do not ignore or remove).

## HD rotating hero scope (R9.3-P7, 2026-08-07)
- The homepage hero comparison is implemented by `apps/web/src/components/HeroCompareSlider.tsx` and is driven by `apps/web/src/data/heroes.ts` (typed registry mirroring `apps/web/public/assets/hero/hero-manifest.json`).
- It renders ONE locked comparison frame with two aligned layers: base = Then/original (`...-then.jpg`), overlay = Now/restored (`...-now.jpg`), 1600x1600 HD originals under `apps/web/public/assets/hero/hero/`. It rotates through all 10 hero concepts (~7s), starts on a random hero, resets the divider to 50% on change, pauses while the user drags, and preloads only the current + next pair.
- The legacy single `hero-compare.png` in the homepage hero is decommissioned. Future agents must NOT revert `HomePage.tsx` to `hero-compare.png` or a static image. Any change to the hero asset registry/count requires an explicitly authorized task.
- Homepage Upload Photo CTA, modal, and `/restore/new` routing remain unchanged and are still finalized scope.

## HD rotating hero quality scope (R9.3-P10, 2026-08-07)
- **Display geometry / object-fit policy:** the full photograph must always remain visible. Both comparison layers use `object-fit: contain` + `object-position: center` (identical dimensions/position so Then and Now are pixel-aligned). The frame renders a stretched, blurred/darkened copy of the SAME image behind the contained sharp layers for a full-bleed look. `overflow` is clipped only on the outer frame; images are never cropped or stretched. Future agents must NOT switch layers back to `object-fit: cover`.
- **Matched Then/Now rule:** every `*-then.jpg` is generated deterministically FROM its exact matching `*-now.jpg` (same people/pose/background/crop/1600x1600 dimensions) so the two layers are pixel-aligned. Never regenerate a Then image from a different source or change composition.
- **10 distinct damage presets:** each hero uses a distinct damage treatment (faded sepia + light cracks; B&W dim + paper aging; torn corners + folds + stains; faded color + water damage; low contrast + dust + yellowing; B&W strong scratches + cracked emulsion; heavy torn edges + missing corner; aged B&W grain + scratches; severe aging + multi-tears + stains; dim + damaged emulsion + partial fading). Do not reuse one generic scratch overlay.
- **UI cleanliness:** the caption sits in a strip BELOW the comparison frame (never over faces); the Upload CTA is outside the photo area. Slider handle stays inside the frame. No website UI/buttons are baked into image files.
- **Asset generator:** regenerable, seeded script `apps/web/scripts/generate-hero-then.cjs` rebuilds all 10 `*-then.jpg` idempotently from the canonical Now sources.
