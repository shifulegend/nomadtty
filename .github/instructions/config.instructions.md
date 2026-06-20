---
applyTo: "**"
---
# NomadTTY — Configuration Instructions
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

## Env vars
| Variable | Default | Files |
|----------|---------|-------|
| `TTYD_PORT` | `47821` | install.sh, ttyd.service, docker-entrypoint.sh, nginx/ttyd.conf |
| `NOMADTTY_HOST` | `_` | install.sh, docker-entrypoint.sh, nginx/ttyd.conf |

- Any value that differs between deployments → env var or config file. Not hardcoded.
- Adding a new config param: update nginx conf + systemd + entrypoint + install.sh + README atomically.
- The sub_filter injection string is a critical config item:
  order must be: viewport meta → WS hook → kb.js script tag. Total < 500 B.
- Never use `sed s///` to edit lines containing JS, URLs, or `&&`. Use heredoc rewrites.
