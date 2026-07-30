#!/usr/bin/env bash
# NomadTTY — one-command installer for Debian/Ubuntu
# Installs the Session Manager + MCP backend (server/**): a mobile-friendly
# web terminal with persistent multi-session support and an MCP server for
# AI-agent terminal access. This is the same architecture that runs
# production terminal.pz.net — see docs/ai/decision-log.md's 2026-07-30
# entry for why this replaced running raw ttyd standalone.
#
# Minimal install (any hostname):
#   curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | sudo bash
#
# With a custom domain:
#   curl -fsSL .../install.sh | sudo NOMADTTY_HOST=terminal.example.com bash
#
# All options (env vars):
#   NOMADTTY_HOST         nginx server_name (default: _ = any hostname)
#   NOMADTTY_USER         OS user to run the backend as; must own the tools
#                         in your $PATH (default: the user who ran sudo, or
#                         current user)
#   NOMADTTY_INSTALL_DIR  where the application code lives (default: /opt/nomadtty)
#   NOMADTTY_BRANCH       git branch/tag to install (default: main)
#   NOMADTTY_REPO_URL     git remote to clone from
#                         (default: https://github.com/shifulegend/nomadtty.git)
#   NOMADTTY_LOCAL_SOURCE path to an already-checked-out copy of this repo to
#                         install from instead of cloning (offline/air-gapped
#                         installs, or testing a local checkout)
#   MCP_AUTH_TOKEN        bearer token required to call the MCP server
#                         (default: auto-generated with `openssl rand -hex 32`
#                         and preserved across re-runs)
#   MCP_PORT              MCP server port (default: 4200)
#   MCP_HOST              MCP server bind address (default: 0.0.0.0 — LAN-facing;
#                         set 127.0.0.1 for local-only access)
#   SESSION_MANAGER_PORT  Session Manager port (default: 4000)

set -euo pipefail

NOMADTTY_HOST="${NOMADTTY_HOST:-}"
NOMADTTY_USER="${NOMADTTY_USER:-${SUDO_USER:-$(id -un)}}"
INSTALL_DIR="${NOMADTTY_INSTALL_DIR:-/opt/nomadtty}"
BRANCH="${NOMADTTY_BRANCH:-main}"
REPO_URL="${NOMADTTY_REPO_URL:-https://github.com/shifulegend/nomadtty.git}"
LOCAL_SOURCE="${NOMADTTY_LOCAL_SOURCE:-}"
MCP_PORT="${MCP_PORT:-4200}"
MCP_HOST="${MCP_HOST:-0.0.0.0}"
SESSION_MANAGER_PORT="${SESSION_MANAGER_PORT:-4000}"
NGINX_CONF="/etc/nginx/sites-available/nomadtty"
SERVICE_FILE="/etc/systemd/system/nomadtty.service"
ENV_DIR="/etc/nomadtty"
ENV_FILE="$ENV_DIR/nomadtty.env"

# ── Require root ────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run as root:  sudo bash install.sh" >&2
    exit 1
fi

# ── Validate NOMADTTY_HOST (only hostname chars allowed) ────────────────────
if [ -n "$NOMADTTY_HOST" ]; then
    if ! echo "$NOMADTTY_HOST" | grep -qE '^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,252}[a-zA-Z0-9]$'; then
        echo "ERROR: NOMADTTY_HOST='$NOMADTTY_HOST' is not a valid hostname." >&2
        exit 1
    fi
fi

# ── Validate the deploy user exists ─────────────────────────────────────────
if ! id "$NOMADTTY_USER" >/dev/null 2>&1; then
    echo "ERROR: NOMADTTY_USER='$NOMADTTY_USER' does not exist on this system." >&2
    echo "       Create it first, or set NOMADTTY_USER to an existing user." >&2
    exit 1
fi

echo "==> NomadTTY installer"
echo "    Service user     : $NOMADTTY_USER"
echo "    Install directory: $INSTALL_DIR"
echo "    Session Manager   : 127.0.0.1:$SESSION_MANAGER_PORT (loopback only)"
echo "    MCP server        : $MCP_HOST:$MCP_PORT"
echo "    nginx host        : ${NOMADTTY_HOST:-_ (any hostname)}"
echo ""

# ── Dependencies ────────────────────────────────────────────────────────────
echo "==> Installing dependencies (ttyd tmux nginx nodejs npm git rsync openssl curl)..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    ttyd tmux nginx nodejs npm git rsync openssl curl ca-certificates

# ── Fetch/update the application code ───────────────────────────────────────
if [ -n "$LOCAL_SOURCE" ]; then
    echo "==> Installing from local source: $LOCAL_SOURCE..."
    mkdir -p "$INSTALL_DIR"
    # --delete keeps INSTALL_DIR an exact mirror of LOCAL_SOURCE on re-runs;
    # excludes keep an accidental in-place node_modules/.git from a dev
    # checkout out of the deployed copy.
    rsync -a --delete --exclude node_modules --exclude '.git' \
        "$LOCAL_SOURCE"/ "$INSTALL_DIR"/
elif [ -d "$INSTALL_DIR/.git" ]; then
    echo "==> Updating existing checkout at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
elif [ -e "$INSTALL_DIR" ]; then
    echo "ERROR: $INSTALL_DIR exists and is not a git checkout of NomadTTY." >&2
    echo "       Remove it, or set NOMADTTY_INSTALL_DIR to a different path." >&2
    exit 1
else
    echo "==> Cloning NomadTTY into $INSTALL_DIR..."
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

echo "==> Installing Node dependencies..."
( cd "$INSTALL_DIR" && npm ci --omit=dev )

chown -R "$NOMADTTY_USER" "$INSTALL_DIR"

# ── Configure nginx ─────────────────────────────────────────────────────────
echo "==> Configuring nginx..."
cp "$INSTALL_DIR/nginx/ttyd.conf" "$NGINX_CONF"

if [ -n "$NOMADTTY_HOST" ]; then
    sed -i "s/terminal\.yourdomain\.com/$NOMADTTY_HOST/" "$NGINX_CONF"
else
    sed -i "s/server_name terminal\.yourdomain\.com;/server_name _;/" "$NGINX_CONF"
fi

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/nomadtty
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t

# ── Generate/preserve MCP_AUTH_TOKEN and write the env file ────────────────
echo "==> Configuring MCP_AUTH_TOKEN..."
mkdir -p "$ENV_DIR"
if [ -z "${MCP_AUTH_TOKEN:-}" ] && [ -f "$ENV_FILE" ]; then
    MCP_AUTH_TOKEN="$(grep '^MCP_AUTH_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
fi
if [ -z "${MCP_AUTH_TOKEN:-}" ]; then
    MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
    TOKEN_IS_NEW=1
else
    TOKEN_IS_NEW=0
fi

cat > "$ENV_FILE" <<EOF
MCP_AUTH_TOKEN=$MCP_AUTH_TOKEN
MCP_PORT=$MCP_PORT
MCP_HOST=$MCP_HOST
SESSION_MANAGER_PORT=$SESSION_MANAGER_PORT
EOF
chmod 600 "$ENV_FILE"

# ── Configure the nomadtty systemd service ──────────────────────────────────
echo "==> Configuring nomadtty service..."
NODE_BIN="$(command -v node)"
cp "$INSTALL_DIR/systemd/nomadtty.service" "$SERVICE_FILE"
sed -i "s#NOMADTTY_WORKING_DIR#$INSTALL_DIR#g" "$SERVICE_FILE"
sed -i "s#NOMADTTY_NODE_BIN#$NODE_BIN#g" "$SERVICE_FILE"
sed -i "s/NOMADTTY_USER/$NOMADTTY_USER/g" "$SERVICE_FILE"

# Retire the old raw-ttyd-only service if a previous install left it running —
# nginx no longer proxies to it (see docs/ai/mistakes.md 2026-07-30-001).
if systemctl list-unit-files ttyd.service >/dev/null 2>&1; then
    systemctl disable --now ttyd.service >/dev/null 2>&1 || true
fi

systemctl daemon-reload
systemctl enable --now nomadtty
systemctl reload nginx

# ── Health check ────────────────────────────────────────────────────────────
echo ""
echo "==> Verifying deployment..."
LOCAL_IP="$(hostname -I | awk '{print $1}')"
sleep 2   # give the backend a moment to start

HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/")"
if [ "$HTTP_STATUS" = "200" ]; then
    echo "    HTTP 200 OK — Session Manager is responding."
else
    echo "    WARNING: Got HTTP $HTTP_STATUS from http://127.0.0.1/ — check logs." >&2
    echo "    journalctl -u nomadtty -n 20" >&2
    echo "    tail /var/log/nginx/nomadtty.error.log" >&2
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "✓  NomadTTY installed and running."
echo ""
if [ -n "$NOMADTTY_HOST" ]; then
    echo "   Open:  http://$NOMADTTY_HOST"
else
    echo "   Open:  http://$LOCAL_IP"
fi
echo ""
if [ "$TOKEN_IS_NEW" = "1" ]; then
    echo "   MCP_AUTH_TOKEN (newly generated, stored in $ENV_FILE, chmod 600):"
else
    echo "   MCP_AUTH_TOKEN (preserved from a previous install, in $ENV_FILE):"
fi
echo "     $MCP_AUTH_TOKEN"
echo ""
echo "   MCP server listens on $MCP_HOST:$MCP_PORT."
if [ "$MCP_HOST" != "127.0.0.1" ] && [ "$MCP_HOST" != "localhost" ]; then
    echo "   This is reachable beyond localhost — make sure a firewall or"
    echo "   Tailscale (recommended) restricts who can reach it, per SECURITY.md."
fi
echo ""
echo "   Logs:"
echo "     journalctl -u nomadtty -f"
echo "     tail -f /var/log/nginx/nomadtty.access.log"
echo ""
echo "   Uninstall:"
echo "     systemctl disable --now nomadtty"
echo "     rm -f $SERVICE_FILE $NGINX_CONF /etc/nginx/sites-enabled/nomadtty"
echo "     rm -rf $ENV_DIR $INSTALL_DIR"
echo "     systemctl daemon-reload && systemctl reload nginx"
