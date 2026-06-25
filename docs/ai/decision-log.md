# NomadTTY — Decision Log
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-06-20 -->

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
