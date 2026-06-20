# Antigravity — Tests and Verification Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

## After src/kb.js changes
1. Reload nginx. Browser: toolbar at top, two rows, zero console errors.
2. Click ESC → PTY receives \x1b.
3. Tap CTRL (blue) + type letter → keydown interceptor fires.
4. Tap Fn → F1–F12 row visible.
5. CDP: `window._S.readyState === 1`.

## After nginx/ttyd.conf changes
1. `nginx -t` — must pass.
2. `curl -s http://<host>/ | grep 'kb.js'` must match.
3. `curl -s http://<host>/ | grep 'viewport'` must match.

## After install.sh changes
- `shellcheck install.sh` — zero errors.

## After Dockerfile changes
- `docker build -t nomadtty-test .` succeeds.
- `docker run --rm -p 18080:80 nomadtty-test` → toolbar loads.

## Never claim done without stating what was verified and what was not.
