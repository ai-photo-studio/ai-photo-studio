# AI Project Rules - Final Production Grade

## Mandatory Rules for All AI Agents

### Rule 1: Never Push Without Verification
Never execute `git push` without running `npm run enterprise-verify` first.

### Rule 2: Never Deploy Without Verification
Never execute Railway or Cloudflare deployment actions without running `npm run enterprise-verify` first.

### Rule 3: Never Modify Another Repository
Verify the repository ID and remote URL before any Git operation.

### Rule 4: Never Change Railway Target
Always verify the Railway project ID is `ad62f340-fcfd-4989-b5bb-18753b28d8c8`.

### Rule 5: Never Change Production Environment
Never change production environment variables or settings without explicit human instruction.

### Rule 6: Always Display Project Identity
Run `npm run project-info` before risky operations.

### Rule 7: Update Audit Report
After changes, update `AI_code_audit_report.md`.

### Rule 8: Update Reference Documents
After changes, update `PROJECT_SAFETY_LOCK.md` and `AI_PROJECT_RULES.md`.

### Rule 9: Never Expose Secrets
Never log or print secrets, tokens, passwords, or database URLs.

### Rule 10: Abort on Verification Failure
If project identity verification fails, abort all operations immediately.

### Rule 11: Database Protection
When the database lock is enabled, block migrations and schema changes.

### Rule 12: Never Modify HojaSeeds Deployment
Never modify, redeploy, relink, rename, or disturb the `hojaseeds` Cloudflare Pages project.

### Rule 13: Frontend Binding Required
The public frontend must remain bound to the Railway production API from `ai-photo-studio-whatsapp-web` and must not fall back to `http://localhost:4000` in production builds.

### Rule 14: Launch Certification Required
Before declaring production launch, verify phases, monitoring endpoints, WhatsApp mode, AI provider, payment provider, backup/recovery, and CORS configuration.

### Rule 15: Protected Files Must Exist
Ensure all protected files exist before any operation:
- PROJECT_LOCK.json
- PROJECT_SAFETY_LOCK.md
- AI_PROJECT_RULES.md
- AI_code_audit_report.md

### Phase P Note
Keep `DELIVERY_MODE=LOG_ONLY` until Meta connectivity passes in production.
