# Skill: implement-task
<!-- Claude Code skill — structured implementation workflow -->
<!-- last updated: 2026-06-20 -->

## Purpose
Prevents drift, scope creep, and undocumented assumptions during implementation.

## Steps
1. Run `session-start` skill if not already done this session.
2. State the task scope:
   - What will change
   - What will NOT change
   - Files expected to touch
3. State assumptions explicitly — wrong assumptions are mistakes.
4. Check `docs/ai/mistakes.md` for any relevant prior mistakes.
5. Implement in the smallest coherent sub-steps.
6. After each sub-step:
   - Run the relevant verification from `.claude/rules/tests.md`.
   - Update `docs/ai/change-trace.md`.
   - Propose a commit checkpoint.
7. At completion:
   - Run `review-and-verify` skill.
   - Run `project-memory` skill to update all docs.
   - Final commit proposed with exact message per `docs/ai/commit-log-guidance.md`.
