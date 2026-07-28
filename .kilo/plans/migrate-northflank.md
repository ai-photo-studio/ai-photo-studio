# Northflank Migration Assessment

## Compatibility

| Railway Feature | Northflank Equivalent | Status |
|-----------------|----------------------|--------|
| Dockerfile deployment | Dockerfile (BuildKit/Kaniko) | ✅ Supported |
| GitHub integration | GitHub, GitLab, Bitbucket | ✅ Supported |
| Auto-deploy on push | CI/CD with branch/PR rules | ✅ Supported |
| Build cache | Layer caching | ✅ Supported (standard, works correctly) |
| Start Command | Command/entrypoint override | ✅ Supported |
| Healthcheck | Liveness + Readiness + Startup probes | ✅ Supported (more flexible) |
| Healthcheck path /api/health | HTTP probe on port 4000 | ✅ Supported |
| Environment variables | Runtime variables + Secret groups | ✅ Supported |
| Build arguments | Build arguments (ARG) | ✅ Supported |
| Custom domain + SSL | Domains + Let's Encrypt | ✅ Supported |
| PostgreSQL | Managed PostgreSQL addon | ✅ Supported |
| Redis | Managed Redis addon | ✅ Supported |
| Persistent volumes | Persistent volumes | ✅ Supported |
| Multi-service project | Multiple services per project | ✅ Supported |
| Public port exposure | Public ports + domain linking | ✅ Supported |
| CLI | Northflank CLI + API + JS client | ✅ Supported |
| Logs/metrics | Logs, metrics, alerts | ✅ Supported |
| CORS | Per-path CORS policy | ✅ Supported |
| Secret groups | Secret groups with inheritance | ✅ Supported |
| GitHub Actions | Northflank API from GHA | ✅ Supported |
| Pipeline/release flow | Release flows + Workflows | ✅ Supported |

## Missing Features

None. All project requirements are supported.

## Migration Steps

### Phase 1: Northflank Account Setup (15 min)
1. Create account at app.northflank.com
2. Link GitHub → ai-photo-studio
3. Create project: "AI Photo Studio"
4. Create production environment

### Phase 2: Deploy API Service (30 min)
5. Combined Service → GitHub → ai-photo-studio/ai-photo-studio → main
6. Build type: Dockerfile, path: /Dockerfile
7. Start Command: cd /app/apps/api && node dist/index.js
8. Port: 4000
9. Enable CI/CD + CD (auto-deploy)
10. Trigger initial build

### Phase 3: Healthchecks (5 min)
11. Liveness Probe: HTTP → /api/health → port 4000
12. Initial delay: 15s, Interval: 30s, Timeout: 10s

### Phase 4: Environment Variables (15 min)
13. Create Secret Group: studio-api-env
14. Add all 22 variables (same values as Railway)
15. Link to service
16. Set scope: build & runtime

### Phase 5: Custom Domain (15 min)
17. Add domain api.thannow.com
18. Add TXT verification record to DNS
19. Link domain to port 4000
20. Update DNS CNAME to Northflank URL
21. SSL auto-provisions via Let's Encrypt

### Phase 6: Verification (15 min)
22. Build status: SUCCESS
23. Container logs: correct start command, no env errors
24. /api/health returns HTTP 200
25. Database + Redis connected
26. Custom domain resolves with valid SSL

### Phase 7: Decommission Old (72h cooldown)
27. Keep Railway running for 72h
28. After 72h: scale down (don't delete)
29. After 7 days: delete Railway project

## Estimated Time

Active migration: ~90 minutes  
Plus 72h monitoring cooldown before decommissioning Railway.

## Risks

| Risk | Mitigation |
|------|------------|
| Docker WORKDIR mismatch | Start command: `cd /app/apps/api && node dist/index.js` |
| TypeScript build errors | Already fixed in commit 278a14f |
| Northflank trial limits | Upgrade to paid plan if needed |
| Existing external DBs | Set DATABASE_URL / REDIS_URL as env vars — no migration needed |
| DNS propagation delay | Old Railway domain active during transition (1-60 min) |
| SSL certificate delay | Let's Encrypt takes 1-5 min |

## Safe to Migrate: YES
