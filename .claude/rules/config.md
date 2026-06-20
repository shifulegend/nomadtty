# Claude Code — Configuration Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (No-Hardcoding section) -->
<!-- last updated: 2026-06-20 -->

## Environment variables
| Variable | Default | Used in |
|----------|---------|---------|
| `TTYD_PORT` | `47821` | `install.sh`, `systemd/ttyd.service`, `docker-entrypoint.sh`, `nginx/ttyd.conf` |
| `NOMADTTY_HOST` | `_` (any) | `install.sh`, `docker-entrypoint.sh`, `nginx/ttyd.conf` |

## Config file rules
- `nginx/ttyd.conf`: contains `yourdomain.com` as placeholder — never hardcode a real domain.
- `systemd/ttyd.service`: tmux session name `main` — extract to env var if multiple sessions needed.
- `docker-compose.yml`: env vars are commented with their purpose.

## Configurability principle
- Treat configurability as the default design goal.
- Any value that might differ between deployments must be an env var or config file setting.
- When adding a new config parameter, update: nginx config, systemd service, docker-entrypoint.sh,
  install.sh, and README.md environment variable documentation — atomically.

## Sub-filter injection config
The three-element injection string in `nginx/ttyd.conf` and the tailscale-router
config is a critical config item. It must:
- Start with the viewport meta tag
- Include the inline WS hook script (must remain < 300 B)
- End with `<script src="/kb.js" defer></script>`
- Fit within nginx sub_filter parameter limit (conservatively: keep total < 500 B)
