# Project Safety Lock

This repository has a local safety lock in `.project-lock` to reduce accidental Git, Railway, Wrangler, and R2 operations against the wrong target.

## Verify Project Scope

Run:

```powershell
.\.project-lock\verify.ps1
```

The verifier checks the repository root, Git origin, current branch, and changed files against `.project-lock\identity.json`. It fails closed with exit code `1` on mismatch and does not print environment variables or secrets.

## Safe Git Push

Run:

```powershell
.\.project-lock\safe-git-push.ps1
```

This runs verification first, then pushes only the expected branch to `origin`.

## Safe Railway Command

Check status only:

```powershell
.\.project-lock\safe-railway.ps1
```

Run a Railway command after verification and a manual `YES`:

```powershell
.\.project-lock\safe-railway.ps1 logs --service api
```

Do not use this wrapper for commands that print variables or secrets unless you intentionally supplied that command and are ready for the output.

## Safe Wrangler and R2 Command

Check identity only:

```powershell
.\.project-lock\safe-wrangler.ps1
```

If Wrangler is not configured for this project, the wrapper cleanly blocks with:

```text
Wrangler is not configured for this project.
```

If Wrangler is configured in another repository, run a Wrangler/R2 command after verification, config detection, `wrangler whoami`, and a manual `YES`:

```powershell
.\.project-lock\safe-wrangler.ps1 r2 bucket list
```

Wrangler commands are blocked until the expected config path in `.project-lock\identity.json` exists.

## Daily Workflow

1. Run `.\.project-lock\verify.ps1`.
1. Use `.\.project-lock\safe-git-push.ps1` instead of `git push`.
1. Use `.\.project-lock\safe-railway.ps1` for Railway commands and type `YES` before any action.
1. Use `.\.project-lock\safe-wrangler.ps1` only in projects that have Wrangler configured.
1. Re-run verification before pushing or changing project targets.

## Never Store These In Git

Never commit tokens, passwords, API keys, `DATABASE_URL`, Railway tokens, Cloudflare tokens, R2 keys, `.env` files, private keys, PEM files, or files under `secrets/`, `tokens/`, or `.project-secrets/`.
Never store a GitHub token in the repo either.

## Install Pre-Push Hook

Run:

```powershell
.\.project-lock\install-hooks.ps1
```

The installed `.git/hooks/pre-push` runs `.project-lock\verify.ps1` and blocks pushes when verification fails.

## Add To Another Project

Copy `.project-lock` and `PROJECT_SAFETY_LOCK.md` into the other repository, then edit `.project-lock\identity.json` so every expected Git, Railway, Cloudflare, Wrangler, and R2 field matches that project. Run verification, install hooks, and test the safe wrappers before doing any push or deploy.
