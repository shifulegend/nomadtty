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

# Alpine, not Ubuntu: ttyd/nodejs/npm/nginx/tmux are all available via apk
# (community repo) — the original 2026-06-20 decision to use Ubuntu because
# "alpine has no ttyd apt package" was re-checked and found incorrect (or
# outdated) when actually tested; see docs/ai/decision-log.md's 2026-07-30
# entry for the size comparison (~4x smaller) and end-to-end verification.
FROM alpine:3.20

# ttyd/tmux: spawned per-session by the Node backend (server/session-manager.js).
# nginx: reverse-proxies to the Session Manager. nodejs/npm: run the backend.
# openssl: MCP_AUTH_TOKEN generation. curl/ca-certificates: health checks + TLS.
RUN apk add --no-cache \
    ttyd \
    tmux \
    nginx \
    nodejs \
    npm \
    openssl \
    curl \
    ca-certificates

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
# session — no separate sub_filter injection needed in this vhost. Alpine's
# nginx package auto-includes every *.conf under /etc/nginx/http.d/ (its
# equivalent of Debian/Ubuntu's sites-enabled), so no separate symlink step.
COPY nginx/ttyd.conf /etc/nginx/http.d/nomadtty.conf
RUN rm -f /etc/nginx/http.d/default.conf

# Patch nginx config: listen on any hostname by default; container users can
# set their own domain via the NOMADTTY_HOST env var at `docker run` time.
RUN sed -i 's/server_name terminal\.yourdomain\.com/server_name _/' \
        /etc/nginx/http.d/nomadtty.conf

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 80: nginx (Session Manager UI + terminals). 4200: MCP server (only reaches
# clients if published with `-p 4200:4200`; requires MCP_AUTH_TOKEN — see
# docker-entrypoint.sh).
EXPOSE 80 4200

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
