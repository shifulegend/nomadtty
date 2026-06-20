---
mode: ask
---
# Review Changes

Review the current diff or the changes in [FILE/FEATURE]:

1. Check against `docs/ai/engineering-rules.md` — any violations?
2. Check against `docs/ai/mistakes.md` — does this repeat a known mistake?
3. Verify all relevant checks from `.github/instructions/tests.instructions.md` were run.
4. Check: is the sub_filter replacement string still < 500 B? (if nginx changed)
5. Check: is `--writable` still in ttyd ExecStart? (if systemd/docker changed)
6. Check: are `docs/ai/**` and adapter files updated?
7. Suggest the exact commit message per `docs/ai/commit-log-guidance.md`.

State clearly: what was verified, what remains unverified.
