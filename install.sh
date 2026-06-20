#!/usr/bin/env bash
# NomadTTY — one-command installer for Debian/Ubuntu
# Usage: curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | bash
# Or with a custom domain: NOMADTTY_HOST=terminal.example.com bash install.sh

set -euo pipefail

TTYD_PORT="${TTYD_PORT:-47821}"
NOMADTTY_HOST="${NOMADTTY_HOST:-}"
WEB_ROOT="/var/www/nomadtty"
NGINX_CONF="/etc/nginx/sites-available/nomadtty"
SERVICE_FILE="/etc/systemd/system/ttyd.service"
REPO="https://raw.githubusercontent.com/shifulegend/nomadtty/main"

echo "==> NomadTTY installer"

# Require root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run as root (sudo bash install.sh)" >&2
    exit 1
fi

# Dependencies
apt-get update -qq
apt-get install -y --no-install-recommends ttyd tmux nginx curl

# Deploy toolbar script
mkdir -p "$WEB_ROOT"
curl -fsSL "$REPO/src/kb.js" -o "$WEB_ROOT/kb.js"

# Install nginx config
curl -fsSL "$REPO/nginx/ttyd.conf" -o "$NGINX_CONF"

if [ -n "$NOMADTTY_HOST" ]; then
    sed -i "s/terminal\.yourdomain\.com/$NOMADTTY_HOST/" "$NGINX_CONF"
else
    sed -i "s/server_name terminal\.yourdomain\.com;/server_name _;/" "$NGINX_CONF"
fi

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/nomadtty
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Install systemd service
curl -fsSL "$REPO/systemd/ttyd.service" -o "$SERVICE_FILE"
sed -i "s/47821/$TTYD_PORT/g" "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable --now ttyd
nginx -t && systemctl reload nginx

echo ""
echo "✓ NomadTTY installed and running."
if [ -n "$NOMADTTY_HOST" ]; then
    echo "  Terminal: http://$NOMADTTY_HOST"
else
    echo "  Terminal: http://$(hostname -I | awk '{print $1}')"
fi
echo ""
echo "  Logs:  journalctl -u ttyd -f"
echo "         tail -f /var/log/nginx/nomadtty.access.log"
