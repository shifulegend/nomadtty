# NomadTTY — Project Overview
<!-- canonical source of truth | update this file first, then sync tool adapters -->
<!-- last updated: 2026-06-20 -->

## Purpose
NomadTTY is a mobile-friendly web terminal that wraps **ttyd** with a purpose-built
touch keyboard toolbar. Users access a persistent shell on a remote Linux server
from any phone, tablet, or desktop browser — typically over a private Tailscale VPN.

## Stack and Key Dependencies

| Component | Role | Version / source |
|-----------|------|-----------------|
| **ttyd** | Web terminal emulator (C binary) | apt: `ttyd` (MIT) |
| **xterm.js** | Terminal front-end (bundled inside ttyd) | bundled (MIT) |
| **tmux** | PTY multiplexer — persistent sessions | apt: `tmux` (ISC) |
| **nginx** | Reverse proxy + HTML injection via `sub_filter` | apt: `nginx` (BSD-2) |
| **bash** | Shell spawned by ttyd inside tmux | system |
| **vanilla JS** | Toolbar (`src/kb.js`) — zero runtime dependencies | none |
| **Docker** | Packaging (ubuntu:24.04 base) | multi-arch: amd64/arm64 |
| **systemd** | Service management (non-Docker installs) | system |

No build toolchain. `src/kb.js` is raw JavaScript served directly — no bundler,
no transpiler, no npm.

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

## Important Directories and Files

```
src/kb.js                  — mobile keyboard toolbar (core innovation, ~260 lines vanilla JS)
nginx/ttyd.conf            — nginx vhost; hosts /kb.js and injects toolbar via sub_filter
systemd/ttyd.service       — systemd unit; ttyd on 127.0.0.1:47821 + tmux
Dockerfile                 — multi-arch Docker image (ubuntu:24.04)
docker-compose.yml         — single-service compose deployment
docker-entrypoint.sh       — starts nginx (bg) then ttyd (foreground)
install.sh                 — curl-pipe installer for Debian/Ubuntu
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

## Major Integration Boundaries

1. **nginx ↔ ttyd**: HTTP proxy on port 47821 (loopback only); WebSocket upgrade on `/ws`.
2. **nginx ↔ kb.js**: nginx serves the file; sub_filter injects the `<script>` tag.
3. **kb.js ↔ ttyd WebSocket**: `window._S.send('0' + bytes)` sends PTY input.
   ttyd protocol: client sends `"0" + data` for input, `"1" + JSON` for resize.
4. **ttyd ↔ tmux**: ttyd spawns `tmux new-session -A -s main` as the PTY command.
5. **Docker ↔ host**: port 80 published; `NOMADTTY_HOST` and `TTYD_PORT` env vars.
6. **Tailscale ↔ nginx**: Tailscale Serve can front nginx with automatic HTTPS on ts.net.

## TODO / ASSUMPTION markers in this doc
- UNKNOWN: ttyd exact version installed by apt on Ubuntu 24.04
- UNKNOWN: xterm.js version bundled in that ttyd release
- TODO: add version pinning to Dockerfile once tested
