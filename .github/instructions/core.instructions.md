---
applyTo: "**"
---
# NomadTTY — Core Instructions
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

- One responsibility per file. `src/kb.js` = toolbar + PTY input only.
- Functions in `kb.js`: < 30 lines each, named for what they do.
- New toolbar features: extend NAV / FK / FK_CODES tables at the top of the IIFE.
- Do not duplicate send logic across handlers.
- `src/kb.js` is a single IIFE — no `import`/`export`, no npm dependencies.
- Shell scripts must use `set -euo pipefail` and emit clear errors to stderr.
- Prefer composition and small isolated pieces over abstraction.
- Reuse existing patterns before introducing new helpers.
