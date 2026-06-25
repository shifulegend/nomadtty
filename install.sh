#!/usr/bin/env bash
# NomadTTY — one-command installer for Debian/Ubuntu
#
# Minimal install (any hostname):
#   curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | sudo bash
#
# With a custom domain:
#   curl -fsSL .../install.sh | sudo NOMADTTY_HOST=terminal.example.com bash
#
# All options (env vars):
#   NOMADTTY_HOST   nginx server_name  (default: _ = any hostname)
#   TTYD_PORT       ttyd internal port (default: 47821)
#   NOMADTTY_USER   OS user to run ttyd as; must own the tools in your $PATH
#                   (default: the user who ran sudo, or current user)

set -euo pipefail

TTYD_PORT="${TTYD_PORT:-47821}"
NOMADTTY_HOST="${NOMADTTY_HOST:-}"
NOMADTTY_USER="${NOMADTTY_USER:-${SUDO_USER:-$(id -un)}}"
WEB_ROOT="/var/www/nomadtty"
NGINX_CONF="/etc/nginx/sites-available/nomadtty"
SERVICE_FILE="/etc/systemd/system/ttyd.service"
REPO="https://raw.githubusercontent.com/shifulegend/nomadtty/main"

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

echo "==> NomadTTY installer"
echo "    Service user : $NOMADTTY_USER"
echo "    ttyd port    : $TTYD_PORT"
echo "    nginx host   : ${NOMADTTY_HOST:-_ (any hostname)}"
echo ""

# ── Dependencies ────────────────────────────────────────────────────────────
echo "==> Installing dependencies (ttyd tmux nginx curl)..."
apt-get update -qq
apt-get install -y --no-install-recommends ttyd tmux nginx curl

# ── Deploy toolbar script ───────────────────────────────────────────────────
echo "==> Deploying toolbar script..."
mkdir -p "$WEB_ROOT"
curl -fsSL "$REPO/src/kb.js" -o "$WEB_ROOT/kb.js"

# ── Configure nginx ─────────────────────────────────────────────────────────
echo "==> Configuring nginx..."
curl -fsSL "$REPO/nginx/ttyd.conf" -o "$NGINX_CONF"

if [ -n "$NOMADTTY_HOST" ]; then
    sed -i "s/terminal\.yourdomain\.com/$NOMADTTY_HOST/" "$NGINX_CONF"
else
    sed -i "s/server_name terminal\.yourdomain\.com;/server_name _;/" "$NGINX_CONF"
fi

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/nomadtty
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t

# ── Configure ttyd systemd service ─────────────────────────────────────────
echo "==> Configuring ttyd service..."
curl -fsSL "$REPO/systemd/ttyd.service" -o "$SERVICE_FILE"
sed -i "s/47821/$TTYD_PORT/g" "$SERVICE_FILE"
sed -i "s/NOMADTTY_USER/$NOMADTTY_USER/g" "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable --now ttyd
systemctl reload nginx

# ── Health check ────────────────────────────────────────────────────────────
echo ""
echo "==> Verifying deployment..."
LOCAL_IP="$(hostname -I | awk '{print $1}')"
sleep 2   # give ttyd a moment to start

HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/")"
if [ "$HTTP_STATUS" = "200" ]; then
    echo "    HTTP 200 OK — terminal is responding."
else
    echo "    WARNING: Got HTTP $HTTP_STATUS from http://127.0.0.1/ — check logs." >&2
    echo "    journalctl -u ttyd -n 20" >&2
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
echo "   Logs:"
echo "     journalctl -u ttyd -f"
echo "     tail -f /var/log/nginx/nomadtty.access.log"
echo ""
echo "   Uninstall:"
echo "     systemctl disable --now ttyd"
echo "     rm -f $SERVICE_FILE $NGINX_CONF /etc/nginx/sites-enabled/nomadtty"
echo "     rm -rf $WEB_ROOT"
echo "     systemctl daemon-reload && systemctl reload nginx"
