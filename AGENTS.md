# NomadTTY — AGENTS.md
<!-- portability layer; synchronised with gemini/GEMINI.md on durable repo-wide rules -->
<!-- used by: Google Antigravity, any agent framework that reads AGENTS.md -->
<!-- last updated: 2026-06-20 -->

## Session start (mandatory — before planning or coding)
1. Read tool-specific entrypoint (GEMINI.md, CLAUDE.md, or copilot-instructions.md).
2. Read `docs/ai/session-start-checklist.md` and follow every step.
3. Read `docs/ai/mistakes.md` — never repeat a documented mistake.
4. Read `docs/ai/decision-log.md` — understand existing decisions.

## Project summary
NomadTTY: mobile web terminal. ttyd + nginx sub_filter + `src/kb.js` touch toolbar.
Persistent tmux sessions. Vanilla JS, no bundler, no dependencies.

## Non-negotiable rules
1. `--writable` in every ttyd ExecStart/CMD. Always.
2. ttyd on `127.0.0.1` only — never `0.0.0.0`.
3. sub_filter replacement < 500 B.
4. PTY input: `window._S.send('0' + bytes)`.
5. `nginx -t` before every reload.
6. Never `sed s///` to edit nginx lines with JS or URLs.
7. `set -euo pipefail` in all shell scripts.
8. `docs/ai/**` is the canonical source of truth. Update it first.

## Canonical docs (read before every task)
- `docs/ai/project-overview.md` — architecture, stack, terminology
- `docs/ai/engineering-rules.md` — constraints
- `docs/ai/mistakes.md` — known mistakes
- `docs/ai/decision-log.md` — architectural decisions
- `docs/ai/tool-sync-policy.md` — sync protocol

## Tool-specific entrypoints
- Claude Code: `CLAUDE.md` + `.claude/rules/`
- Copilot: `.github/copilot-instructions.md` + `.github/instructions/`
- Antigravity: `gemini/GEMINI.md` + `.agents/rules/`
