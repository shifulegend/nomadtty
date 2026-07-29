# NomadTTY — Playwright E2E Suite

End-to-end tests for the Session Manager (`server/session-manager.js`,
`public/session-manager.*`) and the terminal it manages. This directory is
fully self-contained: it owns its own `package.json`, Playwright config, and
`node_modules` — nothing outside `tests/` was changed to make it pass.

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

The Playwright config (`playwright.config.js`) starts
`server/session-manager.js` itself (on test-only ports — see
`helpers/env.js` — distinct from the app's real defaults so a test run
never collides with a live NomadTTY instance) and tears it down afterwards.
No manual server startup is needed.

## Layout

- `helpers/env.js` — the ports this run uses; single source of truth shared
  by the config and every spec.
- `helpers/session-manager.js` — drives the Session Manager UI (create/join
  a session through real clicks) and small API helpers used only for test
  setup/teardown and cross-checking backend state.
- `helpers/ws-capture.js` — see the comment at the top of that file. Short
  version: the terminal renders through xterm.js's WebGL/canvas renderer, so
  there's no DOM text node holding "what the terminal displays," and the
  renderer mode is a server-side ttyd flag rather than something a test can
  toggle. Assertions on terminal *output* instead decode the same
  `/term/<id>/ws` WebSocket frames the browser already receives (ttyd's
  1-byte-prefixed protocol), which is deterministic and avoids canvas/OCR
  flakiness entirely. Canvas *mounting* is still awaited with a real
  `waitForSelector` (`waitForTerminalReady` in `helpers/session-manager.js`)
  before any interaction — this only replaces "how do we read what's on
  screen," not "how do we know the screen exists yet."
  Use **`waitForOutputLine(line)`** (not raw substring counting) whenever a
  test needs to prove a command actually *ran*, not just that it was typed —
  it matches `line` only as a complete line on its own, which is immune to a
  terminal redraw splitting the *echoed input* text mid-word (see
  `docs/ai/mistakes.md` 2026-07-29-009 for the flake this fixed).
- `specs/session-lifecycle.spec.js` — non-interactive Session Manager states:
  empty state, list populating, a closed session disappearing, multiple
  sessions, background polling.
- `specs/terminal-interaction.spec.js` — interactive terminal behaviour:
  `echo` stdout, a computed command's result, input surviving a viewport
  resize, Ctrl+C interrupting a running command.
- `specs/session-persistence.spec.js` — leaving and rejoining a session
  reattaches to the same tmux session with scrollback intact, and updates
  the list's last-joined timestamp.

## Test isolation

`server/session-manager.js` keeps all open sessions in a single in-memory
registry shared by every browser context that talks to it, so the suite
runs with `workers: 1` (see `playwright.config.js`) rather than in parallel
— two specs racing to create/close sessions against the same registry would
make each other's list-state assertions flaky. Each spec cleans up the
sessions it created in `afterEach`/`beforeEach`, and `global-teardown.js`
sweeps any stragglers before the server itself is stopped, so no ttyd/tmux
processes are left running after a test run.
