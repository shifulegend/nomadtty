# Skill: review-and-verify
<!-- Claude Code skill — verify a change before committing -->
<!-- last updated: 2026-06-20 -->

## Purpose
Ensures every change is verified at its surface before a commit is proposed.

## Steps
1. Identify which file(s) changed (kb.js / nginx / systemd / Dockerfile / install.sh).
2. Run the relevant verification checklist from `.claude/rules/tests.md`.
3. State what was verified and what remains unverified.
4. Check that all modified markdown files are synchronised with the code.
5. If a mistake was found during verification:
   - Fix it.
   - Add a `docs/ai/mistakes.md` entry.
   - Update the relevant rule file.
6. Propose exact commit message following `docs/ai/commit-log-guidance.md`.
7. If git is available, commit after all checks pass.
