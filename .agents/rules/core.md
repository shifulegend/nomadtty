# Antigravity — Core Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

- One responsibility per file. `src/kb.js` = toolbar UI + PTY input only.
- Functions in `kb.js`: < 30 lines; named for what they do, not how.
- New features: extend NAV / FK / FK_CODES tables. Do not duplicate send logic.
- `src/kb.js`: single IIFE, no `import`/`export`, no external dependencies.
- Shell scripts: `set -euo pipefail`; clear errors to stderr before exit 1.
- Prefer composition and small isolated pieces. Three similar lines > premature helper.
- Reuse existing patterns before introducing new abstractions.
- nginx sub_filter three-element order is fixed: viewport meta → WS hook → kb.js tag.
