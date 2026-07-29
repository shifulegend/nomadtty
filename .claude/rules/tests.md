# Claude Code — Tests and Verification Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (Verification section) -->
<!-- last updated: 2026-07-29 -->

## Current test infrastructure
- `tests/` — a self-contained Playwright E2E suite (own `package.json`, boots
  `server/main.js` itself — Session Manager + MCP server together) covering the
  Session Manager UI, terminal interaction, and all 7 MCP tools. Run: `cd tests &&
  npm install && npx playwright test`. 35 tests, must stay 35/35 passing (occasional
  isolated PTY-redraw-timing flakes are a known class — see `tests/README.md`'s "A
  note on flakiness" — a *repeatable* failure on a specific test is the real signal).
  See `tests/README.md` for why terminal-output assertions read the ttyd WebSocket
  stream / tmux capture text rather than the canvas DOM or raw substring counts.
- Everything else (legacy nginx/ttyd model) is still manual verification.

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

### After any server/session-manager.js, server/mcp/**, or server/main.js change
1. `cd tests && npx playwright test` — must stay 35/35 passing. This alone covers what
   used to be a manual checklist: both listeners booting with no port conflicts,
   `tools/list` returning all 7 tools with valid schemas, every tool's happy path and
   its validation-error paths, auth accept/reject, and the boot-security refusal.
2. Only fall back to manual `curl`/`tmux capture-pane` cross-checking when
   investigating a failure the automated suite doesn't pinpoint clearly, or when
   exploring genuinely new behavior not yet covered by `tests/specs/mcp-tools.spec.js`.

## Future test targets (TODO)
- [ ] shellcheck in CI on install.sh and docker-entrypoint.sh
- [ ] nginx config syntax check in CI: `nginx -t -c nginx/ttyd.conf`
- [ ] Wire server/session-manager.js + server/mcp/** into CI (`npm install`, boot, smoke-test)
