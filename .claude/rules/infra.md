# Claude Code — Infrastructure Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- covers: Dockerfile, nginx, systemd, install.sh, server/main.js -->
<!-- last updated: 2026-07-30 -->

## Resolved: Dockerfile/install.sh now run the Session Manager + MCP backend
As of 2026-07-30, `Dockerfile`, `docker-entrypoint.sh`, and `install.sh` all install
Node.js and run `server/main.js` (Session Manager + MCP) — the same architecture that
runs production `terminal.pz.net` — instead of raw `ttyd` directly. There is one
deployment model now. See `docs/ai/decision-log.md`'s 2026-07-30 entry and
`docs/ai/mistakes.md` 2026-07-30-001 for why this was urgent: the previous raw-ttyd
Docker/install.sh paths were serving `502 Bad Gateway` on every request, since
`nginx/ttyd.conf` had already been pointed at the Session Manager (commit `55a5208`)
while nothing ran it. Do not reintroduce a raw-ttyd-only Docker/install.sh path without
also reverting `nginx/ttyd.conf`'s `proxy_pass` target to match.

## Dockerfile rules
- Base: `ubuntu:26.04` (bumped from the originally-decided `24.04` — see
  `docs/ai/decision-log.md`'s 2026-06-20 entry for the original rationale, which still
  holds for the newer LTS: ttyd is available via apt, no alpine/compile-from-source
  needed). Do not switch to alpine without testing ttyd availability.
- Multi-arch target: `linux/amd64,linux/arm64`.
- Installs `nodejs`/`npm` alongside `ttyd`/`tmux`/`nginx` — the backend needs Node; ttyd
  itself is still spawned per-session by `server/session-manager.js`, not run standalone.
- `DEBIAN_FRONTEND=noninteractive` must be set for apt installs.
- Run `rm -rf /var/lib/apt/lists/*` after every apt install layer.
- Use `npm ci --omit=dev` (not `npm install`) for reproducible, dev-dependency-free builds.
- `docker-entrypoint.sh` starts nginx in background (`nginx -g 'daemon off;' &`), then
  execs `node server/main.js` as PID 1 foreground — auto-generating `MCP_AUTH_TOKEN` via
  `openssl rand -hex 32` first if the operator didn't supply one via `-e`.
- `.dockerignore` excludes `.git`, `node_modules`, `tests`, `docs` from the build context.

## nginx rules
- Always run `nginx -t` before reloading.
- The main vhost (`nginx/ttyd.conf`) reverse-proxies everything to the Session Manager
  (`127.0.0.1:4000`) — it does **not** do `sub_filter` HTML injection; the Session Manager
  itself injects the toolbar (`injectToolbar()` in `server/session-manager.js`). Do not
  reintroduce `sub_filter` on this vhost without a corresponding reason to bypass the
  Session Manager entirely.
- Default rate limiting (`limit_req_zone`/`limit_req`, 10r/s burst 20) is on by default in
  `nginx/ttyd.conf` — a Medium-priority SECURITY.md item now enforced, not just documented.
- `install.sh`'s optional `NOMADTTY_BASIC_AUTH` injects `auth_basic`/`auth_basic_user_file`
  into the `location /` block via `sed` insertion after the `location / {` line — the
  htpasswd file **must** be `chown root:www-data` (nginx's worker user on Debian/Ubuntu),
  not just root-owned, or every request 500s (`open() ... Permission denied` in the nginx
  error log) — found and fixed while implementing this; see `docs/ai/mistakes.md`.
- `install.sh`'s optional `NOMADTTY_TLS=certbot` runs `certbot --nginx` after nginx is
  already live serving the domain over HTTP (required for the HTTP-01 challenge) —
  failure must not abort the install (`if certbot ...; then ... else ...; fi`, never bare
  `certbot ...` under `set -e`), since the site already works over HTTP at that point.
- Never use `sed s///` to edit nginx configs with JS/URL content. Use heredoc rewrites.

## systemd rules
- `--writable` is mandatory on every per-session ttyd process (`server/session-manager.js`'s
  `spawnSession()`). Never remove it.
- `systemd/nomadtty.service` is a **template**: `NOMADTTY_WORKING_DIR`/`NOMADTTY_NODE_BIN`/
  `NOMADTTY_USER` placeholders, substituted by `install.sh` via `sed`. Never hardcode a real
  path/user/node-binary-location directly into the committed template file.
- `User=` should be a non-root deploy user by default — PTY creation doesn't need root, and
  root breaks `$PATH`/credential lookups for user-local tools (`claude`, etc.) that live
  under the user's home, not `/root`.
- `EnvironmentFile=/etc/nomadtty/nomadtty.env` (not inline `Environment=`) keeps
  `MCP_AUTH_TOKEN` out of `systemctl cat`/unit-file listings.
- Multi-command ExecStart* logic must be wrapped in `/bin/sh -c '...'`.
- `Restart=always; RestartSec=3` gives process resilience.
- Run `systemctl daemon-reload` immediately after editing any unit file.

## install.sh rules
- `set -euo pipefail` at top.
- `[ "$(id -u)" -ne 0 ]` root check at top, with clear error message.
- All config values must come from env vars (see `.claude/rules/config.md`'s full table)
  with defaults; `NOMADTTY_HOST` is validated against a hostname regex before use in `sed`.
- `curl -fsSL`/`git clone --depth 1` for all remote fetches.
- `shellcheck install.sh` must pass before committing.
- `MCP_AUTH_TOKEN` is auto-generated (`openssl rand -hex 32`) when unset, and **preserved**
  across re-runs by reading the existing `/etc/nomadtty/nomadtty.env` first — never silently
  rotate an operator's token on a routine re-run/upgrade.
- `NOMADTTY_LOCAL_SOURCE` (install from an existing local checkout) needs `rsync` in the
  apt dependency list — easy to forget since it's only exercised by that one code path;
  test both the git-clone and local-source branches, not just whichever is more convenient.
