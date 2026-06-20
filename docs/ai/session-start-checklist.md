# NomadTTY — Session Start Checklist
<!-- canonical source of truth | run this at the start of every session -->
<!-- last updated: 2026-06-20 -->

## Mandatory steps before planning or coding

### 1. Read your tool's entrypoint file
- **Claude Code**: `CLAUDE.md` → `.claude/rules/core.md` and relevant rule files
- **Copilot**: `.github/copilot-instructions.md` → relevant `.github/instructions/*.instructions.md`
- **Antigravity**: `gemini/GEMINI.md` → `AGENTS.md` → relevant `.agents/rules/*.md`

### 2. Read shared canonical docs (in this order)
- [ ] `docs/ai/project-overview.md` — understand the current architecture
- [ ] `docs/ai/engineering-rules.md` — know the constraints before writing code
- [ ] `docs/ai/mistakes.md` — read ALL entries; do not repeat them
- [ ] `docs/ai/decision-log.md` — understand why things are the way they are
- [ ] `docs/ai/change-trace.md` — what changed recently

### 3. State your session summary (do this out loud / in your first response)
Answer these before touching any code:
- **Relevant repo rules for this session**: (list 2–3 most relevant from engineering-rules.md)
- **Recent mistakes to avoid**: (list any that are relevant to today's task)
- **Recent decisions that constrain today's task**: (list any that apply)
- **Open risks**: (from mistakes.md or project-overview.md TODO/UNKNOWN items)
- **Assumptions I am making**: (state them explicitly; wrong assumptions are mistakes)

### 4. Propose a plan before implementing
- State the scope.
- State what you will NOT change.
- List the files you expect to touch.
- Call out any verification step you will run.

### 5. Check tool-sync policy
- Read `docs/ai/tool-sync-policy.md` to know which files need updating when you're done.

---

## Quick reference: key invariants
- `--writable` must be in ttyd ExecStart. Always.
- ttyd listens on `127.0.0.1` only. Never expose directly.
- The sub_filter replacement string must stay < 500 B (nginx limit ≈ 4 KB, but keep headroom).
- `window._S` is the captured WebSocket; `kb.js` uses `window._S.send('0' + bytes)`.
- tmux session name is `main`. `tmux new-session -A -s main` attaches if it exists.
- TTYD_PORT defaults to 47821. NOMADTTY_HOST defaults to `_`.
- No bundler. `src/kb.js` is raw IIFE JS. No import/export.
- Run `nginx -t` before every `systemctl reload nginx`.
