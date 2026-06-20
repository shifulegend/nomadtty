---
mode: agent
---
# Implement Task

Task: [DESCRIBE TASK]

Follow this workflow:
1. Run the start-session checklist (`docs/ai/session-start-checklist.md`).
2. State scope, files to touch, and assumptions.
3. Implement the smallest coherent sub-step.
4. After each sub-step:
   - Run the verification from `.github/instructions/tests.instructions.md`.
   - Update `docs/ai/change-trace.md`.
   - Propose a commit checkpoint with exact message per `docs/ai/commit-log-guidance.md`.
5. At completion:
   - Update `docs/ai/mistakes.md` if any mistake was found.
   - Update `docs/ai/decision-log.md` if any decision was made.
   - Synchronise all adapter files per `docs/ai/tool-sync-policy.md`.
   - Propose the final commit.
