# Claude Code — Tests and Verification Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (Verification section) -->
<!-- last updated: 2026-07-29 -->

## Current test infrastructure
- `tests/` — a self-contained Playwright E2E suite (own `package.json`, boots
  `server/main.js` itself — Session Manager + MCP server together) covering the
  Session Manager UI, terminal interaction, all 7 MCP tools, and real-mobile-device
  rendering/UX (`specs/android-mobile-ux.spec.js`, via Playwright's `devices['Pixel 7']`
  emulation — see docs/ai/decision-log.md for why this is used instead of a full
  Android emulator). Run: `cd tests && npm install && npx playwright test`. 39 tests,
  must stay 39/39 passing (occasional isolated PTY-redraw-timing flakes are a known
  class — see `tests/README.md`'s "A note on flakiness" — a *repeatable* failure on a
  specific test is the real signal).
  See `tests/README.md` for why terminal-output assertions read the ttyd WebSocket
  stream / tmux capture text rather than the rendered DOM/canvas or raw substring counts.
- Everything else (legacy nginx/ttyd model) is still manual verification.

## Verification checklist per change type

### After any src/kb.js change
1. `cd tests && npx playwright test specs/android-mobile-ux.spec.js` — must stay
   4/4 passing. Covers the mobile-specific checklist below on a real Pixel 7 device
   emulation profile (real DPR/touch), automatically.
2. Reload nginx: `sudo systemctl reload nginx` (legacy nginx/ttyd deployment only).
3. Open terminal in browser; confirm toolbar at top, two rows visible.
4. DevTools console: zero JS errors.
5. Click ESC: confirm `\x1b` sent to PTY (tmux pane reacts or test via CDP).
6. Tap CTRL (turns blue) → type a letter → confirm control byte intercepted **and
   that no extra, unmodified character also arrives** (see mistakes.md 2026-07-29-016
   — checking only for the control byte's presence previously missed a real
   double-send bug; the automated test in step 1 checks the full output).
7. Tap Fn → confirm F1–F12 row appears.
8. Zoom buttons: A− / A+ → confirm terminal text scales, **and confirm A+ is still
   reachable/tappable after scrolling the toolbar row all the way right** (see
   mistakes.md 2026-07-29-017 — the floating Back button can otherwise cover it).
9. CDP method: `window._S.readyState === 1` must be true.

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
1. `cd tests && npx playwright test` — must stay 39/39 passing. This alone covers what
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
