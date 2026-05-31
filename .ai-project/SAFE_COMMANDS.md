# Safe Commands

- `npm run scope:check`: Verify project identity, git remote, and branch.
- `npm run push:safe`: Validate changed/staged files are safe before push.
- `npm run railway:check`: Read-only Railway link/status check.
- `npm run r2:check`: Read-only R2 configuration presence and identity check.

These commands do not deploy, restart services, or mutate infrastructure.
