# NomadTTY — Antigravity (Gemini) Global Rules
<!-- adapter; canonical source of truth: docs/ai/ -->
<!-- last updated: 2026-06-20 -->

## Session start (mandatory)
Before planning or coding, read in this order:
1. `docs/ai/project-overview.md`
2. `docs/ai/engineering-rules.md`
3. `docs/ai/mistakes.md` — never repeat a documented mistake
4. `docs/ai/decision-log.md`
5. `docs/ai/session-start-checklist.md`

Then state: relevant rules, mistakes to avoid, constraining decisions, assumptions.

## What this project is
NomadTTY: mobile-friendly web terminal. **ttyd** (C binary) wrapped by **nginx**
which injects a touch keyboard toolbar (`src/kb.js`) via `sub_filter`. Persistent
tmux sessions. Zero JS dependencies. No build step.
Stack: vanilla JS · bash · nginx config · Docker · systemd.

## Hard invariants
- `--writable` must be in every ttyd ExecStart/CMD. (mistakes.md [2026-06-20-001])
- ttyd listens on `127.0.0.1` only.
- sub_filter replacement string < 500 B. (mistakes.md [2026-06-20-004])
- `window._S.send('0' + bytes)` is how kb.js sends PTY input.
- `nginx -t` before every reload.
- Never `sed s///` on lines containing JS or URLs. (mistakes.md [2026-06-20-006])

## Key files
| File | Role |
|------|------|
| `src/kb.js` | Touch keyboard toolbar (~260 lines IIFE vanilla JS) |
| `nginx/ttyd.conf` | nginx vhost + sub_filter injection |
| `systemd/ttyd.service` | ttyd with tmux persistence |
| `Dockerfile` | Multi-arch ubuntu:24.04 image |
| `install.sh` | Debian/Ubuntu one-command installer |
| `docs/ai/` | Canonical shared project memory |
| `.agents/rules/` | Detailed Antigravity rule files |
| `.agents/workflows/` | Reusable Antigravity workflows |

## Scoped rules
- `.agents/rules/core.md` — modularity, code organisation
- `.agents/rules/docs.md` — documentation discipline
- `.agents/rules/tests.md` — verification checklists
- `.agents/rules/config.md` — env vars, configurability
- `.agents/rules/infra.md` — Dockerfile, nginx, systemd, install.sh

## Dynamic file rule
Proactively update `docs/ai/**` and ALL adapter files when durable lessons are
learned. Do not wait to be asked. See `docs/ai/tool-sync-policy.md`.
