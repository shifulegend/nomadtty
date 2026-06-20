---
mode: ask
---
# Debug Failure

Symptom: [DESCRIBE WHAT IS BROKEN]

Debug systematically:
1. Check `docs/ai/mistakes.md` — has this exact failure happened before?
2. Reproduce the smallest case that shows the failure.
3. State your hypothesis about the root cause.
4. State what you will check to confirm/deny the hypothesis.
5. Fix the smallest thing that resolves the root cause.
6. Verify the fix resolves the symptom.
7. Document the mistake in `docs/ai/mistakes.md` with full entry (timestamp, summary,
   root cause, affected files, detection, correction, prevention rule).
8. Propagate the prevention rule to `docs/ai/engineering-rules.md` and relevant adapter files.
9. Propose commit: `fix(<scope>): <what was fixed and why>`
