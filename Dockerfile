# NomadTTY — mobile-friendly web terminal
# Bundles ttyd + tmux + nginx + the mobile keyboard toolbar.
#
# Build:
#   docker buildx build --platform linux/amd64,linux/arm64 -t nomadtty .
#
# Run:
#   docker run -d -p 80:80 --name nomadtty nomadtty

FROM ubuntu:26.04

ARG DEBIAN_FRONTEND=noninteractive

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ttyd \
    tmux \
    nginx \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy toolbar script
RUN mkdir -p /var/www/nomadtty
COPY src/kb.js /var/www/nomadtty/kb.js

# Copy nginx config
COPY nginx/ttyd.conf /etc/nginx/sites-available/nomadtty
RUN ln -sf /etc/nginx/sites-available/nomadtty /etc/nginx/sites-enabled/nomadtty \
    && rm -f /etc/nginx/sites-enabled/default

# Patch nginx config: listen on 0.0.0.0, no server_name restriction
# (container users can set their own domain via NOMADTTY_HOST env var)
RUN sed -i 's/server_name terminal\.yourdomain\.com/server_name _/' \
        /etc/nginx/sites-available/nomadtty

# Startup script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
