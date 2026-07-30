# Restoration Agent Runbook

Read all restoration docs and `rules.md` before edits. Inspect exact diffs, stage exact paths only, and never use destructive Git commands or broad staging. Run focused tests after each change, then auth, entitlement, replay, typecheck, and build. Paid calls require explicit authorization; replay must show zero POSTs. Verify runtime SHA after approved deployment. Update restoration docs and overwrite the ignored audit report for every behavior change.

Run `npm run test:restoration:calibration` before changing Premium routing. Missing evidence must remain explicit; synthetic fixtures are test-only and never calibration evidence.

Use `npm run restoration:fixture-intake -- --id fixture-1 --category unclassified --original "C:\\path with spaces\\original.png"` for operator-categorized archived input. Do not add face models or dependencies without an approved benchmark-only design.

Run `npm run test:restoration:review-queue` before registering discovered archived stages; do not group filename-only files.
