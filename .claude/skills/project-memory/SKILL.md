# Skill: project-memory
<!-- Claude Code skill — update project memory after discoveries -->
<!-- last updated: 2026-06-20 -->

## Purpose
Keeps all shared docs and adapter files current after any durable discovery.

## Trigger conditions
Invoke this skill whenever:
- A new mistake is found
- A new architectural decision is made
- A new convention is adopted
- A workflow changes
- A correction is applied

## Steps
1. Identify the type of update: mistake / decision / rule / architecture / workflow.
2. Update the relevant `docs/ai/` canonical file first:
   - New mistake → `docs/ai/mistakes.md` (newest first)
   - New decision → `docs/ai/decision-log.md` (newest first)
   - Rule change → `docs/ai/engineering-rules.md`
   - Architecture change → `docs/ai/project-overview.md`
   - Any change → `docs/ai/change-trace.md` (add entry)
3. Propagate to adapter files per `docs/ai/tool-sync-policy.md`:
   - Claude Code: `CLAUDE.md` and relevant `.claude/rules/*.md`
   - Copilot: `.github/copilot-instructions.md` and relevant `.github/instructions/*.instructions.md`
   - Antigravity: `gemini/GEMINI.md`, `AGENTS.md`, relevant `.agents/rules/*.md`
4. Propose or execute commit: `chore(rules): <what changed and why>`.
