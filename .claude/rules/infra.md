# Claude Code — Infrastructure Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- covers: Dockerfile, nginx, systemd, install.sh -->
<!-- last updated: 2026-06-20 -->

## Dockerfile rules
- Base: `ubuntu:24.04`. Do not switch to alpine without testing ttyd availability.
- Multi-arch target: `linux/amd64,linux/arm64`.
- No development tools in the image (no gcc, make, etc.).
- `DEBIAN_FRONTEND=noninteractive` must be set for apt installs.
- Run `rm -rf /var/lib/apt/lists/*` after every apt install layer.
- `docker-entrypoint.sh` starts nginx in background (`nginx -g 'daemon off;' &`),
  then runs ttyd as PID 1 foreground.

## nginx rules
- Always run `nginx -t` before reloading.
- `sub_filter_once on` — inject only into the first `<head>` occurrence.
- The `/ws` location must NOT have sub_filter (WebSocket upgrade headers are incompatible).
- `Accept-Encoding ""` must be set on the proxied `/` location to prevent gzip from
  corrupting the sub_filter operation.
- `/kb.js` location must be served before the `location /` catch-all.
- Never use `sed s///` to edit nginx configs with JS/URL content. Use heredoc rewrites.

## systemd rules
- `--writable` is mandatory in ttyd ExecStart. Never remove it.
- `User=ubuntu` (or the deploy user) — NOT root. PTY creation works fine as a normal
  user; root is not required. Running as root breaks `claude` and other user-local tools
  because their binaries and credentials live under the user home, not /root.
- Multi-command ExecStart* logic must be wrapped in `/bin/sh -c '...'`.
- `Restart=always; RestartSec=3` gives process resilience.
- Run `systemctl daemon-reload` immediately after editing any unit file.

## install.sh rules
- `set -euo pipefail` at top.
- `[ "$(id -u)" -ne 0 ]` root check at top, with clear error message.
- All config values must come from env vars (TTYD_PORT, NOMADTTY_HOST) with defaults.
- `curl -fsSL` for all remote fetches.
- `shellcheck install.sh` must pass before committing.
- TODO: add regex validation of NOMADTTY_HOST before sed injection into nginx config.
