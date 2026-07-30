# NomadTTY — mobile-friendly web terminal + AI-agent MCP server
# Bundles nginx + the Node Session Manager (server/**), which itself owns
# per-session ttyd + tmux processes and injects the mobile keyboard toolbar.
#
# Build:
#   docker buildx build --platform linux/amd64,linux/arm64 -t nomadtty .
#
# Run:
#   docker run -d -p 80:80 -p 4200:4200 --name nomadtty nomadtty
#
# See docker-entrypoint.sh for MCP_AUTH_TOKEN auto-generation and the full
# list of MCP_*/SESSION_MANAGER_*/TTYD_* env vars in .claude/rules/config.md.

FROM ubuntu:26.04

ARG DEBIAN_FRONTEND=noninteractive

# ttyd/tmux: spawned per-session by the Node backend (server/session-manager.js).
# nginx: reverse-proxies to the Session Manager. nodejs/npm: run the backend.
# openssl: MCP_AUTH_TOKEN generation. curl/ca-certificates: health checks + TLS.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ttyd \
    tmux \
    nginx \
    nodejs \
    npm \
    openssl \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies first for better layer caching.
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev

# Application code the Session Manager needs at runtime (see
# server/session-manager.js's PUBLIC_DIR/KB_JS_PATH/REPO_ROOT constants).
COPY server/ /app/server/
COPY public/ /app/public/
COPY src/ /app/src/

# nginx config: reverse-proxies to the Session Manager on 127.0.0.1:4000.
# The Session Manager itself serves /kb.js and injects the toolbar per
# session — no separate sub_filter injection needed in this vhost.
COPY nginx/ttyd.conf /etc/nginx/sites-available/nomadtty
RUN ln -sf /etc/nginx/sites-available/nomadtty /etc/nginx/sites-enabled/nomadtty \
    && rm -f /etc/nginx/sites-enabled/default

# Patch nginx config: listen on any hostname by default; container users can
# set their own domain via the NOMADTTY_HOST env var at `docker run` time.
RUN sed -i 's/server_name terminal\.yourdomain\.com/server_name _/' \
        /etc/nginx/sites-available/nomadtty

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 80: nginx (Session Manager UI + terminals). 4200: MCP server (only reaches
# clients if published with `-p 4200:4200`; requires MCP_AUTH_TOKEN — see
# docker-entrypoint.sh).
EXPOSE 80 4200

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
