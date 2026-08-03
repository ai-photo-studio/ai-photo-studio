# Repository Agent Instructions

## Required reading and inspection
Before editing, read `docs/PROJECT_STATE.md`, `docs/NEXT_TASK.md`, `docs/PROTECTED_SCOPE.md`, `docs/COMPLETION_STATUS.md`, `docs/DECISIONS.md`, and `reports/LATEST.md`. Inspect the repository, Git status, relevant package manifests, documentation, and verification commands before implementation.

## Change controls
- Make focused, task-authorized changes only.
- Protect finalized business logic, authentication, payment logic, RunPod integration, production deployment, and database migrations.
- Never expose secrets or commit sensitive environment values.
- Never force-push.
- Never push after failed verification.
- Do not deploy or mutate production services without explicit authorization.

## Documentation
After every completed task, update the applicable project-state documents and write the final task result to `reports/LATEST.md`. Preserve the existing `AI_code_audit_report.md` convention; do not remove or rename it.
