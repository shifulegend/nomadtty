# NomadTTY — Project Overview
<!-- canonical source of truth | update this file first, then sync tool adapters -->
<!-- last updated: 2026-07-29 -->

## Purpose
NomadTTY is a mobile-friendly web terminal that wraps **ttyd** with a purpose-built
touch keyboard toolbar. Users access a persistent shell on a remote Linux server
from any phone, tablet, or desktop browser — typically over a private Tailscale VPN.
It also exposes those same terminal sessions to local AI agents over the **Model
Context Protocol** (see "Session Manager + MCP server architecture" below).

## ASSUMPTION / current state note (2026-07-29)
This repo currently contains **two parallel deployment models** that have not yet
been unified:
1. **Legacy single-terminal model** — `Dockerfile`, `install.sh`,
   `docker-entrypoint.sh`, `nginx/ttyd.conf`. One ttyd process + nginx `sub_filter`
   injection, exactly as described below. This is what ships today via Docker/
   `install.sh`, but it is **no longer what `terminal.pz.net` itself runs** (see below).
2. **Session Manager + MCP model** — `server/session-manager.js`,
   `server/mcp/**`, `server/main.js`, `public/session-manager.*`, `systemd/nomadtty.service`.
   A Node process that can run multiple named ttyd/tmux sessions and exposes them to
   MCP agents (10 tools, including session lifecycle: `list_sessions`/`create_session`/
   `close_session`). As of 2026-07-29 this is what the live `terminal.pz.net` host
   actually runs, via `systemd/nomadtty.service` (see `docs/ai/decision-log.md`'s
   2026-07-29 cutover entry) — the old `ttyd.service` was disabled. **Dockerfile/
   install.sh still do not start it** — those paths still ship the legacy model only.
   TODO: unify the deployment story so a fresh install via Docker/`install.sh` also
   gets this architecture.

## Stack and Key Dependencies

| Component | Role | Version / source |
|-----------|------|-----------------|
| **ttyd** | Web terminal emulator (C binary) | apt: `ttyd` (MIT) |
| **xterm.js** | Terminal front-end (bundled inside ttyd) | bundled (MIT) |
| **tmux** | PTY multiplexer — persistent sessions | apt: `tmux` (ISC) |
| **nginx** | Reverse proxy + HTML injection via `sub_filter` (legacy model only) | apt: `nginx` (BSD-2) |
| **bash** | Shell spawned by ttyd inside tmux | system |
| **vanilla JS** | Toolbar (`src/kb.js`) — zero runtime dependencies | none |
| **Node.js** | Session Manager + MCP server backend | apt/nodesource, `>=18` |
| **@modelcontextprotocol/sdk** | MCP "Streamable HTTP" transport + protocol | npm (MIT) |
| **zod** | Input schema validation for MCP tools | npm (MIT) |
| **Docker** | Packaging (ubuntu:24.04 base) | multi-arch: amd64/arm64 |
| **systemd** | Service management (non-Docker installs) | system |

`src/kb.js` remains raw JavaScript with zero runtime dependencies — no bundler,
no transpiler, no npm — since it runs injected into ttyd's page with no build
step available. The Node backend (`server/**`) is a separate context and does
use npm dependencies (see the `@modelcontextprotocol/sdk` entry above and
`docs/ai/decision-log.md`'s "First production npm dependency" entry for why).

## Architecture

```
Client (phone/tablet/desktop, Tailscale network)
        │  HTTP :80  (or HTTPS via Tailscale Serve)
        ▼
   nginx :80
   ├─ GET /kb.js  →  /var/www/nomadtty/kb.js          (toolbar, no-cache)
   ├─ GET /ws     →  ttyd :47821  (WebSocket, pass-through, no sub_filter)
   └─ GET /       →  ttyd :47821  (HTML)
                       └─ sub_filter '<head>' →
                            viewport meta +
                            inline WS hook script +
                            <script src="/kb.js" defer>
                                    │
                                    ▼
                       ttyd spawns: tmux new-session -A -s main
                                    │
                                    ▼
                              persistent bash session
```

### Sub-filter injection detail
nginx injects three things into ttyd's `<head>` in a single `sub_filter` pass:
1. `<meta name="viewport" ...>` — mobile scaling, iOS zoom prevention
2. Inline `<script>` — hooks `window.WebSocket` before ttyd's bundle runs;
   stores the `/ws` socket in `window._S` so `kb.js` can send PTY bytes.
3. `<script src="/kb.js" defer>` — the mobile toolbar, runs after DOM is parsed.

**Sub-filter length constraint:** nginx `sub_filter` replacement strings have a
≈4 KB parameter limit. The WS hook is kept deliberately minimal (< 300 B minified)
to stay within this limit. Full toolbar logic lives in external `kb.js`.

## Session Manager + MCP server architecture

```
                node server/main.js  (composition root)
                ├── session-manager  :4000  (127.0.0.1 only, no auth)
                │     ├─ GET  /                  → Session Manager UI
                │     ├─ GET/POST/DELETE /api/sessions[/id]  → registry CRUD
                │     ├─ GET  /kb.js              → mobile toolbar (same file as legacy model)
                │     └─ *    /term/<id>/*        → reverse proxy → that session's ttyd (HTTP+WS)
                │
                └── mcp server      :4200  (0.0.0.0 by default, Bearer-token auth required)
                      └─ POST/GET/DELETE /mcp     → MCP "Streamable HTTP" transport

Both share ONE in-memory `sessions` Map (same process, no network hop):
  spawnSession(label):
    1. tmux new-session -d -s <id>          -- created eagerly, NOT left for ttyd to spawn lazily
    2. ttyd --port <p> --interface 127.0.0.1 --writable --base-path /term/<id>/ \
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

## Important Directories and Files

```
src/kb.js                  — mobile keyboard toolbar (core innovation, ~260 lines vanilla JS)
nginx/ttyd.conf            — nginx vhost; hosts /kb.js and injects toolbar via sub_filter (legacy model)
systemd/ttyd.service       — systemd unit; ttyd on 127.0.0.1:47821 + tmux (legacy model)
Dockerfile                 — multi-arch Docker image (ubuntu:24.04) (legacy model)
docker-compose.yml         — single-service compose deployment (legacy model)
docker-entrypoint.sh       — starts nginx (bg) then ttyd (foreground) (legacy model)
install.sh                 — curl-pipe installer for Debian/Ubuntu (legacy model)
server/session-manager.js  — multi-session ttyd/tmux orchestration + UI/API + terminal reverse proxy
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
| **sub_filter** | nginx directive that replaces a string in proxied HTML responses |
| **kb.js** | The toolbar script file; served by nginx at `/kb.js` |
| `window._S` | Global reference to the captured ttyd WebSocket; toolbar uses it to send bytes |
| **tmux session** | `main` — the persistent session; `tmux new-session -A -s main` attaches if exists |
| **TTYD_PORT** | env var controlling ttyd's listen port (default: 47821) |
| **NOMADTTY_HOST** | env var for nginx `server_name` (default: `_`, i.e. any hostname) |
| **terminal_id** | 12-hex-char id keying the `sessions` Map; also the tmux session name and ttyd `--base-path` segment |
| **MCP** | Model Context Protocol — how AI agents discover and call NomadTTY's terminal-control tools |
| **Streamable HTTP transport** | MCP's transport: JSON-RPC over POST, upgradeable to `text/event-stream` (SSE), plus a standing GET SSE stream |
| **MCP_PORT / MCP_HOST** | env vars for the MCP server's listener (defaults: `4200` / `0.0.0.0`) |
| **MCP_AUTH_TOKEN** | bearer token required on every `/mcp` request; server refuses to boot LAN-exposed without it (see decision-log) |
| `cursor_y` | tmux pane format variable used to find "the last row of real content" — see mistakes.md 2026-07-29-008 |

## Major Integration Boundaries

1. **nginx ↔ ttyd**: HTTP proxy on port 47821 (loopback only); WebSocket upgrade on `/ws`. (legacy model)
2. **nginx ↔ kb.js**: nginx serves the file; sub_filter injects the `<script>` tag. (legacy model)
3. **kb.js ↔ ttyd WebSocket**: `window._S.send('0' + bytes)` sends PTY input.
   ttyd protocol: client sends `"0" + data` for input, `"1" + JSON` for resize.
4. **ttyd ↔ tmux**: ttyd spawns `tmux new-session -A -s main` as the PTY command. (legacy model;
   in the Session Manager model each session's tmux name is its `terminal_id`, created eagerly — see below)
5. **MCP server ↔ tmux**: MCP tools call `tmux capture-pane`/`send-keys`/`display-message` directly
   (`server/mcp/tmux.js`) — independent of ttyd's WebSocket, so tools work with no browser ever attached.
6. **MCP server ↔ session-manager registry**: same process, same in-memory `sessions` Map, no network hop
   (`server/main.js` wires both to the same registry).
5. **Docker ↔ host**: port 80 published; `NOMADTTY_HOST` and `TTYD_PORT` env vars.
6. **Tailscale ↔ nginx**: Tailscale Serve can front nginx with automatic HTTPS on ts.net.

## TODO / ASSUMPTION markers in this doc
- UNKNOWN: ttyd exact version installed by apt on Ubuntu 24.04
- UNKNOWN: xterm.js version bundled in that ttyd release
- TODO: add version pinning to Dockerfile once tested
