# Antigravity Workflow: review-and-verify
<!-- last updated: 2026-06-20 -->

## When to use
Before proposing or executing any commit.

## Steps
1. Identify which file(s) changed: kb.js / nginx / systemd / Dockerfile / install.sh.
2. Run the relevant verification from `.agents/rules/tests.md`.
3. State what was verified and what remains unverified.
4. Check all modified markdown files are synchronised with the code.
5. If a mistake was found:
   - Fix it.
   - Add entry to `docs/ai/mistakes.md`.
   - Update relevant rule file.
6. Propose exact commit per `docs/ai/commit-log-guidance.md`.
