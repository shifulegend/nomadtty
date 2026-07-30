# Claude Code — Tests and Verification Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (Verification section) -->
<!-- last updated: 2026-07-29 -->

## Current test infrastructure
- `tests/` — a self-contained Playwright E2E suite (own `package.json`, boots
  `server/main.js` itself — Session Manager + MCP server together) covering the
  Session Manager UI, terminal interaction, all 10 MCP tools, real-mobile-device
  rendering/UX (`specs/android-mobile-ux.spec.js`), and concurrent-interaction stress
  testing (`specs/android-mobile-stress.spec.js`) — both via Playwright's
  `devices['Pixel 7']` emulation (see docs/ai/decision-log.md for why this is used
  instead of a full Android emulator). Run: `cd tests && npm install && npx playwright
  test`. 63 tests, must stay 63/63 passing (occasional isolated PTY-redraw-timing
  flakes are a known class — see `tests/README.md`'s "A note on flakiness" — a
  *repeatable* failure on a specific test is the real signal).
  See `tests/README.md` for why terminal-output assertions read the ttyd WebSocket
  stream / tmux capture text rather than the rendered DOM/canvas or raw substring counts.
- Everything else (legacy nginx/ttyd model) is still manual verification.

## Verification checklist per change type

### After any src/kb.js change
1. `cd tests && npx playwright test specs/android-mobile-ux.spec.js
   specs/android-mobile-stress.spec.js` — must stay 20/20 passing. Covers the
   mobile-specific checklist below, plus concurrent-interaction stress (typing/
   scrolling/rotation/keyboard-toggle during an actively streaming foreground
   process, including 6 dedicated keyboard-toggle-during-generation scenarios),
   on a real Pixel 7 device emulation profile (real DPR/touch), automatically.
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
10. Swipe/drag across a toolbar button (don't just tap it) → confirm it does NOT
    register as a press (mistakes.md 2026-07-29-019), and confirm a swipe on the
    terminal with Hist OFF never reaches the PTY as input (mistakes.md
    2026-07-29-018 — a swipe must be a total no-op there, never arrow-key
    escape bytes).
11. Tap Hist (turns blue) → swipe the terminal → confirm real scrollback content
    (produced earlier, since scrolled off the live view) reappears, and that
    `getSentInput()` in the WS capture helper stays empty throughout (this
    gesture must drive tmux copy-mode server-side, never `window._S.send()` —
    see decision-log.md's 2026-07-29 "Mobile touch-scroll re-enabled" entry).
    Tap Hist again → confirm typing works normally afterward.

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
1. `cd tests && npx playwright test` — must stay 63/63 passing. This alone covers what
   used to be a manual checklist: both listeners booting with no port conflicts,
   `tools/list` returning all 10 tools with valid schemas, every tool's happy path and
   its validation-error paths, auth accept/reject, the boot-security refusal, and (for
   any change touching `server/mcp/tmux.js`'s send*/copy-mode functions specifically)
   `mcp-tools.spec.js`'s "touch-history (copy-mode) / MCP interop" block — a concurrent
   `type_command`/`send_keystroke` call must still land in the shell, not copy-mode,
   while the pane is mid-scroll.
2. Only fall back to manual `curl`/`tmux capture-pane` cross-checking when
   investigating a failure the automated suite doesn't pinpoint clearly, or when
   exploring genuinely new behavior not yet covered by `tests/specs/mcp-tools.spec.js`.

## CI coverage (`.github/workflows/ci.yml`)
- [x] shellcheck on `install.sh` and `docker-entrypoint.sh` (`shellcheck` job)
- [x] `docker build` of the shipped `Dockerfile` (`docker-build` job)
- [x] nginx config syntax check: installs nginx, drops `nginx/ttyd.conf` into
  `sites-available`/`sites-enabled` exactly like `install.sh` does, runs `nginx -t`
  (`nginx-config` job)
- [x] Full Playwright suite (`server/session-manager.js` + `server/mcp/**`, real
  `npm ci`/boot/browser-driven smoke test) on every push/PR (`playwright` job) —
  uploads the HTML report as an artifact on failure
