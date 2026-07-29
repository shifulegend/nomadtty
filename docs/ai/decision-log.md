# NomadTTY — Decision Log
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-07-29 -->

## Entry Template
```
### [YYYY-MM-DD] <decision title>
- **Context**: why a decision was needed
- **Decision**: what was chosen
- **Alternatives considered**: what else was evaluated
- **Rationale**: why this was chosen
- **Consequences**: what this means going forward
- **Owner**: who made or approved the decision
```

---

### [2026-07-29] MCP tools operate on tmux directly; session creation eagerly creates the tmux session
- **Context**: The Session Manager's `spawnSession()` only started ttyd; ttyd itself lazily execs its wrapped
  `tmux new-session -A -s <id>` command on the *first* WebSocket connection. MCP tools (get_screenshot,
  type_command, etc.) need to act on a session the moment an agent creates it via `/api/sessions`, with no
  browser ever involved — but the tmux session (and therefore anything to operate on) didn't exist yet.
- **Decision**: `spawnSession()` now runs `tmux new-session -d -s <id>` itself, synchronously, before
  spawning ttyd. ttyd's own `-A` flag then just attaches to that already-running session instead of
  creating a second one, so browser-driven behavior is unchanged.
- **Alternatives considered**: Having the MCP server open a throwaway WebSocket to ttyd itself just to force
  the lazy spawn — rejected as fragile and roundabout compared to creating the tmux session directly.
- **Rationale**: MCP tools are meant to let an agent drive a terminal with no human ever opening a browser
  tab. That requires the tmux session to exist immediately on creation, not on first "Join."
- **Consequences**: `spawnSession()` can now throw synchronously (tmux missing/broken) — the `/api/sessions`
  POST handler wraps it in try/catch and returns 500 rather than crashing the process.
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] MCP server is a second HTTP listener, not a route on the Session Manager's server
- **Context**: Needed to expose terminal-control tools over MCP's Streamable HTTP transport, reachable by
  LAN agents. The Session Manager's existing HTTP server binds to 127.0.0.1 only and has no authentication.
- **Decision**: `server/mcp/index.js` runs its own `http.Server` on a separate port (`MCP_PORT`, default
  4200), bound to `MCP_HOST` (default `0.0.0.0`), inside the same Node process as the Session Manager. Both
  share the same in-memory `sessions` Map directly (no network hop) — see `server/main.js`.
- **Alternatives considered**: Adding `/mcp` as a route on the existing Session Manager server and widening
  its bind address to `0.0.0.0` — rejected because that would have silently exposed the unauthenticated
  Session Manager UI/API (create/list/close sessions, full terminal proxy) to the LAN as a side effect of
  making only the MCP endpoint LAN-reachable.
- **Rationale**: Keeping the two listeners separate lets the MCP server (which enforces a bearer token, see
  below) be LAN-facing without changing the Session Manager's existing security posture at all.
- **Consequences**: Two ports to configure/document instead of one. `server/main.js` is the new composition
  root that starts both; `server/session-manager.js` still runs standalone unchanged (required by
  `tests/playwright.config.js`).
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] MCP auth is a mandatory bearer token, not command-content filtering
- **Context**: `type_command`/`send_keystroke` grant the same power as typing at the terminal directly —
  the tool's entire purpose is running arbitrary commands, so content-level sandboxing would defeat the
  tool. Something still has to gate who can call these tools at all, especially once LAN-reachable.
- **Decision**: `server/mcp/auth.js` requires `Authorization: Bearer <MCP_AUTH_TOKEN>` on every `/mcp`
  request (constant-time compare). The server refuses to boot bound to a non-loopback host without
  `MCP_AUTH_TOKEN` set, unless `MCP_ALLOW_INSECURE=1` is explicitly passed. `validation.js` additionally
  applies a best-effort denylist of obviously destructive one-liners (`rm -rf /`, fork bombs, etc.) to
  `type_command` as defense-in-depth — documented as non-bypass-proof, not a sandbox.
- **Alternatives considered**: Filtering/allowlisting command content as the primary defense — rejected as
  both incomplete (trivially bypassable) and self-defeating (a terminal tool that can't run most commands
  isn't useful).
- **Rationale**: The real security boundary for a tool whose job is "run what the agent says" is "who is
  allowed to connect," not "what did they say." This mirrors ttyd/tmux's own trust model (anyone who can
  reach the browser UI already has a full shell) extended to MCP callers.
- **Consequences**: Operators MUST set `MCP_AUTH_TOKEN` to a long random value before exposing `MCP_HOST` to
  the LAN. `MCP_ALLOW_INSECURE=1` exists for local dev convenience and must never be used in production.
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] get_screenshot returns a textual/ANSI snapshot, not a pixel image
- **Context**: The MCP tool spec asked for a `get_screenshot` tool "capturing the current visual state" of
  a terminal.
- **Decision**: `get_screenshot` returns `tmux capture-pane`'s text (optionally with `-e` for ANSI escape
  codes) for the pane's current viewport, not a rendered pixel image.
- **Alternatives considered**: Rendering a real PNG via a headless browser pointed at the ttyd page —
  rejected: it would require adding a permanent Chromium dependency to the production backend (this project
  already avoids that outside the Playwright dev/test suite), pay a browser-launch cost per call, and still
  ultimately just re-render text ttyd already emits as ANSI.
- **Rationale**: NomadTTY's terminals are text-mode (ttyd/tmux); there is no server-side pixel renderer in
  this architecture. A textual/ANSI snapshot is the accurate, honest representation of "current visual
  state" for a text terminal, and is what every other tool in this set already consumes/produces.
- **Consequences**: If true pixel screenshots are wanted later, it's a separate, explicit feature addition
  (headless browser dependency) — not a variant of this tool.
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] First production npm dependency: @modelcontextprotocol/sdk + zod
- **Context**: Needed a spec-correct MCP "Streamable HTTP" transport (JSON-RPC framing, session lifecycle,
  SSE upgrade, resumability semantics). The backend had been zero-runtime-dependency by design/convention
  (see the 2026-06-20 "No bundler / no build step" entry), though that constraint was specifically about
  `src/kb.js` being injected into a browser page with no bundler available — it does not technically apply
  to a standalone Node backend service.
- **Decision**: Added a root `package.json` with `@modelcontextprotocol/sdk` and `zod` as runtime
  dependencies. Hand-rolling JSON-RPC/SSE session framing instead was considered and rejected.
- **Alternatives considered**: Hand-writing the MCP protocol (JSON-RPC + SSE + session headers) directly on
  the existing zero-dependency `http.createServer` pattern.
- **Rationale**: The official SDK is maintained specifically for this protocol and already correctly
  handles session IDs, resumable SSE streams, and JSON-RPC edge cases; reimplementing it by hand for a
  first-party feature carries much higher bug risk than the (well-justified) dependency.
- **Consequences**: `npm install` at the repo root is now required before running `server/main.js`. The
  root `.gitignore` no longer blanket-ignores `package.json`/`package-lock.json` (it did, as a leftover from
  the zero-dependency era) — both are now tracked, same as `tests/package.json` already was.
- **Owner**: claude (session implementing the MCP server)

### [2026-06-25] Add Mermaid architecture diagram to README
- **Context**: README had an ASCII art architecture diagram. Mermaid is rendered natively
  by GitHub, giving a visually richer diagram with no external tooling.
- **Decision**: Replace ASCII diagram with a Mermaid `graph LR` block. Keep the ASCII
  version in `docs/ai/project-overview.md` as a plain-text fallback.
- **Alternatives considered**: Keep ASCII (universally readable in any tool); Mermaid only.
- **Rationale**: GitHub renders Mermaid inline. The diagram is the most effective way to
  communicate the sub_filter injection chain and WebSocket hook to new contributors.
- **Consequences**: The diagram must be updated in README.md whenever the architecture
  changes (e.g. new proxy, new port). ASCII copy in project-overview.md is the fallback.
- **Owner**: ankit

### [2026-06-25] Add Dependabot for Docker and GitHub Actions
- **Context**: No automated dependency scanning existed. Docker base image and GitHub
  Actions versions could silently drift.
- **Decision**: Add `.github/dependabot.yml` scanning `docker` and `github-actions`
  ecosystems on a weekly schedule.
- **Alternatives considered**: Manual audits; Renovate Bot.
- **Rationale**: Dependabot is zero-config, built into GitHub, and generates PRs
  automatically. Weekly cadence avoids noise while catching security patches promptly.
- **Consequences**: Expect periodic automated PRs for `ubuntu:24.04` base and actions
  pins. Review them; do not auto-merge without checking.
- **Owner**: ankit

### [2026-06-20] Run ttyd as deploy user (ubuntu), not root
- **Context**: ttyd systemd service was set to `User=root`. This caused `claude` (and
  any other user-local CLI tool) to be unavailable in the web terminal because root's
  `$PATH` does not include `/home/ubuntu/.local/bin/`, and credentials live in
  `/home/ubuntu/.claude/` which root cannot access.
- **Decision**: `User=ubuntu` in `systemd/ttyd.service`.
- **Alternatives considered**: Symlinking claude to `/usr/local/bin/` — rejected because
  it still fails on credential lookup (`~/.claude/` resolves to `/root/.claude/`).
- **Rationale**: PTY creation does not require root on Linux. Normal users can open
  `/dev/ptmx`. Running as the deploy user gives the terminal the correct `$PATH` and
  home directory.
- **Consequences**: Deploy instructions must ensure the service `User` matches the user
  who has `claude` (and other tools) installed.
- **Owner**: ankit

### [2026-06-20] Toolbar positioned at top of page, not bottom
- **Context**: Initial toolbar was at the bottom; user feedback requested top placement.
- **Decision**: Toolbar is `position: fixed; top: 0`. Terminal container is pushed down
  with `position: fixed; top: <toolbar_height>px`.
- **Alternatives considered**: Bottom toolbar (initial implementation).
- **Rationale**: Top placement matches Termius, iSH, and other established mobile
  terminal apps. Top placement also avoids conflict with iOS home indicator.
- **Consequences**: `updateLayout()` must be called after DOM settles and after any
  Fn row toggle to recompute the toolbar height and reposition the terminal.

### [2026-06-20] Sticky modifier keys instead of hardcoded Ctrl combos
- **Context**: Initial v1 toolbar had hardcoded Ctrl shortcut buttons (C-b, C-c, C-d,
  C-l, C-r, C-u, C-w, C-z, C-k, C-n, C-p). User requested best-practice approach.
- **Decision**: CTRL, SHFT, ALT are sticky toggles; a `keydown` listener intercepts
  the next physical keypress and sends the modified byte. No hardcoded Ctrl buttons.
- **Alternatives considered**: Keep hardcoded shortcuts; add both sticky + shortcuts.
- **Rationale**: Sticky modifiers match how Termius works. They support arbitrary
  combinations (Ctrl+any letter) vs. a fixed button list. Cleaner toolbar row.
- **Consequences**: Users must tap CTRL then type on the phone keyboard. This requires
  the on-screen keyboard to be open. Tested and confirmed working via CDP keydown events.

### [2026-06-20] Responsive layout via visualViewport + dvh + touch-action
- **Context**: Terminal layout broke on mobile when the on-screen keyboard appeared.
- **Decision**: Three-layer mobile layout strategy:
  1. `interactive-widget=resizes-content` in viewport meta (Android keyboard shrinks layout)
  2. `height: calc(100dvh - toolbar_height)` for modern browsers
  3. `visualViewport` resize listener fires `window.resize` → ttyd fitAddon recalculates
- **Alternatives considered**: Fixed pixel height; `100vh` (broken on iOS); CSS only.
- **Rationale**: Research confirmed this is the current best practice (2024–2026).
  `dvh` supported iOS Safari 16+, Android Chrome 108+. Fallback via visualViewport.
- **Consequences**: Layout adapts automatically. Test on real iOS/Android after any
  toolbar height change.

### [2026-06-20] window.WebSocket hook injected before ttyd's bundle via sub_filter
- **Context**: Needed a way for `kb.js` to send bytes to ttyd's PTY without modifying
  ttyd's source code.
- **Decision**: Override `window.WebSocket` with a wrapper before ttyd's JS bundle runs.
  Store the `/ws` connection in `window._S`. `kb.js` calls `window._S.send('0'+bytes)`.
- **Alternatives considered**: (a) Modify ttyd source and recompile; (b) Postmessage API;
  (c) Intercept fetch/XHR; (d) MutationObserver to find the socket after creation.
- **Rationale**: WS hook is the only approach that works without modifying ttyd and
  without timing races. The hook fires synchronously before any script in `<head>`.
  ttyd's bundle uses `new WebSocket(...)` — the hook captures it at construction time.
- **Consequences**: The inline hook script must stay small (< 300 B) to fit in sub_filter.
  If ttyd ever changes its WebSocket URL from `/ws`, the `indexOf("/ws")` check must be updated.

### [2026-06-20] No bundler / no build step for kb.js
- **Context**: Design choice for toolbar delivery mechanism.
- **Decision**: `src/kb.js` is a vanilla JS IIFE served directly with no transpilation.
- **Alternatives considered**: npm + esbuild bundle; TypeScript; ES modules.
- **Rationale**: Injected scripts cannot use `import`/`export`. Adding a build step
  introduces maintainability overhead inconsistent with the project's zero-dependency
  philosophy. 9 KB unminified is acceptable for a no-cache-controlled single file.
- **Consequences**: No type checking. All code must be self-documenting. No tree-shaking.

### [2026-06-20] ttyd listen port 47821 (non-standard)
- **Context**: Had to choose a port for ttyd's internal listener.
- **Decision**: Port 47821.
- **Rationale**: Avoid common ports (7681 is ttyd's default; 8080, 3000 are frequently
  used by other services). 47821 is arbitrary but distinctive.
- **Consequences**: All references to this port (nginx config, systemd service, install.sh,
  Dockerfile) must stay in sync. Configurable via `TTYD_PORT` env var.

### [2026-06-20] Docker base image: ubuntu:24.04 (not alpine or debian-slim)
- **Context**: Needed a base image for the Docker container.
- **Decision**: `ubuntu:24.04`.
- **Alternatives considered**: `alpine` (no ttyd apt package), `debian:bookworm-slim`.
- **Rationale**: ttyd is available in Ubuntu 24.04's apt repositories. Alpine would require
  compiling ttyd from source. debian-slim is viable but Ubuntu matches the primary
  deployment target (Debian/Ubuntu servers).
- **Consequences**: Image is larger than alpine-based alternatives (~250 MB compressed).
  TODO: evaluate multi-stage build or debian-slim once ttyd version is pinned.

### [2026-06-20] Project name: NomadTTY
- **Context**: Repository needed a unique, memorable, apt name.
- **Decision**: NomadTTY — nomad (access your server from anywhere, mobile) + TTY.
- **Alternatives considered**: ttydeck, taptty, surftty, palmtty.
- **Rationale**: "Nomad" captures the core use case (roaming remote terminal access).
  Memorable, professional, available on GitHub.
- **Consequences**: GitHub repo: `shifulegend/nomadtty`. Docker image tag: `nomadtty`.
