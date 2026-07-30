# NomadTTY — Playwright E2E Suite

End-to-end tests for the Session Manager (`server/session-manager.js`,
`public/session-manager.*`), the terminal it manages, and the MCP server
(`server/mcp/**`). This directory is fully self-contained: it owns its own
`package.json`, Playwright config, and `node_modules`.

## Requirements

- Node.js (test runner + the app's own server, which is also plain Node core).
- `ttyd` and `tmux` on PATH — the same runtime dependencies the app itself
  needs (see `docs/ai/project-overview.md`). On Debian/Ubuntu: `apt-get
  install ttyd tmux`.
- Playwright's Chromium browser available (`npx playwright install chromium`
  if `npx playwright test` reports a missing browser).

## Running

```sh
cd tests
npm install        # first time only
npx playwright test
```

The Playwright config (`playwright.config.js`) starts `server/main.js` itself
(Session Manager + MCP server together, on test-only ports/token — see
`helpers/env.js` — distinct from the app's real defaults so a test run never
collides with a live NomadTTY instance) and tears it down afterwards. No
manual server startup is needed.

## Layout

- `helpers/env.js` — the ports this run uses; single source of truth shared
  by the config and every spec.
- `helpers/session-manager.js` — drives the Session Manager UI (create/join
  a session through real clicks) and small API helpers used only for test
  setup/teardown and cross-checking backend state.
- `helpers/ws-capture.js` — see the comment at the top of that file. Short
  version: xterm.js's renderer mode (webgl/canvas/dom — a server-side ttyd
  flag, see `TTYD_RENDERER_TYPE` in `server/session-manager.js`, not
  something a test can toggle) determines whether "what the terminal
  displays" even exists as a DOM text node. Assertions on terminal *output*
  instead decode the same `/term/<id>/ws` WebSocket frames the browser
  already receives (ttyd's 1-byte-prefixed protocol), which is
  deterministic and correct regardless of renderer choice. Terminal
  *mounting* is still awaited with a real `waitForSelector('.xterm-screen')`
  (`waitForTerminalReady` in `helpers/session-manager.js`) before any
  interaction — this only replaces "how do we read what's on screen," not
  "how do we know the screen exists yet."
  Use **`waitForOutputLine(line)`** (not raw substring counting) whenever a
  test needs to prove a command actually *ran*, not just that it was typed —
  it matches `line` only as a complete line on its own, which is immune to a
  terminal redraw splitting the *echoed input* text mid-word (see
  `docs/ai/mistakes.md` 2026-07-29-009 for the flake this fixed).
- `helpers/mcp-client.js` — a minimal MCP JSON-RPC/SSE client for the tests
  in `specs/mcp-tools.spec.js` (no `@modelcontextprotocol/sdk` dependency —
  keeps the test client's implementation independent of the server's).
  `outputHasOwnLine(content, marker)` is this file's equivalent of
  `ws-capture.js`'s `waitForOutputLine()`, for the same reason: a naive
  `content.includes(marker)` against a tmux capture is fooled whenever
  `marker` also appears in the command that was *typed* to produce it (e.g.
  `seq 1 300`'s own echoed input already contains "300") — see
  `docs/ai/mistakes.md` 2026-07-29-013. `pollUntil(fn, opts)` is the generic
  retry helper these HTTP-based tests use in place of a WebSocket wait.
- `specs/session-lifecycle.spec.js` — non-interactive Session Manager states:
  empty state, list populating, a closed session disappearing, multiple
  sessions, background polling.
- `specs/terminal-interaction.spec.js` — interactive terminal behaviour:
  `echo` stdout, a computed command's result, input surviving a viewport
  resize, Ctrl+C interrupting a running command.
- `specs/session-persistence.spec.js` — leaving and rejoining a session
  reattaches to the same tmux session with scrollback intact, and updates
  the list's last-joined timestamp (asserting the actual rendered clock-time
  pattern, not just the absence of the placeholder "never joined" text).
- `specs/mcp-tools.spec.js` — all 10 MCP tools over real HTTP (no browser):
  protocol basics (`tools/list`, bearer-token auth), `get_screenshot`,
  `read_terminal_contents` (`head`/`tail`/`full`/live-`follow` SSE
  streaming), `scroll_buffer`, `type_command`, `send_keystroke` (named +
  hex, including a real Ctrl+C interrupt), `get_process_status`,
  `list_active_ports`, and session lifecycle (`list_sessions`,
  `create_session`, `close_session`) — plus validation-error paths for each.
- `specs/android-mobile-ux.spec.js` — mobile rendering/UX validated via
  Playwright's `devices['Pixel 7']` emulation (real viewport, `devicePixelRatio`,
  touch, mobile user-agent — see `docs/ai/decision-log.md` for why this is used
  instead of a full Android emulator/AVD): the Session Manager's mobile layout,
  full navigation (Join → interact → tap Back → re-Join with scrollback intact),
  a Back-button/terminal-canvas overlap geometry assertion, and the toolbar's
  touch-specific interactions (CTRL modifier + physical key, Fn row toggle, zoom).
  This file exists to catch defects invisible at desktop `devicePixelRatio=1` —
  it directly caught the renderer bug in `docs/ai/mistakes.md` 2026-07-29-014
  (which prompted writing it), and, once written, also caught three further
  real bugs neither of the other suites could have reached: 2026-07-29-016
  (a modifier-key double-send), 2026-07-29-017 (the Back button covering the
  toolbar's own "A+" button at full scroll), and 2026-07-29-019 (toolbar buttons
  firing on a drag/swipe, not just a stationary tap).
- `specs/android-mobile-stress.spec.js` (14 tests) — concurrent-interaction stress
  testing, also on the Pixel 7 profile: typing while scrolling, scrolling while a
  long-running foreground process actively streams output (see
  `scripts/simulate-model-stream.mjs` and `docs/ai/decision-log.md` for why a
  deterministic script stands in for a real AI CLI/model here), typing while
  streaming, device rotation with the on-screen keyboard simulated open, rapid
  Fn-row/zoom stress *during* an active stream, a CTRL+C-interrupts-a-stream
  test, and a Back-mid-stream-then-rejoin test. Six of the fourteen are a
  dedicated "on-screen keyboard toggle during active generation" block, each
  pairing a keyboard open/close reflow with a distinct concurrent condition:
  (1) rapid repeated open/close cycles, (2) typing that lands mid-transition
  as the keyboard opens, (3) keyboard + Fn row open simultaneously, (4)
  keyboard + zoom simultaneously, (5) keyboard open + an aggressive scroll
  gesture, (6) tapping Back while the keyboard is open, then re-Joining.
  This file is what surfaced 2026-07-29-018 — touch-scroll spamming
  Up/Down-arrow escape sequences into the PTY as real input on every gesture,
  corrupting visible output — caught by literally looking at a mid-stress
  screenshot, not just by a passing/failing assertion (the initial version of
  these tests didn't check for it and would have passed regardless).
  `tests/helpers/stress.js` holds the shared helpers (`startStream`,
  `touchScrollTerminal`, `toggleOnScreenKeyboard`, `rotateDevice`,
  `collectPageErrors`) used by both this file and the touch-sensitivity /
  keyboard-toggle-reflow tests added to `android-mobile-ux.spec.js`.

## Test isolation

`server/session-manager.js` keeps all open sessions in a single in-memory
registry shared by every browser context (and every MCP session) that talks
to it, so the suite runs with `workers: 1` (see `playwright.config.js`)
rather than in parallel — two specs racing to create/close sessions against
the same registry would make each other's list-state assertions flaky. Each
spec cleans up the sessions it created in `afterEach`/`beforeEach`, and
`global-teardown.js` sweeps any stragglers before the server itself is
stopped, so no ttyd/tmux processes are left running after a test run.

## A note on flakiness

This suite drives a real PTY (tmux) through a real terminal emulator (ttyd),
not a mock — occasional redraw-timing flakiness (a tmux status-bar refresh
or similar landing mid-keystroke) is a known, documented class of issue (see
`docs/ai/mistakes.md` 2026-07-29-009 and -013), not evidence the suite is
unreliable. If a run shows an isolated failure, re-run before assuming a
regression; if a *specific* test fails repeatedly, that's a real signal.

**Resolved (2026-07-30):** five tests previously documented here as "repeatably flaky"
or "confirmed pre-existing, not yet root-caused" — `get_screenshot › captures the
terminal's live viewport`, `type_command › submit:false leaves the text unsent`,
`send_keystroke › named mode: Ctrl+C interrupts a running foreground command`,
`android-mobile-ux.spec.js`'s `Hist toggle reveals real scrollback via tmux copy-mode`,
and `list_active_ports › lists the MCP server's own listening port` — were all
root-caused and fixed, not just documented. Two were genuine product bugs
(`server/mcp/tmux.js`'s `listeningSockets()` had no fallback when `ss`/`netstat` aren't
installed; `src/kb.js`'s touch-scroll handler fired one unthrottled POST per touchmove
step, a real mobile-UX responsiveness bug); three were test-side races/timeouts. See
`docs/ai/decision-log.md`'s matching 2026-07-30 entry and `docs/ai/mistakes.md`
2026-07-30-006 for the full detail. Verified via 3 consecutive full-suite runs at
63/63, not a single green run.
