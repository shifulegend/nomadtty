---
applyTo: "**"
---
# NomadTTY — Test and Verification Instructions
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

## After src/kb.js changes
1. `sudo systemctl reload nginx`
2. Browser: toolbar at top, two rows, zero console errors.
3. Click ESC — PTY receives `\x1b`.
4. Tap CTRL (blue) + type letter — intercepted by keydown listener.
5. Tap Fn — F1–F12 row appears.
6. CDP check: `window._S.readyState === 1`.

## After nginx/ttyd.conf changes
1. `sudo nginx -t` (MIME warnings from other vhosts are OK)
2. `sudo systemctl reload nginx`
3. `curl -s http://<host>/ | grep 'kb.js'` must match.

## After install.sh changes
- `shellcheck install.sh` — zero errors.

## After Dockerfile changes
- `docker build -t nomadtty-test .` must succeed.
- `docker run --rm -p 18080:80 nomadtty-test` → open `http://localhost:18080`.

## Never claim done without stating what was verified.
