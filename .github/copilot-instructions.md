# NomadTTY — GitHub Copilot Instructions
<!-- adapter; canonical source of truth: docs/ai/ -->
<!-- last updated: 2026-06-20 -->

## Read this first
Before suggesting any code or plan, read these files in order:
1. `docs/ai/project-overview.md` — architecture, stack, terminology
2. `docs/ai/engineering-rules.md` — constraints you must follow
3. `docs/ai/mistakes.md` — do not repeat documented mistakes
4. `docs/ai/decision-log.md` — understand existing decisions
5. `docs/ai/session-start-checklist.md` — mandatory session ritual

## What this project is
NomadTTY is a mobile-friendly web terminal: **ttyd** wrapped by **nginx** which
injects a touch keyboard toolbar (`src/kb.js`) via `sub_filter`. Persistent
sessions via **tmux**. Zero dependencies. No build step. Stack: vanilla JS,
bash, nginx config, Docker, systemd.

## Hard invariants — never violate
- `--writable` must be in every ttyd ExecStart/CMD.
- ttyd listens on `127.0.0.1` only. Never on `0.0.0.0`.
- sub_filter replacement string < 500 B total.
- `window._S.send('0' + bytes)` is how kb.js sends PTY input.
- Run `nginx -t` before every reload.
- Never use `sed s///` on nginx lines containing JS or URLs.

## Scoped instruction files — read what is relevant
- `.github/instructions/core.instructions.md` — modularity, code organisation
- `.github/instructions/docs.instructions.md` — documentation discipline
- `.github/instructions/tests.instructions.md` — verification checklists
- `.github/instructions/config.instructions.md` — env vars, configurability
- `.github/instructions/infra.instructions.md` — Dockerfile, nginx, systemd, install.sh

## Reusable prompts — use for repeated workflows
- `.github/prompts/start-session.prompt.md`
- `.github/prompts/plan-task.prompt.md`
- `.github/prompts/implement-task.prompt.md`
- `.github/prompts/review-changes.prompt.md`
- `.github/prompts/debug-failure.prompt.md`
- `.github/prompts/update-project-memory.prompt.md`

## Dynamic file rule
You must proactively update `docs/ai/**` and ALL adapter files whenever a durable
lesson is learned, a mistake is corrected, or architecture/workflows change.
See `docs/ai/tool-sync-policy.md` for the full sync protocol.
