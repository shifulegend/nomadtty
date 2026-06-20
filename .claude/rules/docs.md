# Claude Code — Documentation Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (Documentation section) -->
<!-- last updated: 2026-06-20 -->

## Documentation discipline
- Update `docs/ai/**` FIRST, then synchronise adapter files.
- Every decision → `docs/ai/decision-log.md` entry immediately.
- Every mistake → `docs/ai/mistakes.md` entry immediately.
- Every notable change → `docs/ai/change-trace.md` entry before the commit.
- Add timestamps to all doc entries.
- Keep docs concise, factual, repository-specific.

## Comment style in code
- Add a comment only when the WHY is non-obvious.
- Add a timestamp when documenting a workaround, risk, or temporary constraint.
- Do not comment WHAT the code does — names should do that.
- Do not reference issue numbers or PR names in code comments (they rot).

## Synchronisation after every session
1. Update canonical `docs/ai/**` first.
2. Update CLAUDE.md + `.claude/rules/**`.
3. Update `.github/copilot-instructions.md` + `.github/instructions/**`.
4. Update `gemini/GEMINI.md` + `AGENTS.md` + `.agents/rules/**`.
5. Record the sync in `docs/ai/change-trace.md`.

## README.md
- `README.md` is user-facing documentation. Keep it accurate with the current
  architecture, keyboard reference, and install steps.
- If the toolbar layout changes, update the Keyboard Toolbar Reference table.
- If the architecture diagram changes, update the ASCII diagram.
