# Antigravity — Configuration Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md -->
<!-- last updated: 2026-06-20 -->

| Variable | Default | Files |
|----------|---------|-------|
| `TTYD_PORT` | `47821` | install.sh, ttyd.service, docker-entrypoint.sh, nginx/ttyd.conf |
| `NOMADTTY_HOST` | `_` | install.sh, docker-entrypoint.sh, nginx/ttyd.conf |

- Anything that differs between deployments → env var. Never hardcode.
- Adding a new config param: update nginx + systemd + entrypoint + install.sh + README atomically.
- sub_filter injection order: viewport meta → WS hook → kb.js. Total < 500 B.
- Never use `sed s///` on nginx lines with JS, URLs, or `&&`. Use heredoc rewrites.
