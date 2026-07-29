# Claude Code — Configuration Rules
<!-- adapter; canonical source: docs/ai/engineering-rules.md (No-Hardcoding section) -->
<!-- last updated: 2026-07-29 -->

## Environment variables — legacy model
| Variable | Default | Used in |
|----------|---------|---------|
| `TTYD_PORT` | `47821` | `install.sh`, `systemd/ttyd.service`, `docker-entrypoint.sh`, `nginx/ttyd.conf` |
| `NOMADTTY_HOST` | `_` (any) | `install.sh`, `docker-entrypoint.sh`, `nginx/ttyd.conf` |

## Environment variables — Session Manager + MCP model
| Variable | Default | Used in |
|----------|---------|---------|
| `SESSION_MANAGER_PORT` | `4000` | `server/session-manager.js` |
| `TTYD_BASE_PORT` | `47900` | `server/session-manager.js` (per-session ttyd ports allocate upward from this) |
| `TTYD_RENDERER_TYPE` | `dom` | `server/session-manager.js` — xterm.js renderer for spawned ttyd processes; dom is the default because WebGL renders incorrectly under headless/software-GPU environments and canvas draws glyphs at the wrong size at real mobile devicePixelRatio (see decision-log.md) |
| `MCP_PORT` | `4200` | `server/mcp/index.js` |
| `MCP_HOST` | `0.0.0.0` | `server/mcp/index.js` |
| `MCP_AUTH_TOKEN` | *(none)* | `server/mcp/auth.js` — required once `MCP_HOST` is non-loopback |
| `MCP_ALLOW_INSECURE` | *(unset)* | `server/mcp/auth.js` — explicit opt-out of the token requirement; never use in production |
| `MCP_MAX_TEXT_BYTES` | `8192` | `server/mcp/validation.js` — `type_command` text size cap |
| `MCP_MAX_LABEL_BYTES` | `256` | `server/mcp/validation.js` — `create_session` label size cap |
| `MCP_MAX_KEYS_PER_CALL` | `32` | `server/mcp/validation.js` — `send_keystroke` array size cap |
| `MCP_MAX_LINES_REQUEST` | `5000` | `server/mcp/validation.js` — `read_terminal_contents` head/tail line cap |
| `MCP_MAX_CAPTURE_LINES` | `5000` | `server/mcp/validation.js` — `mode="full"` truncation threshold |
| `MCP_DENYLIST_ENABLED` | `1` (on) | `server/mcp/validation.js` — best-effort `type_command` destructive-pattern guard |
| `MCP_DENYLIST_EXTRA` | *(none)* | `server/mcp/validation.js` — comma-separated extra regex sources |
| `MCP_FOLLOW_MAX_SECONDS` | `30` | `server/mcp/tools.js` — max duration of `read_terminal_contents`'s `follow` streaming mode |

**Known gap (ASSUMPTION, flag if it changes):** unlike the legacy model, these Session
Manager/MCP env vars are **not yet** wired into `Dockerfile`/`install.sh`/`systemd/*` —
the "update all deployment surfaces atomically" rule below does not yet apply to them
because the Session Manager itself was never wired into those surfaces. See
`docs/ai/project-overview.md`'s "current state note".

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
