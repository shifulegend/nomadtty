# NomadTTY — Project Overview
<!-- canonical source of truth | update this file first, then sync tool adapters -->
<!-- last updated: 2026-07-30 -->

## Purpose
NomadTTY is a mobile-friendly web terminal that wraps **ttyd** with a purpose-built
touch keyboard toolbar. Users access a persistent shell on a remote Linux server
from any phone, tablet, or desktop browser — typically over a private Tailscale VPN.
It also exposes those same terminal sessions to local AI agents over the **Model
Context Protocol** (see "Session Manager + MCP server architecture" below).

## Current state (resolved 2026-07-30 — see decision-log's matching entry)
There is **one deployment model**, not two. `Dockerfile`, `docker-entrypoint.sh`, and
`install.sh` all install Node.js and run `server/main.js` (Session Manager + MCP) — the
same architecture that runs production `terminal.pz.net` via `systemd/nomadtty.service`.
Raw `ttyd` is never run standalone by any deployment path; it's spawned per-session by
`server/session-manager.js`. This was fixed urgently, not just tidied up: the previous
split (nginx pointed at the Session Manager since commit `55a5208`, while
Dockerfile/install.sh still ran raw ttyd on the old port) meant every `docker run`/
`install.sh` deployment served `502 Bad Gateway` on every request — see
`docs/ai/mistakes.md` 2026-07-30-001 for the full incident.

## Stack and Key Dependencies

| Component | Role | Version / source |
|-----------|------|-----------------|
| **ttyd** | Web terminal emulator (C binary), spawned per-session | Docker: apk `ttyd` 1.7.7-r0; install.sh: apt `ttyd` (MIT) |
| **xterm.js** | Terminal front-end (bundled inside ttyd) | bundled (MIT) |
| **tmux** | PTY multiplexer — persistent sessions, one per `terminal_id` | Docker: apk `tmux` 3.4-r1; install.sh: apt `tmux` (ISC) |
| **nginx** | Reverse proxy to the Session Manager (`127.0.0.1:4000`); no HTML rewriting | Docker: apk `nginx` 1.26.3-r0; install.sh: apt `nginx` (BSD-2) |
| **bash** | Shell spawned by ttyd inside tmux | system |
| **vanilla JS** | Toolbar (`src/kb.js`) — zero runtime dependencies | none |
| **Node.js** | Session Manager + MCP server backend | Docker: apk `nodejs` 20.15.1-r0; install.sh: apt `nodejs`/`npm`, `>=18` |
| **@modelcontextprotocol/sdk** | MCP "Streamable HTTP" transport + protocol | npm (MIT) |
| **zod** | Input schema validation for MCP tools | npm (MIT) |
| **certbot** (optional) | Let's Encrypt TLS via `install.sh`'s `NOMADTTY_TLS=certbot` (bare-metal only) | apt: `certbot`, `python3-certbot-nginx` |
| **Docker** | Packaging (`alpine:3.20` base — switched from `ubuntu:26.04` 2026-07-30, ~4x smaller image, see decision-log) | multi-arch: amd64/arm64 |
| **systemd** | Service management (non-Docker installs) | system |

`src/kb.js` remains raw JavaScript with zero runtime dependencies — no bundler,
no transpiler, no npm — since it's injected into each session's page with no build
step available. The Node backend (`server/**`) is a separate context and does
use npm dependencies (see the `@modelcontextprotocol/sdk` entry above and
`docs/ai/decision-log.md`'s "First production npm dependency" entry for why).

## Architecture

```
Client (phone/tablet/desktop)              AI agent (MCP client)
        │  HTTP :80                                │  MCP Streamable HTTP :4200
        ▼                                           │  + Bearer token (MCP_AUTH_TOKEN)
   nginx :80  ── auth_basic? / rate-limited ──►      ▼
   (reverse-proxies everything)              MCP server (server/mcp/**)
        │                                           │
        ▼                                           │ capture-pane / send-keys
   Session Manager (server/session-manager.js)       │ (no browser needed)
   :4000, 127.0.0.1 only                             │
   ├─ GET  /                  → Session Manager UI    │
   ├─ GET/POST/DELETE         → registry CRUD          │
   │  /api/sessions[/:id]                              │
   ├─ GET  /kb.js             → mobile toolbar          │
   └─ *    /term/<id>/*       → reverse proxy ─┐         │
                                                ▼         ▼
                                    ttyd (per session, 127.0.0.1, dynamic port)
                                                │
                                                ▼
                                    tmux (named per session, created eagerly)
                                                │
                                                ▼
                                          persistent bash session
```

nginx no longer does `sub_filter` HTML rewriting — the Session Manager's own
`injectToolbar()` (`server/session-manager.js`) injects the same three things directly
into each session's HTML head server-side:
1. `<meta name="viewport" ...>` — mobile scaling, iOS zoom prevention
2. Inline `<script>` — hooks `window.WebSocket` before ttyd's bundle runs; stores the
   `/ws` socket in `window._S` so `kb.js` can send PTY bytes.
3. `<script src="/kb.js" defer>` — the mobile toolbar, runs after DOM is parsed.

`spawnSession(label)` runs, in order:
```
1. tmux new-session -d -s <id>          -- created eagerly, NOT left for ttyd to spawn lazily
2. ttyd --port <p> --interface 127.0.0.1 --writable --base-path /term/<id>/ \
         --client-option rendererType=dom \
         tmux new-session -A -s <id>    -- attaches to the session created in step 1
```

MCP tools (`server/mcp/tools.js`) act on the tmux session directly — via `tmux
capture-pane`/`send-keys`/`display-message`, not via ttyd's WebSocket/HTTP at
all — so they work whether or not any browser has ever opened that terminal.
See `server/mcp/tmux.js` for the tmux primitives and why `#{cursor_y}`, not
`#{pane_height}`, is used to find "the end of real content" (mistakes.md
2026-07-29-008).

### Why the MCP server is a second port, not a route on the Session Manager
The Session Manager server binds `127.0.0.1` only and has zero authentication
by design (see `docs/ai/decision-log.md`). Terminal-control MCP tools need to
be reachable by LAN agents, so they run on their own listener (`MCP_PORT`,
`MCP_HOST`) with mandatory bearer-token auth (`server/mcp/auth.js`), rather
than widening the Session Manager's own bind address and inheriting its lack
of auth as a side effect.

### Optional install.sh hardening layers
- `NOMADTTY_TLS=certbot` + `NOMADTTY_TLS_EMAIL`: obtains a Let's Encrypt cert via
  `certbot --nginx` after nginx is already live (needed for the HTTP-01 challenge).
  Failure (bad DNS, unreachable port 80) doesn't abort the install — HTTP still works.
- `NOMADTTY_BASIC_AUTH="user:password"`: adds nginx `auth_basic` in front of the
  Session Manager/terminal UI, independent of `MCP_AUTH_TOKEN`. The htpasswd file must be
  `chown root:www-data` (nginx's worker user) or every request 500s — see mistakes.md.
- Rate limiting (`limit_req_zone`/`limit_req`) is on by default in `nginx/ttyd.conf`
  itself (10r/s, burst 20), not installer-gated.

## Important Directories and Files

```
src/kb.js                  — mobile keyboard toolbar (core innovation, ~260 lines vanilla JS)
nginx/ttyd.conf            — nginx vhost: reverse-proxies to the Session Manager; default rate limit
systemd/nomadtty.service   — template unit for the Session Manager + MCP backend (substituted by install.sh)
Dockerfile                 — multi-arch Docker image (alpine:3.20), runs server/main.js
docker-compose.yml         — single-service compose deployment
docker-entrypoint.sh       — starts nginx (bg), auto-generates MCP_AUTH_TOKEN, execs node server/main.js
install.sh                 — curl-pipe installer for Debian/Ubuntu; installs the full backend + optional TLS/Basic Auth
server/session-manager.js  — multi-session ttyd/tmux orchestration + UI/API + terminal reverse proxy + toolbar injection
server/mcp/**              — MCP "Streamable HTTP" server: tools.js, tmux.js, validation.js, auth.js, index.js
server/main.js             — composition root: starts session-manager + mcp together, coordinated shutdown
public/session-manager.*   — Session Manager UI (HTML/JS)
package.json               — root npm manifest (Session Manager + MCP server's runtime deps)
NOTICE                     — third-party license attributions (required)
```

## Domain Terminology

| Term | Meaning |
|------|---------|
| **toolbar** | The fixed row of buttons (`#kb`) injected by `kb.js` at the top of the page |
| **WS hook** | The inline script that overrides `window.WebSocket` before ttyd's bundle |
| **sticky modifier** | CTRL/SHFT/ALT toggle buttons — stay active until next keypress |
| **PTY** | Pseudo-terminal; what ttyd wraps around tmux/bash |
| **kb.js** | The toolbar script file; served by the Session Manager at `/kb.js` |
| `window._S` | Global reference to the captured ttyd WebSocket; toolbar uses it to send bytes |
| **terminal_id** | 12-hex-char id keying the `sessions` Map; also the tmux session name and ttyd `--base-path` segment |
| **MCP** | Model Context Protocol — how AI agents discover and call NomadTTY's terminal-control tools |
| **Streamable HTTP transport** | MCP's transport: JSON-RPC over POST, upgradeable to `text/event-stream` (SSE), plus a standing GET SSE stream |
| **MCP_PORT / MCP_HOST** | env vars for the MCP server's listener (defaults: `4200` / `0.0.0.0`) |
| **MCP_AUTH_TOKEN** | bearer token required on every `/mcp` request; server refuses to boot LAN-exposed without it (see decision-log) |
| `cursor_y` | tmux pane format variable used to find "the last row of real content" — see mistakes.md 2026-07-29-008 |

## Major Integration Boundaries

1. **nginx ↔ Session Manager**: HTTP reverse proxy to `127.0.0.1:4000`; WebSocket upgrade
   pass-through for `/term/<id>/*`. Rate-limited by default; optionally Basic-Auth-gated.
2. **Session Manager ↔ kb.js**: the Session Manager serves the file and injects the
   `<script>` tag + WS hook server-side (`injectToolbar()`), not via nginx `sub_filter`.
3. **kb.js ↔ ttyd WebSocket**: `window._S.send('0' + bytes)` sends PTY input.
   ttyd protocol: client sends `"0" + data` for input, `"1" + JSON` for resize.
4. **ttyd ↔ tmux**: each session's tmux name is its `terminal_id`, created eagerly by
   `spawnSession()` before ttyd attaches to it.
5. **MCP server ↔ tmux**: MCP tools call `tmux capture-pane`/`send-keys`/`display-message`
   directly (`server/mcp/tmux.js`) — independent of ttyd's WebSocket, so tools work with no
   browser ever attached.
6. **MCP server ↔ session-manager registry**: same process, same in-memory `sessions` Map,
   no network hop (`server/main.js` wires both to the same registry).
7. **Docker/install.sh ↔ host**: port 80 (nginx) and 4200 (MCP) published/exposed;
   `NOMADTTY_HOST`/`MCP_AUTH_TOKEN`/etc. env vars — see `.claude/rules/config.md`.
8. **Tailscale ↔ nginx**: Tailscale Serve can front nginx with automatic HTTPS on ts.net —
   an alternative to `install.sh`'s `NOMADTTY_TLS=certbot` for operators already on Tailscale.

## TODO / ASSUMPTION markers in this doc
- **Resolved (2026-07-30):** ttyd exact version is `1.7.7-r0` via Alpine 3.20's `apk`
  (Docker path — see Stack table above); apt-installed version on the bare-metal
  install.sh path varies by host OS and wasn't independently re-checked here.
  xterm.js's exact bundled version inside that ttyd release remains unknown (ttyd
  vendors it internally; not surfaced by the package manager) — low-value to chase
  further unless a version-specific xterm.js bug is suspected.
- **Resolved (2026-07-30):** deliberately **not** hard-pinning exact package versions —
  see `.claude/rules/infra.md`'s Dockerfile rules for why (both apk's and apt's official
  archives generally retain only the current version, so a hard pin risks the build
  breaking outright once the archive rotates, a worse failure mode than an unpinned
  "floating latest"). Actual versions recorded in the Stack table above instead.
- TODO: real multi-user/multi-tenant access control (named sessions are not per-user
  accounts) — tracked in `docs/competitive-analysis.md`'s backlog, not yet implemented.
- TODO: `Content-Security-Policy` nginx header (SECURITY.md's Low-priority item) —
  deliberately deferred, needs compatibility testing against kb.js's inline WS hook and
  ttyd's bundled xterm.js before enabling.
- TODO: Alpine image's `linux/arm64` build was not independently verified (no arm64
  hardware/emulation available in the session that switched the base image) — verify
  before relying on it if this becomes a blocker.
