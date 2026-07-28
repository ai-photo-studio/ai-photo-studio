# GCP Cleanup — OPS-137

**Date:** 2026-07-24

## Cloud Run Revisions: Deletion Results

### Deleted (25 revisions)
| Range | Count | Reason |
|-------|-------|--------|
| 00053-rih | 1 | Oldest revision, source deploy |
| 00073-xbq through 00081-hsk | 9 | Stale GHCR cache images |
| 00082-j74 through 00091-6k9 | 10 | Stale GHCR cache images |
| 00092-zfh through 00097-29z | 6 | Stale GHCR cache images |

### Remaining (5 revisions)
| Revision | Status | Action |
|----------|--------|--------|
| 00098-dpf | ✅ Serving 100% | KEEP |
| 00099-dwc | ❌ Stuck (0%, can't delete) | Manual Cloud Console |
| cors-fix | ❌ Stuck (0%, can't delete) | Manual Cloud Console |
| 00103-djf | ⏳ 0% traffic | Manual Cloud Console |
| 00104-t7f | ❌ Stuck (can't delete, latest) | Manual Cloud Console |

## GPU Service: ai-photo-studio-bg-remover-gpu

**DO NOT DELETE** — Safety check results:

| Check | Result |
|-------|--------|
| 0% traffic | ❌ **100% traffic** |
| Env var references | ✅ None in .env files |
| Provider references | ✅ None in runtime code |
| Worker references | ✅ None in workers/ |
| Deployment script references | ❌ **83 references** (services/background-remover/cloudbuild*.yaml, etc.) |
| Deployment_Policy.md | ❌ **Listed** |
| Service config files | ❌ current_service.json, prod_service.json, prod_service_new.json |

## Artifact Registry

| Package | Status | Action |
|---------|--------|--------|
| `latest` | 9 versions | Keep newest 6 |
| `bg-remover` | 65 versions | Keep tagged (v1-v22), delete untagged >30d |
| `prod` | 20 versions | Delete all (legacy tag) |
| `api` | 7 versions | Keep tagged |
| `yolo-detector` | 3 versions | Keep |
| `real-esrgan` | 6 versions | Keep tagged |
| `gpu-research` | 3 versions | Keep |
| `gpu-research-test` | 2 versions | Keep |
| `cloud-run-source-deploy` | multiple | Keep |

**Note:** Deletion commands require gcloud builds to be working. Run via Cloud Console UI.
