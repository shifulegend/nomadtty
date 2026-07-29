# NomadTTY — Claude Code Project Memory
<!-- lean entrypoint; detailed rules in .claude/rules/; canonical truth in docs/ai/ -->
<!-- last updated: 2026-07-29 -->

## Session start (mandatory — do this before anything else)
1. Read `docs/ai/session-start-checklist.md` and follow every step.
2. Read `docs/ai/mistakes.md` — never repeat a documented mistake.
3. Read `docs/ai/decision-log.md` — understand existing decisions before making new ones.

## What this project is
NomadTTY is a mobile-friendly web terminal, with two parallel deployment models (see
`docs/ai/project-overview.md`'s ASSUMPTION note — they are not yet unified):
1. **Legacy**: **ttyd** (C binary) wrapped by **nginx**, which injects a touch keyboard
   toolbar (`src/kb.js`) via `sub_filter`. Sessions persist via **tmux**. Zero JS
   dependencies; no build step. This is what `Dockerfile`/`install.sh` actually ship.
2. **Session Manager + MCP** (`server/**`): a Node backend running multiple named
   ttyd/tmux sessions behind a UI/API (`server/session-manager.js`), plus an MCP
   "Streamable HTTP" server (`server/mcp/**`) exposing those terminals to AI agents as
   7 tools. Run via `npm install && node server/main.js` (not yet wired into
   Dockerfile/install.sh/systemd).

## Hard invariants (never violate without a decision-log entry)
- `--writable` must be in every ttyd ExecStart/CMD. See mistakes.md [2026-06-20-001].
- ttyd listens on `127.0.0.1` only (port 47821 default).
- The sub_filter replacement string must stay < 500 B. See mistakes.md [2026-06-20-004].
- `window._S.send('0' + bytes)` is how kb.js sends PTY input. Do not bypass.
- Run `nginx -t` before every `systemctl reload nginx`.
- Never use `sed s///` to edit lines containing JS or URLs. See mistakes.md [2026-06-20-006].
- `server/session-manager.js` must keep working standalone (`node server/session-manager.js`)
  with unchanged behavior — `tests/playwright.config.js` depends on exactly that.
- The MCP server (`server/mcp/**`) must never boot bound to a non-loopback host without
  `MCP_AUTH_TOKEN` set (or an explicit `MCP_ALLOW_INSECURE=1`). See `server/mcp/auth.js`.
- Every `tmux`/`ps`/`ss` call in `server/mcp/tmux.js` uses `execFile`/`execFileSync` with
  an argv array — never `exec`/`shell: true`.
- tmux capture ranges anchoring on "the end of real content" use `#{cursor_y}`, never
  `#{pane_height}`. See mistakes.md [2026-07-29-008].
- Any function that both dispatches an event and is registered as that same event's own
  listener needs an explicit re-entrancy guard. See mistakes.md [2026-07-29-011].
- Session-manager-spawned ttyd processes render via DOM, not WebGL or canvas
  (`TTYD_RENDERER_TYPE`) — canvas breaks at real mobile devicePixelRatio, webgl breaks
  headless. See mistakes.md [2026-07-29-012], [2026-07-29-014] and decision-log.md.
- Before calling a screenshot/rendering task "done," actually look at the resulting image —
  a clean console does not guarantee correct pixels. See mistakes.md [2026-07-29-012].
- A capture-phase keydown listener that transforms/claims an event must call
  `stopPropagation()`, not just `preventDefault()`, or a bundled library's own listener
  (e.g. xterm.js's) can still independently act on the same untransformed event. See
  mistakes.md [2026-07-29-016].
- Any fixed-position overlay UI element sharing a screen region with a scrollable
  container (e.g. `#back-btn` over `#kb`'s toolbar row) must have its footprint reserved
  as padding/margin in that container, not just checked at one scroll position. See
  mistakes.md [2026-07-29-017].
- The terminal's touch-scroll gesture is intentionally disabled (`initTouchScroll` in
  `src/kb.js` only calls `preventDefault()`, never dispatches a wheel event) — tmux never
  feeds xterm.js's client-side scrollback, so every dispatch used to leak Up/Down-arrow
  key escapes into the PTY as real input. Do not re-enable wheel dispatch there without
  driving tmux's own copy-mode/history instead. See mistakes.md [2026-07-29-018].
- Any element that fires its action directly from `touchend` (not from the browser's own
  click synthesis) must measure gesture distance and suppress the action past a small
  drag threshold, or a scroll/swipe gesture will register as a tap. See mistakes.md
  [2026-07-29-019] (`src/kb.js`'s `#kb`-level touch-drag guard).

## Key files
| File | Role |
|------|------|
| `src/kb.js` | Mobile keyboard toolbar — the core feature (~260 lines IIFE vanilla JS) |
| `nginx/ttyd.conf` | nginx vhost: serves /kb.js, proxies ttyd, injects toolbar (legacy) |
| `systemd/ttyd.service` | ttyd service with tmux persistence (legacy) |
| `Dockerfile` | Multi-arch Ubuntu 24.04 image (legacy) |
| `install.sh` | One-command Debian/Ubuntu installer (legacy) |
| `server/session-manager.js` | Multi-session ttyd/tmux orchestration + UI/API + terminal proxy |
| `server/mcp/**` | MCP Streamable HTTP server: tools.js, tmux.js, validation.js, auth.js, index.js |
| `server/main.js` | Composition root: session-manager + MCP together |
| `public/*.{svg,png,webmanifest}`, `public/robots.txt` | Favicon/icons/manifest/robots — branding+SEO assets served by `server/session-manager.js` (see `docs/ai/decision-log.md`'s 2026-07-29 branding entry) |
| `scripts/generate-icons.mjs` | Regenerates the favicon/icon PNGs+SVG from shared glyph geometry (pure Node core, no deps) |
| `docs/ai/` | Canonical shared project memory (read before coding) |
| `.claude/rules/` | Detailed Claude-specific rule files |

## Rule files — read what's relevant
- `.claude/rules/core.md` — modularity, no-hardcoding, code organisation
- `.claude/rules/docs.md` — documentation discipline
- `.claude/rules/tests.md` — verification and testing
- `.claude/rules/config.md` — env vars, config files, configurability
- `.claude/rules/infra.md` — Dockerfile, nginx, systemd, install.sh rules

## Commit discipline
Every sub-step gets a commit. Follow `docs/ai/commit-log-guidance.md`.
Propose exact commit messages; commit after verification passes.

## Dynamic file rule
YOU must proactively update `docs/ai/**` and `.claude/rules/**` whenever:
- a new durable lesson is learned
- a new convention is adopted
- a mistake is corrected
- architecture or workflows change
Do not wait to be asked. Then synchronise Copilot and Antigravity adapter files per
`docs/ai/tool-sync-policy.md`.
