# Antigravity Workflow: update-project-memory
<!-- last updated: 2026-06-20 -->

## When to use
After discovering a durable lesson: mistake / decision / rule / architecture / workflow change.

## Steps
1. Identify type: mistake / decision / rule / architecture / workflow.
2. Update the canonical `docs/ai/` file first:
   - Mistake → `docs/ai/mistakes.md` (newest first)
   - Decision → `docs/ai/decision-log.md` (newest first)
   - Rule → `docs/ai/engineering-rules.md`
   - Architecture → `docs/ai/project-overview.md`
   - All changes → `docs/ai/change-trace.md`
3. Propagate to adapter files (see `docs/ai/tool-sync-policy.md`):
   - `CLAUDE.md` + `.claude/rules/**`
   - `.github/copilot-instructions.md` + `.github/instructions/**`
   - `gemini/GEMINI.md` + `AGENTS.md` + `.agents/rules/**`
4. Propose commit: `chore(rules): <what changed and why>`
