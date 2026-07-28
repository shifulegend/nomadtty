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
9. Never push directly to `main`. All changes via branches and PRs.
10. CI must pass (shellcheck + docker build) before merging.
11. Community health files (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
    `SUPPORT.md`) are part of the repo and must be kept current.

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

## Agentic Session Constraints (added 2026-07-29)

### Commit Discipline (Mandatory)
After every logical task is completed and verified, the agent MUST explicitly execute a `git add`, `git commit` with a descriptive message, and `git push` before proceeding to the next task. No batching unrelated changes into a single commit, and no skipping this step under time pressure or task complexity.

### CI & Linting Integrity (Mandatory)
No CI tests or linting rules are to be skipped, disabled, or removed under any circumstances, regardless of whether they appear to block progress. If a test or lint rule seems incorrect, flag it explicitly for human review rather than bypassing it.

### Terminal Emulator Performance Constraint
The primary UI for this application is a terminal emulator. Heavy DOM reflows must be avoided at all costs. Any change touching rendering, layout, or frequent re-renders must be evaluated for reflow/repaint cost before merging. Prefer virtualized rendering, batched updates, and off-DOM computation wherever possible.
