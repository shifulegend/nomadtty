# Antigravity — Infrastructure Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- covers: Dockerfile, nginx, systemd, install.sh -->
<!-- last updated: 2026-06-20 -->

## Dockerfile
- Base: ubuntu:24.04. Do not switch to alpine without testing ttyd availability.
- Multi-arch: linux/amd64,linux/arm64.
- `DEBIAN_FRONTEND=noninteractive`. `rm -rf /var/lib/apt/lists/*` after apt installs.

## nginx
- `nginx -t` before every reload. Non-negotiable.
- `/ws` location: no sub_filter (WebSocket incompatible).
- `Accept-Encoding ""` on `/` proxy (prevents gzip corrupting sub_filter).
- `/kb.js` location before `location /` catch-all.

## systemd
- `--writable` mandatory in ttyd ExecStart. (mistakes.md [2026-06-20-001])
- `daemon-reload` immediately after editing any unit file.
- Multi-command Exec*: wrap in `/bin/sh -c '...'`. (mistakes.md [2026-06-20-003])

## install.sh
- `set -euo pipefail`. Root check at top. `curl -fsSL` for remote fetches.
- `shellcheck install.sh` must pass.
