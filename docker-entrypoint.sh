#!/bin/sh
set -e

# Optionally customise the nginx server_name
if [ -n "$NOMADTTY_HOST" ]; then
    sed -i "s/server_name _;/server_name ${NOMADTTY_HOST};/" \
        /etc/nginx/sites-available/nomadtty
fi

# Start nginx in the background
nginx -g 'daemon off;' &

# Start ttyd (tmux persistent session, writable, local-only)
exec ttyd \
    --port 47821 \
    --interface 127.0.0.1 \
    --writable \
    tmux new-session -A -s main
