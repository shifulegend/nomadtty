---
applyTo: "Dockerfile,docker-compose.yml,docker-entrypoint.sh,nginx/**,systemd/**,install.sh"
---
# NomadTTY — Infrastructure Instructions
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

## Dockerfile
- Base: `ubuntu:24.04`. Do not switch to alpine without testing ttyd apt availability.
- `DEBIAN_FRONTEND=noninteractive` for apt installs.
- `rm -rf /var/lib/apt/lists/*` after every apt install layer.
- No dev tools in the image.

## nginx
- `nginx -t` before every reload. Non-negotiable.
- `/ws` location: NO sub_filter (WebSocket upgrade is incompatible).
- `Accept-Encoding ""` on the `/` proxy location (prevents gzip corrupting sub_filter).
- `/kb.js` location before `location /` catch-all.

## systemd
- `--writable` mandatory in ttyd ExecStart. See mistakes.md [2026-06-20-001].
- `systemctl daemon-reload` immediately after editing any unit file.
- Multi-command ExecStart* → wrap in `/bin/sh -c '...'`. See mistakes.md [2026-06-20-003].

## install.sh
- `set -euo pipefail`. Root check at top. `curl -fsSL` for remote fetches.
- `shellcheck install.sh` must pass.
- TODO: validate NOMADTTY_HOST before sed injection.
