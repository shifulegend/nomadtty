# Claude Code — Tests and Verification Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (Verification section) -->
<!-- last updated: 2026-06-20 -->

## Current test infrastructure
- No automated tests yet (TODO: add shellcheck CI, browser smoke test).
- All verification is currently manual.

## Verification checklist per change type

### After any src/kb.js change
1. Reload nginx: `sudo systemctl reload nginx`
2. Open terminal in browser; confirm toolbar at top, two rows visible.
3. DevTools console: zero JS errors.
4. Click ESC: confirm `\x1b` sent to PTY (tmux pane reacts or test via CDP).
5. Tap CTRL (turns blue) → type a letter → confirm control byte intercepted.
6. Tap Fn → confirm F1–F12 row appears.
7. Zoom buttons: A− / A+ → confirm terminal text scales.
8. CDP method: `window._S.readyState === 1` must be true.

### After any nginx/ttyd.conf change
1. `sudo nginx -t` — must pass (MIME duplicate warnings from other vhosts are OK).
2. `sudo systemctl reload nginx`
3. `curl -s http://terminal.pz.net/ | grep 'kb.js'` — must match.
4. `curl -s http://terminal.pz.net/ | grep 'viewport'` — must match.

### After any install.sh change
1. `shellcheck install.sh` — zero errors.
2. ASSUMPTION: test on a clean Ubuntu 24.04 VM when available.

### After any Dockerfile change
1. `docker build -t nomadtty-test .` — must succeed.
2. `docker run --rm -p 18080:80 nomadtty-test` → open `http://localhost:18080`.

## Future test targets (TODO)
- [ ] shellcheck in CI on install.sh and docker-entrypoint.sh
- [ ] Playwright smoke test: load terminal, confirm toolbar visible, send ESC, check PTY
- [ ] nginx config syntax check in CI: `nginx -t -c nginx/ttyd.conf`
