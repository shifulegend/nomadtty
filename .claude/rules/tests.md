# Claude Code — Tests and Verification Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (Verification section) -->
<!-- last updated: 2026-07-29 -->

## Current test infrastructure
- `tests/` — a self-contained Playwright E2E suite (own `package.json`, boots
  `server/session-manager.js` itself) covering the Session Manager UI and terminal
  interaction. Run: `cd tests && npm install && npx playwright test`. 11 tests, must
  stay 11/11 passing — see `tests/README.md` for why assertions read the ttyd
  WebSocket stream rather than the canvas DOM.
- The MCP server (`server/mcp/**`) has no automated tests yet (TODO) — verified
  manually per the checklist below.
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
1. `cd tests && npx playwright test` — must stay 11/11 passing (confirms
   `server/session-manager.js` still works standalone, unchanged, for the webServer
   that suite boots itself).
2. `npm install` at repo root, then boot `node server/main.js` with distinct
   `SESSION_MANAGER_PORT`/`TTYD_BASE_PORT`/`MCP_PORT` — both listeners must come up
   with no port-conflict errors.
3. `initialize` → `tools/list` against `POST http://<host>:<MCP_PORT>/mcp` (with
   `Authorization: Bearer <MCP_AUTH_TOKEN>`) — must return exactly 7 tools with valid
   JSON Schemas: get_screenshot, scroll_buffer, type_command, send_keystroke,
   read_terminal_contents, get_process_status, list_active_ports.
4. Create a session via `POST /api/sessions`, then `tools/call` each tool against it;
   cross-check output against `tmux capture-pane -t <id> -p` run by hand.
5. Confirm auth is enforced: missing/wrong bearer token → 401; correct token → 200.
6. Confirm boot-security policy: `MCP_HOST=0.0.0.0` with no `MCP_AUTH_TOKEN` and no
   `MCP_ALLOW_INSECURE=1` must refuse to start (throws a clear error), not silently
   bind unauthenticated.

## Future test targets (TODO)
- [ ] shellcheck in CI on install.sh and docker-entrypoint.sh
- [ ] nginx config syntax check in CI: `nginx -t -c nginx/ttyd.conf`
- [ ] Automated tests for server/mcp/** (currently manual only — see checklist above)
- [ ] Wire server/session-manager.js + server/mcp/** into CI (`npm install`, boot, smoke-test)
