# Decisions

- This task is repository automation/documentation setup only; application business logic and production systems remain unchanged.
- The existing `AI_code_audit_report.md` is preserved as the audit-report convention.
- Repository evidence is separated from uncertain live-state claims.
- No readiness percentages are recorded without direct repository evidence.
- The next task is verification and project-state validation, not feature development.
- Protected authentication, payment, RunPod, AI-provider, deployment, and database areas require explicit authorization before modification.
- R9.3 (2026-08-07): the ThanNow public shell and homepage follow the approved `UI/DESIGN_LOCK.md` locked human-memory direction (Restore -> Upscale -> Print). Homepage section styles are scoped under `.thannow-home` so existing customer/admin flow pages remain unaffected.
- The reference homepage used to present a dual-market "AI Product Photo Studio" positioning; product-photography feature routes remain in the repo but are no longer the primary consumer homepage.
- Missing licensed homepage image assets are a content-completeness item, not a code gate; `RenderAsset` places clean placeholder slots until owned images are supplied.
- R9.3-P1 (2026-08-07): the 16 approved human-memory homepage assets remain absent and are classified **BLOCKED_OWNER_ASSETS**. All non-asset visual/responsive/routing checks passed at 1440/1024/768/430/390/360; placeholders render cleanly and auto-replace once assets are added under `/assets/` (`apps/web/public/assets/`). No fabricated/hotlinked imagery is ever added.
- R9.3-P1 (2026-08-07, asset drop): the 16 approved human-memory assets were supplied to `apps/web/public/assets/` and are now served at `/assets/`. The homepage renders all 16 images (0 placeholders, 0 broken) at desktop and mobile, and the PNG/JPG asset set is packaged into `dist/assets/` on build. The asset blocker is cleared; post-launch polish can proceed.
- R9.3-P2 (2026-08-07, launch prep): website DEPLOY_READY. Removed legacy `apps/web/src/main.tsx` product-studio runtime branding and placeholder GTM/Facebook pixel IDs (now gated behind real build-time env IDs). Verified production build: SPA deep-route fallback, 16 assets resolved, no old branding, PKR truthful. Deployment (push/`wrangler pages deploy`) intentionally deferred pending explicit owner authorization per rules.md.
