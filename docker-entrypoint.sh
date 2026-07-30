#!/bin/sh
set -e

# Optionally customise the nginx server_name
if [ -n "$NOMADTTY_HOST" ]; then
    sed -i "s/server_name _;/server_name ${NOMADTTY_HOST};/" \
        /etc/nginx/sites-available/nomadtty
fi

# Auto-generate MCP_AUTH_TOKEN if the operator didn't supply one via
# `docker run -e MCP_AUTH_TOKEN=...`. It only lives for this container's
# lifetime unless the operator passes their own value in, since a fresh
# container has no persistent host filesystem to remember it across restarts
# (mirrors Portainer's pattern of minting a setup token and surfacing it via
# logs rather than requiring the operator to invent one by hand).
if [ -z "$MCP_AUTH_TOKEN" ]; then
    MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
    export MCP_AUTH_TOKEN
    echo "=================================================================="
    echo " NomadTTY: no MCP_AUTH_TOKEN was supplied — generated one for you."
    echo " Save this now; it will not be shown again unless you docker logs"
    echo " this container before it's replaced, and it changes on every"
    echo " restart unless you pass -e MCP_AUTH_TOKEN=... yourself next time."
    echo ""
    echo "   MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN}"
    echo "=================================================================="
fi

# Start nginx in the background
nginx -g 'daemon off;' &

# Start the Session Manager + MCP backend (server/main.js) in the foreground.
# This is what nginx's own config (nginx/ttyd.conf) proxies to on :4000 — see
# docs/ai/mistakes.md 2026-07-30-001 for why this replaced running raw ttyd
# directly here.
cd /app
exec node server/main.js
