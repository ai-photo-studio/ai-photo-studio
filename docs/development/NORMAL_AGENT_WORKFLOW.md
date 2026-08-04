# Normal Agent Workflow

This document is the authoritative replacement for any prior Codex CLI
automation / detached-runner workflow. It is short by design: no runner
framework, no preflight scripts, no scheduled orchestration.

1. Open the intended repository/worktree manually.
2. Confirm the current branch and `git status` before doing anything.
3. Start the normal interactive Agent (Claude Code, or the editor's Codex
   Agent integration) from that workspace.
4. Paste one bounded product task.
5. Do not use `codex exec`, detached runners, scheduled tasks, or prompt
   orchestration scripts to drive work unattended.
6. For long-running tests or builds, give periodic progress pulses rather
   than going silent.
7. Use the repair -> test -> repair loop until the change is clean. Do not
   weaken or delete tests to make them pass.
8. Commit, push, and open a PR only after verification (lint, typecheck,
   build, and the relevant test suites) has actually run and passed.
9. A genuine external dependency (missing secret, un-provisioned merchant
   account, production access, official third-party protocol) is
   `WAITING_EXTERNAL` — record it precisely and keep working on everything
   else. It is not a reason to stop all work or to return a vague blocked
   status.

## Why this document exists

An earlier phase of this project used Codex CLI (`@openai/codex`) style
detached automation and temporary runner scripts to drive multi-step work.
An audit (2026-08-04) found no such automation actually installed or running
on this machine — no global `@openai/codex` package, no scheduled tasks, no
startup launchers, only the normal editor's Codex Agent integration process
(`codex.exe app-server`, part of the OpenAI ChatGPT VS Code extension), which
is retained since it is normal interactive Agent tooling, not unattended
automation. Any stray one-off runner scripts and scratch directories found
under `D:\Temp` from that period were removed where they were unambiguously
temporary and unreferenced; anything that turned out to be a real registered
git worktree was left untouched.

See `rules.md` for the permanent protocol this document supports.
