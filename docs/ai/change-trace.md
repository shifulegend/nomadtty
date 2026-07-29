# NomadTTY — Change Trace
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-07-29 -->
<!-- add an entry for every notable change: what, why, affected areas, commit -->

## Entry Template
```
### [YYYY-MM-DD] <change title>
- **Timestamp**: YYYY-MM-DD HH:MM UTC
- **Change**: what changed
- **Rationale**: why
- **Affected areas**: files / modules / config
- **Related commit**: <hash or message>
- **Related decisions**: links to decision-log entries
- **Related mistakes**: links to mistakes entries (if applicable)
```

---

### [2026-07-29] Copyright footer added to the Session Manager screen
- **Timestamp**: 2026-07-29 12:05 UTC
- **Change**: Added `#sm-footer` (`&copy; 2026 shifulegend — NomadTTY`) to the bottom of
  `public/session-manager.html`'s `#sm-root`, reusing the exact copyright holder already
  established in `LICENSE`/`NOTICE` rather than inventing new attribution text.
- **Rationale**: User asked whether a copyright notice can be shown without registering
  it anywhere -- yes: copyright protection and the right to display a notice both arise
  automatically upon creation of an original work (Berne Convention); registration is
  optional and only needed for certain enhanced remedies (e.g. US statutory damages),
  never for the notice itself.
- **Affected areas**: `public/session-manager.html`, `docs/assets/screenshot-session-manager-mobile.png`
  (regenerated to reflect the new footer)
- **Verification**: Live server boot + curl confirmed the footer markup renders; a
  Playwright screenshot at the Pixel 7 mobile viewport confirmed zero horizontal
  overflow and correct centered placement below `#empty-state`, not overlapping any
  other element. Temporary verification spec deleted afterward; not committed.
- **Related decisions**: none new -- reuses the existing `LICENSE`/`NOTICE` copyright holder.

### [2026-07-29] Footer pinned to true screen bottom; NomadTTY icon+wordmark banner added
- **Timestamp**: 2026-07-29 12:20 UTC
- **Change**: Follow-up to the copyright footer entry above. User reported the footer
  sat mid-screen (right after `#empty-state`, with a large gap of unstyled black space
  below it) rather than at the actual bottom of the viewport. Fixed by making `#sm-root`
  a `display:flex;flex-direction:column` container with `min-height:100dvh` (with a
  `100vh` fallback declared first for older browsers) and giving `#sm-footer`
  `margin-top:auto` so it's pushed to the true bottom of the screen when content is
  short, while still flowing naturally right after the last session row when the list
  is long enough to fill/exceed the viewport (verified with 8 sessions -- footer
  appears after the last row, does not overlap or get clipped). `padding-bottom` on
  `#sm-root` now also accounts for `env(safe-area-inset-bottom)`, matching the existing
  `safe-area-inset-top` handling already used for the top padding. Also added a small
  `#sm-brand` row (`/favicon.svg` at 20x20 + "NomadTTY" in the app's blue accent,
  13px monospace, no bold/letter-spacing) above the `<h1>Session Manager</h1>` heading,
  answering the user's question about why no NomadTTY banner existed on the page --
  previously the app name appeared only in `<title>`/OG tags, never visibly on-page.
- **Rationale**: A sticky-footer pattern is the standard fix for "footer floats in the
  middle when content is short." The banner request was evaluated against `DESIGN.md`:
  its "avoid full-width banners" rule is scoped explicitly to the terminal grid/canvas,
  not the separate full-screen Session Manager modal state, so a small brand row here
  does not violate that constraint; kept to DESIGN.md's typographic rules (monospace,
  single blue accent, no bold/letter-spacing tricks, small utilitarian sizing).
- **Affected areas**: `public/session-manager.html`,
  `docs/assets/screenshot-session-manager-mobile.png` (regenerated again)
- **Verification**: Live server boot; Playwright screenshots at the Pixel 7 mobile
  viewport for both the empty-list state (footer flush with viewport bottom, ~20px
  gap matching the safe-area padding) and an 8-session list (footer flows after the
  last row, no overlap, zero horizontal overflow in both cases). Full Playwright suite
  re-run twice: one run showed a single isolated failure
  (`android-mobile-ux.spec.js`'s Back-button-overlap test) that passed cleanly on
  immediate re-run alone and again on a full second full-suite run (55/55 both times)
  -- consistent with the documented PTY-redraw-timing flake class in
  `tests/README.md`, not a regression from this change (which touches only
  `public/session-manager.html`, never the terminal/Back-button code path). **Follow-up
  re-verification** (user correctly pointed out the 8-session case never actually
  exceeded the viewport, so it hadn't really exercised the overlap scenario -- see
  `docs/ai/mistakes.md` [2026-07-29-020]): re-ran with 13 sessions, confirmed real
  overflow via `document.body.scrollHeight` (1085px) vs. the 839px viewport (`body`,
  not `documentElement`, is the actual `overflow-y:auto` scroll container here),
  scrolled `document.body.scrollTop` to the true bottom, and confirmed an 8px gap
  between the last visible session row and the footer with zero overlap. Temporary
  verification specs deleted afterward; not committed.
- **Related decisions**: none new.

### [2026-07-29] README's Session Manager screenshot restored to realistic session data
- **Timestamp**: 2026-07-29 12:55 UTC
- **Change**: While re-verifying the footer/overlap fix above, noticed
  `docs/assets/screenshot-session-manager-mobile.png` had been regenerated as an
  **empty-list** screenshot during the copyright-footer and banner work, silently
  regressing it from the original image (3 realistic sessions: `desktop-dpr1`,
  `claude — dotfiles repo`, `build watcher`) despite the README's own alt text still
  reading "showing two running sessions". Recreated the same three session labels and
  retook the screenshot, so it now shows the new banner/footer *and* matches its own
  alt text with realistic-looking content again.
- **Rationale**: A doc image should demonstrate the feature with realistic data, not
  the empty state, and must not silently drift out of sync with its own caption.
- **Affected areas**: `docs/assets/screenshot-session-manager-mobile.png`
- **Verification**: Playwright screenshot at the Pixel 7 viewport confirmed zero
  horizontal overflow with the three sessions present, banner visible at top, footer
  pinned at bottom. Sessions and temporary spec deleted afterward; not committed.
- **Related mistakes**: this was itself an undocumented regression introduced
  incidentally by the two commits above -- not significant enough on its own to
  warrant a dedicated `mistakes.md` entry, but recorded here per change-trace discipline.

### [2026-07-29] Comprehensive branding, SEO metadata, and favicon/manifest assets added
- **Timestamp**: 2026-07-29 11:39 UTC
- **Change**: Added page titles/meta description/theme-color/robots/Open Graph/Twitter
  Card tags and favicon/apple-touch-icon/manifest links to `public/session-manager.html`
  (static) and to `server/session-manager.js`'s `injectToolbar()` (now per-session
  dynamic, driven by `entry.label` and a server-computed `pageUrl`, with ttyd's own
  default `<title>`/favicon `<link>` stripped first via regex to avoid duplicates).
  Added `scripts/generate-icons.mjs` (pure Node core, no new dependency) generating
  `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icon-192.png`,
  `public/icon-512.png` -- a ">_" terminal-prompt glyph on the app's `#0052cc` accent
  blue. Added `public/manifest.webmanifest` and `public/robots.txt`
  (`noindex, nofollow` + `Disallow: /`, deliberate for a private auth'd tool). Extended
  `server/session-manager.js`'s `MIME` map and added a `BRANDING_ASSETS` static route
  list so these new files are served with correct `Content-Type`. Added an
  `escapeHtml()` helper so the user-supplied session `label` is safely interpolated
  into injected HTML (title, og:title).
- **Rationale**: Explicit task requirement for a holistic branding/SEO update across
  all routes, mobile-first, without disturbing the existing terminal DOM/layout.
- **Affected areas**: `public/session-manager.html`, `server/session-manager.js`,
  `scripts/generate-icons.mjs` (new), `public/favicon.svg` (new),
  `public/apple-touch-icon.png` (new), `public/icon-192.png` (new),
  `public/icon-512.png` (new), `public/manifest.webmanifest` (new),
  `public/robots.txt` (new)
- **Verification**: `node -c server/session-manager.js` syntax check; live server
  boot; curl checks of all 6 new static routes (200 + correct Content-Type); a live
  test session's `/term/<id>/` HTML inspected to confirm the injected title/meta/OG
  tags, escaped label, dynamic `og:url`, and removal of ttyd's own default
  title/favicon, then the test session deleted. Full Playwright suite
  (`cd tests && npx playwright test`) re-run: 55/55 passing, no regressions. Ad hoc
  Playwright screenshots taken at Pixel-7 (mobile) and 1440x900 (desktop) viewports
  of both `public/session-manager.html` and a live `/term/<id>/` page; each measured
  `document.documentElement.scrollWidth - clientWidth === 0` (zero horizontal
  overflow) and was visually inspected -- toolbar, Back button, and terminal
  alignment all unaffected by the new head-only tags. Temporary verification spec
  files and test-results were deleted afterward; not committed.
- **Related commit**: "feat: implement comprehensive branding, SEO metadata, and responsive layout updates"
- **Related decisions**: [2026-07-29] Branding/SEO overhaul targets the Session Manager
  model, not the legacy nginx sub_filter model

### [2026-07-29] Adapter sync for branding/SEO change
- **Timestamp**: 2026-07-29 11:45 UTC
- **Change**: Added the two new files (`scripts/generate-icons.mjs`,
  `public/*.{svg,png,webmanifest}` + `robots.txt`) to `CLAUDE.md`'s and
  `gemini/GEMINI.md`'s "Key files" tables. Added a "Branding & SEO metadata" bullet
  to `README.md`'s Session Manager features section.
- **Rationale**: Per `docs/ai/tool-sync-policy.md`, adapter files must not drift from
  canonical docs/new durable files. `.github/copilot-instructions.md` and `AGENTS.md`
  were left as-is: neither has a file-level table, and both already predate the
  Session Manager model entirely (a pre-existing gap, not introduced by this change) —
  reconciling that is a larger, separate effort out of scope here.
- **Affected areas**: `CLAUDE.md`, `gemini/GEMINI.md`, `README.md`
- **Related commit**: "feat: implement comprehensive branding, SEO metadata, and responsive layout updates"

### [2026-07-29] Added the dedicated on-screen-keyboard-toggle-during-generation test block requested but not fully covered by the prior stress-testing pass
- **Timestamp**: 2026-07-29 07:45 UTC
- **Change**: Added 6 new tests to `tests/specs/android-mobile-stress.spec.js`, each pairing an on-screen
  keyboard open/close reflow with a distinct concurrent condition during an active stream: (1) rapid
  repeated open/close cycles, (2) typing landing correctly mid-transition as the keyboard opens, (3)
  keyboard + Fn row open simultaneously, (4) keyboard + zoom simultaneously, (5) keyboard open + an
  aggressive scroll gesture, (6) tapping Back while the keyboard is open then re-Joining. Test 6 initially
  asserted `window.innerHeight` reset to full size after navigating away, which failed — Playwright's
  `setViewportSize` is sticky across navigation (unlike a real device's `visualViewport`, which reverts when
  the keyboard actually closes) — fixed by asserting the Session Manager renders usably at the still-reduced
  height instead, then explicitly restoring full height before re-Joining, matching what a real device does
  when the app backgrounds/navigates.
- **Rationale**: The prior stress-testing pass (previous change-trace entry) only exercised the on-screen
  keyboard in a single test combined with device rotation, and covered "exhaustive keyboard toggle" only
  *without* an active stream (in `android-mobile-ux.spec.js`). The original task explicitly asked for
  "at least 5 to 6 additional complex test scenarios involving the on-screen keyboard toggle during active
  model generation" as its own requirement — a gap flagged directly by the user after reviewing the first
  pass's summary, not caught during that pass itself.
- **Affected areas**: `tests/specs/android-mobile-stress.spec.js`, `.claude/rules/tests.md`,
  `tests/README.md`, `README.md`
- **Related commit**: (pending — follow-up to "test: implement rigorous android simulator testing and
  capture mobile screenshots")
- **Related decisions**: none new
- **Related mistakes**: none new (no additional bugs found by these 6 tests; they confirm the existing
  `updateLayout()` reflow mechanism and the already-fixed touch-scroll/toolbar-drag bugs hold up under
  keyboard-toggle-specific compound stress)

### [2026-07-29] Concurrent-interaction stress testing found and fixed a real screen-distortion bug and a real accidental-button-press bug
- **Timestamp**: 2026-07-29 07:20 UTC
- **Change**:
  - `src/kb.js`: disabled the terminal's touch-scroll wheel dispatch entirely (`initTouchScroll` now only
    calls `preventDefault()` on touchmove for iOS bounce suppression) — it always leaked Up/Down-arrow key
    escape sequences into the PTY as real input, since tmux never populates xterm.js's own client-side
    scrollback (every session runs inside tmux, a hard invariant). Added a capture-phase touch-drag guard
    on `#kb` so toolbar buttons no longer fire when a touch drags 150px+ across them (only a genuine,
    near-stationary tap registers) — a swipe used to scroll the toolbar row could otherwise trigger
    whatever button the finger started or passed over.
  - Added `scripts/simulate-model-stream.mjs` — a deterministic word-by-word streaming-text generator used
    by the new stress suite in place of a real downloaded local model (see decision-log.md).
  - Added `tests/helpers/stress.js` (`startStream`, `touchScrollTerminal`, `toggleOnScreenKeyboard`,
    `rotateDevice`, `collectPageErrors`) and `tests/specs/android-mobile-stress.spec.js` (8 tests):
    scrolling/typing during an active stream, device rotation with the on-screen keyboard simulated open,
    rapid Fn-row/zoom toggling during a stream, CTRL+C interrupting a stream via the toolbar, and tapping
    Back mid-stream then re-Joining. Added 2 more tests to `tests/specs/android-mobile-ux.spec.js`: a
    touch-drag-vs-tap regression test, and an exhaustive on-screen-keyboard-toggle reflow test.
  - `tests/helpers/ws-capture.js`: `waitForOutputLine()` now strips ANSI/VT escape sequences (and converts
    tmux's `ESC[<N>S` Scroll-Up sequences into real newlines first) before matching, since tmux can express
    a line landing at the bottom of the pane purely via cursor repositioning/scrolling with no literal
    `\r\n` byte anywhere in the stream — the old strict-newline check produced false-timeout failures on
    otherwise-correct output under this suite's heavier bottom-of-pane scroll load.
  - Captured new documentation screenshots (`docs/assets/screenshot-android-stress-*.png`) via
    `scripts/capture-android-stress-screenshots.mjs`, including a before/after pair showing the touch-scroll
    distortion and its fix.
- **Rationale**: Asked to rigorously stress-test mobile rendering under realistic concurrent-interaction
  conditions (typing/scrolling/rotating/toggling the keyboard while an AI-CLI-style stream is active) and to
  specifically verify no screen text distortion occurs and no accidental button presses occur from
  drag/scroll gestures. Both explicit asks turned up real, previously-undiscovered, always-reproducible bugs
  (not edge cases) — see mistakes.md 2026-07-29-018 and 2026-07-29-019 for full root-cause detail.
- **Affected areas**: `src/kb.js`, `scripts/simulate-model-stream.mjs` (new), `scripts/capture-android-stress-screenshots.mjs`
  (new), `tests/helpers/stress.js` (new), `tests/specs/android-mobile-stress.spec.js` (new),
  `tests/specs/android-mobile-ux.spec.js`, `tests/helpers/ws-capture.js`, `tests/README.md`,
  `.claude/rules/tests.md`, `CLAUDE.md`, `docs/ai/mistakes.md`, `docs/ai/decision-log.md`
- **Related commit**: "test: implement rigorous android simulator testing and capture mobile screenshots"
- **Related decisions**: 2026-07-29 "Touch-scroll-into-history is disabled...", 2026-07-29 "Mobile stress
  tests use a deterministic word-stream script instead of a downloaded local LLM"
- **Related mistakes**: 2026-07-29-018, 2026-07-29-019

### [2026-07-29] Rigorous mobile UX validation via Playwright device emulation; two real mobile bugs found and fixed
- **Timestamp**: 2026-07-29 06:40 UTC
- **Change**:
  - `server/session-manager.js`: default `TTYD_RENDERER_TYPE` changed from `canvas` to `dom` — the canvas
    renderer was found to draw glyphs at the wrong size specifically at real mobile `devicePixelRatio`
    values (e.g. Pixel 7's 2.625), a regression from the earlier webgl→canvas fix that had only been
    verified at desktop DPR=1.
  - `tests/helpers/session-manager.js`: `waitForTerminalReady()`'s selector changed from
    `.xterm-screen canvas` to `.xterm-screen` (renderer-agnostic — the `dom` renderer creates no
    `<canvas>` element). Stale "renders via WebGL/canvas" comments updated in `tests/README.md`,
    `tests/specs/terminal-interaction.spec.js`, `tests/helpers/ws-capture.js`.
  - `src/kb.js`: added `ev.stopPropagation()` to the CTRL/SHFT/ALT modifier-key intercept, fixing a
    double-send bug (the intercepted control byte AND the raw unmodified key both reached the PTY).
    Added `padding-right:48px` to `.kr` (the scrollable toolbar row) so scrolling it fully right no
    longer places the "A+" button directly under the fixed `#back-btn` circle, which fully covered and
    blocked it.
  - Added `tests/specs/android-mobile-ux.spec.js` — 4 new tests using Playwright's `devices['Pixel 7']`
    emulation: mobile Session Manager layout, Join→terminal-ready with a Back-button/terminal-canvas
    overlap geometry assertion, full Join→type→tap-Back→re-Join scrollback-preservation navigation, and
    the mobile-specific toolbar interactions (CTRL-toggle + key, Fn row, zoom) — the latter two tests are
    what caught the kb.js bugs above.
  - Documented all of the above in `docs/ai/mistakes.md` (2026-07-29-014 through -017) and
    `docs/ai/decision-log.md` (dom-renderer decision, Playwright-emulation-over-AVD decision).
- **Rationale**: Asked to rigorously validate mobile rendering/UX using device simulation. An Android AVD
  was ruled out (no `/dev/kvm`, no hardware virtualization in this environment — see decision-log) in
  favor of Playwright's device emulation, which still exercises the real variables that matter (viewport,
  DPR, touch) without the crash-prone software-emulation fallback the task's constraint explicitly warned
  against. Writing tests for the *specific* mobile interaction patterns (tap-to-toggle-then-type, swipe a
  scrollable toolbar to its end) — rather than just taking a screenshot and eyeballing it — is what
  surfaced both new kb.js bugs; neither is reachable through the existing desktop-DPR=1 suite's assertions.
- **Affected areas**: `server/session-manager.js`, `src/kb.js`, `tests/helpers/session-manager.js`,
  `tests/helpers/ws-capture.js`, `tests/specs/terminal-interaction.spec.js`, `tests/README.md`,
  `tests/specs/android-mobile-ux.spec.js` (new), `.claude/rules/tests.md`, `docs/ai/mistakes.md`,
  `docs/ai/decision-log.md`
- **Related commit**: "test: implement rigorous android simulator testing and capture mobile screenshots"
- **Related decisions**: 2026-07-29 "Session Manager's ttyd processes default to the dom renderer",
  2026-07-29 "Mobile UX validation uses Playwright device emulation, not a full Android emulator (AVD)"
- **Related mistakes**: 2026-07-29-014, 2026-07-29-015, 2026-07-29-016, 2026-07-29-017

### [2026-07-29] Automated test coverage for all 7 MCP tools; strengthened the "last joined" assertion
- **Timestamp**: 2026-07-29 05:15 UTC
- **Change**:
  - Added `tests/specs/mcp-tools.spec.js` — 24 tests covering all 7 MCP tools over real HTTP (Playwright's
    `request` fixture, no browser): protocol basics (`tools/list` shape, auth accept/reject),
    `get_screenshot` (plain + ansi + unknown-id error), `read_terminal_contents` (`head`/`tail`/`full`/
    `follow` SSE streaming), `scroll_buffer` (up/down/clamped-at-top), `type_command` (`submit:false` +
    denylist), `send_keystroke` (named Ctrl+C interrupt, hex-mode submit, validation errors),
    `get_process_status`, and `list_active_ports`.
  - Added `tests/helpers/mcp-client.js` (JSON-RPC/SSE request helper, `pollUntil`, `outputHasOwnLine`) and
    `apiCreateSession()` in `tests/helpers/session-manager.js`.
  - Changed `tests/playwright.config.js`'s `webServer` to boot `server/main.js` (Session Manager + MCP)
    instead of `server/session-manager.js` alone, with test-only MCP port/host/token/follow-timeout env
    vars in `tests/helpers/env.js`.
  - Fixed a real gap in `tests/specs/session-persistence.spec.js`: the "last joined" test asserted only
    `not.toContainText('never joined')`, which would still pass even if the timestamp rendered as
    something broken (empty string, `NaN:NaN:NaN`, etc.) — now asserts the positive shape, a real
    `H:MM:SS` clock-time pattern.
  - Along the way, repeated (and fixed) the exact "matched the input echo, not real output" bug already
    documented for the browser suite (`docs/ai/mistakes.md` 2026-07-29-009), this time in the new
    HTTP-based tests — see 2026-07-29-013.
  - Re-verified: 35/35 passing across many repeated full-suite runs (one isolated, unreproduced flake in
    roughly a dozen runs — consistent with the known PTY-redraw flakiness class, not a new regression).
- **Rationale**: User asked to test all MCP tools and specifically questioned whether the "last joined"
  text was tested correctly — it wasn't, rigorously; both gaps are now closed.
- **Affected areas**: `tests/specs/mcp-tools.spec.js` (new), `tests/helpers/mcp-client.js` (new),
  `tests/helpers/session-manager.js`, `tests/helpers/env.js`, `tests/playwright.config.js`,
  `tests/specs/session-persistence.spec.js`
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-013 (references 2026-07-29-009)

### [2026-07-29] Session Manager & Back button screenshots; fixed a layout recursion + a rendering bug
- **Timestamp**: 2026-07-29 04:50 UTC
- **Change**:
  - Added `scripts/capture-session-manager-screenshots.mjs` and captured
    `docs/assets/screenshot-session-manager-mobile.png` (Session Manager list, iPhone 14 viewport) and
    `docs/assets/screenshot-back-button-mobile.png` (terminal view with the Back button, iPhone 14 viewport).
  - Fixed `updateLayout()` in `src/kb.js`: added a re-entrancy guard to stop it from infinitely recursing
    via its own dispatched `resize` event (mistakes.md 2026-07-29-011).
  - Fixed `spawnSession()` in `server/session-manager.js`: ttyd now defaults to `rendererType=canvas`
    instead of WebGL, which was compositing incorrectly under headless/software-GPU rendering
    (mistakes.md 2026-07-29-012; decision-log.md same date).
  - Added `playwright` as a root devDependency so `scripts/*.mjs` capture tools are runnable via
    `npm install` (previously undeclared — a pre-existing gap in `scripts/capture-demo*.mjs` too).
  - Re-verified the Playwright suite (11/11) and `scripts/verify-mcp-agent.mjs` after both fixes.
- **Rationale**: Actually taking and looking at the requested screenshots surfaced two real bugs that no
  prior automated verification (which asserts on the WebSocket byte stream, not rendered pixels) had ever
  caught.
- **Affected areas**: `scripts/capture-session-manager-screenshots.mjs` (new), `docs/assets/*.png` (new),
  `src/kb.js`, `server/session-manager.js`, `package.json`
- **Related commit**: pending
- **Related decisions**: `docs/ai/decision-log.md` 2026-07-29 "canvas renderer" entry
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-011, 2026-07-29-012

### [2026-07-29] Independent MCP verification agent; fixed a get_screenshot/scroll_buffer bug it found
- **Timestamp**: 2026-07-29 04:40 UTC
- **Change**:
  - Added `scripts/verify-mcp-agent.mjs` — a standalone Node script (raw `fetch` + hand-rolled JSON-RPC/SSE
    parsing, no `@modelcontextprotocol/sdk`, no test framework) that creates a real session, authenticates
    to the MCP server, and sequences `type_command` → `get_screenshot` to prove the Streamable HTTP
    transport works end-to-end from a genuinely independent client implementation.
  - Running it against a freshly created session surfaced a real bug: fixed `captureViewport` in
    `server/mcp/tmux.js` to anchor on `#{cursor_y}` instead of tmux row 0, mirroring the `captureTail` fix
    from earlier the same day (mistakes.md 2026-07-29-008) that had not been applied to this sibling
    function. Re-verified both the fresh-session case (previously broken) and the full-pane
    `scroll_buffer` case (previously passing) after the fix.
- **Rationale**: A from-scratch client, run against a real fresh session rather than an artificially
  pre-filled one, caught a bug that manual testing with a full pane had coincidentally masked.
- **Affected areas**: `scripts/verify-mcp-agent.mjs` (new), `server/mcp/tmux.js`
- **Related commit**: pending
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-010

### [2026-07-29] MCP server: expose terminal sessions to local AI agents
- **Timestamp**: 2026-07-29 04:00 UTC
- **Change**:
  - Added `server/mcp/**` — an MCP "Streamable HTTP" (JSON-RPC + SSE) server built on
    `@modelcontextprotocol/sdk`, registering 7 tools: `get_screenshot`, `scroll_buffer`,
    `type_command`, `send_keystroke`, `read_terminal_contents` (with a `follow` mode that
    streams live output via MCP progress notifications over SSE), `get_process_status`,
    `list_active_ports`.
  - Added `server/main.js` as a composition root running the Session Manager and MCP
    server together in one process, sharing the same in-memory `sessions` registry.
  - Refactored `server/session-manager.js` to be requirable as a module (exports
    `sessions`/`spawnSession`/`closeSession`/`listSessions`/`shutdownAllSessions`/`start`)
    while remaining fully backward-compatible standalone (`node server/session-manager.js`
    behaves identically, including for `tests/playwright.config.js`'s webServer).
  - Changed `spawnSession()` to create the tmux session eagerly (`tmux new-session -d`)
    instead of relying on ttyd's lazy spawn-on-first-connect, so MCP tools work on a
    session immediately, with no browser ever attached.
  - Added root `package.json`/`package-lock.json` (`@modelcontextprotocol/sdk`, `zod`) —
    the first production npm dependency in this repo. Updated root `.gitignore`
    accordingly (it previously blanket-ignored `package.json`/`package-lock.json`).
  - 11/11 existing Playwright tests re-verified passing after every change in this set.
- **Rationale**: Let local AI agents drive NomadTTY terminals (screenshot/scroll/type/
  keystroke/read/process-status/port-list) over a standard, LAN-reachable protocol.
- **Affected areas**: `server/mcp/**` (new), `server/main.js` (new), `server/session-manager.js`,
  `package.json`/`package-lock.json` (new), `.gitignore`
- **Related commit**: pending
- **Related decisions**: see `docs/ai/decision-log.md` 2026-07-29 entries (four total: eager
  tmux creation, MCP as a second listener, bearer-token auth model, screenshot-as-text,
  first npm dependency)
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-007 (tmux `-F` tab sanitization),
  2026-07-29-008 (tail capture must anchor on `cursor_y`, not `pane_height`)

### [2026-06-25] Real-device screenshots — iPhone 15 Pro Max (OCR-masked)
- **Timestamp**: 2026-06-25 14:00 UTC
- **Change**: Added 4 real-device screenshots to `docs/assets/`:
  - `real-device-01-toolbar-claude-help.png` — full terminal view, toolbar and Claude Code `/help`
  - `real-device-02-keyboard-open.png` — iOS software keyboard open, terminal above it
  - `real-device-03-keyboard-appearing.png` — keyboard slide-in frame, toolbar fixed at top
  - `real-device-04-claude-ai-output.png` — Claude Code AI response streamed in terminal
  - All sensitive fields (session UUID, server IP/hostname, private URL, git branch name) redacted
    using Tesseract 5 OCR-derived bounding boxes; zero-leakage verified with a second OCR pass.
  - README.md: added "Real device — iPhone 15 Pro Max" section with 2×2 screenshot grid.
- **Rationale**: Playwright device emulation shows viewport layout but not real iOS rendering.
  Real-device shots prove the keyboard resize, toolbar, and layout behaviour on actual hardware.
- **Affected areas**: `docs/assets/` (4 new PNGs), `README.md`
- **Related commit**: pending
- **Related decisions**: none new

### [2026-06-25] install.sh — hostname validation + health check + uninstall instructions
- **Timestamp**: 2026-06-25 12:10 UTC
- **Change**:
  - Added `NOMADTTY_HOST` regex validation (hostname chars only) before sed injection
    — resolves the TODO in `.claude/rules/config.md`.
  - Added post-install health check: `curl` hits `http://127.0.0.1/` and prints
    `HTTP 200 OK` or a warning with log pointers.
  - Added step-by-step echo progress (`==> Installing...`, `==> Configuring...`).
  - Added inline uninstall instructions in the success output.
  - README install section expanded: config options table, env var examples, uninstall
    commands, troubleshoot commands, what the installer does step-by-step.
- **Rationale**: Users reported confusion about what the installer does and how to
  reconfigure after initial install. "1-step for anyone" requires clear feedback.
- **Affected areas**: `install.sh`, `README.md`
- **Related commit**: pending
- **Related decisions**: none new

### [2026-06-25] Demo assets — Playwright screenshots and GIFs
- **Timestamp**: 2026-06-25 12:05 UTC
- **Change**: Added 6 visual assets to `docs/assets/`:
  - `demo-mobile.gif` (441 KB) — iPhone 14 viewport, shows CTRL + Fn row
  - `demo-desktop.gif` (4.9 MB, 960px) — desktop 11s walkthrough
  - `screenshot-desktop.png`, `screenshot-iphone14.png`, `screenshot-pixel7.png`
  - `screenshot-toolbar-fn.png` — CTRL (blue) + F1-F12 row expanded
  - Capture scripts in `scripts/capture-demo.mjs` and `capture-demo2.mjs`
  - README.md: added Demo section with GIF + side-by-side device table
- **Rationale**: README needed visual proof of the mobile-first UX for new visitors.
- **Affected areas**: `docs/assets/`, `scripts/`, `README.md`, `.gitignore`
- **Related commit**: 9dd0701

### [2026-06-25] Repository enhancement — Dependabot, CODEOWNERS, README overhaul, SECURITY
- **Timestamp**: 2026-06-25 00:00 UTC
- **Change**:
  - Added `.github/dependabot.yml` — weekly Docker and GitHub Actions CVE scanning.
  - Enhanced `.github/CODEOWNERS` — component-specific ownership routing for nginx,
    systemd, kb.js, Dockerfile, install.sh, SECURITY.md, and docs/ai/.
  - Overhauled `README.md` — Mermaid architecture diagram, VirtualKeyBar section with
    actual JS code snippet from kb.js, Security Posture table, reference-style links,
    expanded Tailscale section, all fenced blocks with language tags.
  - Enhanced `SECURITY.md` — added Dependabot section, expanded hardening table with
    priority ratings and rate-limiting recommendation.
  - Added `docs/ai/decision-log.md` entries for Mermaid diagram and Dependabot decisions.
- **Rationale**: Strategic promotion blueprint analysis identified gaps vs. leading
  terminal repositories: missing automated dependency scanning, weak CODEOWNERS routing,
  no visual architecture diagram, missing VirtualKeyBar documentation, and no security
  posture summary in README.
- **Affected areas**: `.github/dependabot.yml`, `.github/CODEOWNERS`, `README.md`,
  `SECURITY.md`, `docs/ai/decision-log.md`, `docs/ai/change-trace.md`
- **Related commit**: pending
- **Related decisions**: [2026-06-25] Mermaid diagram, [2026-06-25] Dependabot

### [2026-06-20] Fix mobile keyboard overlap — iOS Safari (v2, explicit height)
- **Timestamp**: 2026-06-20 07:05 UTC
- **Change**: Rewrote `updateLayout()` in `src/kb.js`:
  (1) Use `visualViewport.height` for explicit `height` instead of `bottom` — iOS Safari's
  `position:fixed + bottom:X` is unreliable when the keyboard is open.
  (2) Replace `cssText +=` with `cssText =` (full replace) to prevent duplicate property
  accumulation confusing Safari's style engine.
  (3) Add `window.scrollTo(0,0)` in `visualViewport` listener to reset iOS layout-viewport
  scroll that occurs when a textarea is focused even with `overflow:hidden` on body.
- **Rationale**: First fix (bottom calculation) was correct for Android but still broken
  on iOS Safari due to position:fixed/bottom behavior and cssText accumulation.
- **Affected areas**: `src/kb.js`
- **Related decisions**: [2026-06-20] Responsive layout via visualViewport + dvh + touch-action

### [2026-06-20] Fix mobile keyboard overlapping terminal cursor (iOS + all tablets)
- **Timestamp**: 2026-06-20 06:55 UTC
- **Change**: `updateLayout()` in `src/kb.js` now computes keyboard intrusion height via
  `visualViewport` and passes it as `bottom` on `#terminal-container` instead of
  hardcoding `bottom:0`. Added `visualViewport.scroll` listener alongside the existing
  `resize` listener to catch iOS visual-viewport vertical shifts.
- **Rationale**: On iOS/iPad Safari the layout viewport never shrinks when the on-screen
  keyboard opens; only `visualViewport.height` shrinks. Hardcoded `bottom:0` let the
  terminal extend behind the keyboard, hiding the cursor. Android with
  `interactive-widget=resizes-content` already shrinks `window.innerHeight`, so
  `keyboardH` evaluates to 0 there — no double-correction.
- **Affected areas**: `src/kb.js`
- **Related decisions**: [2026-06-20] Responsive layout via visualViewport + dvh + touch-action

### [2026-06-20] ttyd service changed from User=root to User=ubuntu
- **Timestamp**: 2026-06-20 06:33 UTC
- **Change**: `systemd/ttyd.service` `User=root` → `User=ubuntu`; applied to live
  `/etc/systemd/system/ttyd.service`; service restarted.
- **Rationale**: Root's `$PATH` lacks `/home/ubuntu/.local/bin/`, so `claude` was not
  found in NomadTTY sessions. Root also cannot access `/home/ubuntu/.claude/` credentials.
- **Affected areas**: `systemd/ttyd.service`, `.claude/rules/infra.md`,
  `docs/ai/decision-log.md`
- **Related commit**: pending
- **Related decisions**: [2026-06-20] Run ttyd as deploy user (ubuntu), not root

### [2026-06-20] Cross-tool AI development system added
- **Timestamp**: 2026-06-20 06:10 UTC
- **Change**: Added `docs/ai/**` shared canonical docs, `.claude/**` Claude Code adapter,
  `.github/**` Copilot adapter, `gemini/GEMINI.md` + `AGENTS.md` + `.agents/**`
  Antigravity adapter. See `docs/ai/tool-sync-policy.md` for sync rules.
- **Rationale**: Enable any of Claude Code, GitHub Copilot, or Google Antigravity to
  continue development with full project context and consistent engineering rules.
- **Affected areas**: entire repo (new files only; no source changes)
- **Related commit**: "chore: add cross-tool AI development system (docs/ai, CLAUDE.md, Copilot, Antigravity)"

### [2026-06-20] Responsive layout overhaul (visualViewport, dvh, touch-action)
- **Timestamp**: 2026-06-20 05:45 UTC
- **Change**: `src/kb.js` updated with visualViewport resize listener, dvh CSS,
  touch-action: pan-y, overscroll-behavior: none, position:fixed terminal container.
  Viewport meta added to both nginx sub_filter injections.
- **Rationale**: Terminal layout broke when mobile keyboard appeared. Research agent
  confirmed these are 2024–2026 best practices for mobile web terminal responsiveness.
- **Affected areas**: `src/kb.js`, `nginx/ttyd.conf`, `/etc/nginx/sites-available/tailscale-router`
- **Related commit**: "feat(kb.js): responsive layout — visualViewport, dvh, touch-action"
- **Related decisions**: 2026-06-20 Responsive layout decision

### [2026-06-20] Toolbar moved to top; hardcoded Ctrl combos removed; sticky modifiers
- **Timestamp**: 2026-06-20 05:30 UTC
- **Change**: Toolbar repositioned from bottom to top. Removed C-b, C-c, C-d, etc.
  buttons. CTRL/SHFT/ALT are now sticky toggles; keydown interceptor sends modified bytes.
- **Rationale**: User feedback. Top placement matches Termius. Sticky modifiers are the
  best-practice approach for mobile terminal modifier keys.
- **Affected areas**: `src/kb.js`
- **Related decisions**: 2026-06-20 toolbar position, 2026-06-20 sticky modifiers

### [2026-06-20] Initial release — NomadTTY v0.1.0
- **Timestamp**: 2026-06-20 05:00 UTC
- **Change**: Initial repository with `src/kb.js`, `nginx/ttyd.conf`,
  `systemd/ttyd.service`, `Dockerfile`, `docker-compose.yml`, `install.sh`,
  `LICENSE` (MIT), `NOTICE` (third-party attribution), `README.md`.
- **Rationale**: First public release of NomadTTY.
- **Affected areas**: entire repository
- **Related commit**: "Initial release: NomadTTY mobile-friendly web terminal"
