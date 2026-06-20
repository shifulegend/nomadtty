---
mode: agent
---
# Update Project Memory

A durable lesson was discovered: [DESCRIBE LESSON / MISTAKE / DECISION / RULE CHANGE]

Update all project memory files in this order:
1. Identify type: mistake / decision / rule / architecture / workflow.
2. Update the relevant `docs/ai/` canonical file first.
3. Synchronise adapter files per `docs/ai/tool-sync-policy.md`:
   - `CLAUDE.md` + `.claude/rules/**` (if relevant)
   - `.github/copilot-instructions.md` + `.github/instructions/**` (if relevant)
   - `gemini/GEMINI.md` + `AGENTS.md` + `.agents/rules/**` (if relevant)
4. Add entry to `docs/ai/change-trace.md`.
5. Propose commit: `chore(rules): <what changed and why>`
