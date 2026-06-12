# Project Safety Lock - Final Production Grade

## Protected Scope Protocol v3.0.0

This repository has a mandatory project protection system to prevent accidental operations against wrong targets.

### Protection Rules

1. **Repository ID Verification**: Verify repository ID matches `gardenshop/ai-photo-studio-whatsapp`
2. **Railway Project ID Verification**: Verify Railway project ID matches `ad62f340-fcfd-4989-b5bb-18753b28d8c8`
3. **Railway Workspace Verification**: Verify workspace name matches expected value
4. **Deployment URL Verification**: Verify deployment URL matches expected value
5. **Cloudflare Account Verification**: Verify Cloudflare account ID and name
6. **Environment Variable Validation**: Verify all required secrets exist
7. **Protected Files Verification**: Ensure safety files exist
8. **Database Protection Mode**: Block migrations and schema changes unless unlocked
9. **Build/Lint Verification**: Run build and typecheck before push/deploy
10. **Audit Report Verification**: Require fresh AI_code_audit_report.md

### Verification File

`PROJECT_LOCK.json` contains all configuration for the protection system.

## Usage

### Enterprise Verification

```powershell
npm run enterprise-verify
```

### Create Deployment Snapshot

```powershell
npm run snapshot:create
```

### Rollback

```powershell
npm run rollback           # Show rollback options
npm run rollback:exec      # Execute rollback
```

### Safe Git Push (Enterprise)

```powershell
npm run enterprise-push
```

### Safe Deploy (Enterprise)

```powershell
npm run enterprise-deploy
```

### Project Info

```powershell
npm run project-info
```

### GitHub CLI Verification

```bash
npm run gh:verify
```

## Cross-Platform Support

- **Windows**: `.bat` scripts in `scripts/`
- **Git Bash / Unix**: `.sh` scripts in `scripts/`
- **VS Code**: Integrated terminal supports both

## Cloudflare Pages Deployment

- **Frontend project**: `ai-photo-studio-whatsapp-web`
- **Production URL**: `https://ai-photo-studio-whatsapp-web.pages.dev`
- **Account**: `85f6a6181b4653c2a45e69cb7ce8a474` (gisupp@gmail.com)
- **Separate from**: `hojaseeds` — do not modify

## AI Agent Instructions

See `AI_PROJECT_RULES.md` for mandatory rules that AI agents must follow.