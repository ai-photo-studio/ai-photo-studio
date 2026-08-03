# Safe Commands

- `npm run scope:check`: Verify project identity, git remote, and branch.
- `npm run push:safe`: Validate changed/staged files are safe before push.
- `npm run railway:check`: RETIRED — historical reference only; not an active deploy or rollback target. No `railway:check` script currently exists in `package.json`; Railway is retired and this entry is preserved only as a historical record of the prior safe-commands list.
- `npm run r2:check`: Read-only R2 configuration presence and identity check.

Current production API deployment target is Northflank (`api.thannow.com`); Cloudflare Pages serves the frontend. These commands do not deploy, restart services, or mutate infrastructure.
