# Contributing to NomadTTY

Thanks for your interest. This doc explains how to contribute effectively — including working with the AI-agent infrastructure that actively maintains this repo.

## Workflow

All changes go to `main` via a pull request. Direct pushes to `main` are not allowed.

1. Fork the repo and create a feature branch (`git checkout -b feat/my-change`).
2. Make your change. Keep PRs small and focused on one thing.
3. Verify your change per the checklist below.
4. Open a PR against `main` with the provided template filled in.

## Working with AI agents

This repo uses **Claude Code**, **GitHub Copilot**, and **Google Antigravity** as active development agents. If you are one of these agents, or are using one:

- **Start every session** by reading `AGENTS.md` (or the tool-specific entrypoint: `CLAUDE.md`, `.github/copilot-instructions.md`, or `gemini/GEMINI.md`).
- The canonical project memory lives in `docs/ai/`. All agents must update these files proactively — not just on request.
- Agents must synchronise **all three adapter stacks** (Claude, Copilot, Antigravity) at the end of every session. See `docs/ai/tool-sync-policy.md`.
- Never repeat a mistake documented in `docs/ai/mistakes.md`.

## Coding rules (short version)

Full rules in `.claude/rules/` / `.github/instructions/` / `.agents/rules/`.

- `src/kb.js` is a single IIFE. No imports, no bundler, no dependencies.
- Functions < 30 lines. New keys go in the `NAV`/`FK`/`FK_CODES` tables.
- Shell scripts: `set -euo pipefail`; clear stderr messages; pass `shellcheck`.
- nginx: always `nginx -t` before reload. Never `sed` on lines containing JS or URLs.
- `--writable` must appear in every ttyd `ExecStart`/`CMD`. This is non-negotiable.
- No hardcoded ports or domains — use `TTYD_PORT` and `NOMADTTY_HOST` env vars.

## Verification before submitting

| Changed file | What to verify |
|---|---|
| `src/kb.js` | Toolbar renders; zero console errors; ESC/CTRL/Fn work; visualViewport resize works on mobile |
| `nginx/ttyd.conf` | `nginx -t` passes; `curl` confirms `kb.js` and `viewport` are injected |
| `install.sh` | `shellcheck install.sh` zero errors |
| `Dockerfile` | `docker build` succeeds; container serves terminal on port 80 |

## Documentation

- Update `docs/ai/change-trace.md` for every notable change.
- Update `docs/ai/decision-log.md` if an architectural decision was made.
- Update `docs/ai/mistakes.md` immediately if you found and fixed a mistake.
- Update `README.md` if behaviour, keyboard layout, or architecture changed.

## Commit style

```
type(scope): short imperative description

Longer explanation if needed.
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`. Scope examples: `kb.js`, `nginx`, `install`, `docker`.

## Security issues

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md).
