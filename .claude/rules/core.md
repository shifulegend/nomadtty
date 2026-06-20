# Claude Code — Core Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

## Modularity
- One responsibility per file. `src/kb.js` = toolbar UI + PTY input only.
- Functions in `kb.js` < 30 lines each. Named for WHAT, not HOW.
- New toolbar features: extend NAV/FK/FK_CODES tables; do not duplicate send logic.
- nginx config changes must not break the three-element sub_filter chain
  (viewport meta → WS hook → kb.js script tag). Keep them in that order.

## No hardcoding
- Port → `TTYD_PORT` env var (default 47821)
- Domain → `NOMADTTY_HOST` env var (default `_`)
- Web root `/var/www/nomadtty` defined in nginx config + install.sh only
- Zoom levels / key sequences / button labels → defined in tables at top of IIFE

## Code organisation
- `src/kb.js`: single IIFE, no `import`/`export`, no dependencies
- CSS: inlined via a `<style>` element created by `kb.js`
- Key sequences at top of IIFE: `NAV`, `FK`, `FK_CODES` tables
- Shell scripts: `set -euo pipefail`; clear error messages to stderr

## Composition principle
Prefer composition and small isolated pieces. Reuse existing patterns before
introducing new abstractions. Three similar lines is better than a premature helper.

## Verification before commit
See `.claude/rules/tests.md` for the full per-file verification checklist.
