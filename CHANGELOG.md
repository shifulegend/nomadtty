# Changelog

All notable changes to NomadTTY are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project's version scheme follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Critical**: `Dockerfile` and `install.sh` served `502 Bad Gateway` on every
  request — nginx had been pointed at the Node Session Manager (`:4000`)
  since an earlier commit, but the Docker/install paths still ran raw `ttyd`
  standalone on the old port. Both now install Node.js and run
  `server/main.js` (Session Manager + MCP), matching production.
- `install.sh`'s new `NOMADTTY_BASIC_AUTH` htpasswd file was unreadable by
  nginx's `www-data` worker process, causing every request to `500` instead
  of enforcing auth. Fixed with `chown root:www-data`.

### Added
- `install.sh` now installs and runs the full Session Manager + MCP backend
  (previously a separate, undocumented manual process), including
  auto-generating and persisting `MCP_AUTH_TOKEN`.
- `install.sh` options: `NOMADTTY_INSTALL_DIR`, `NOMADTTY_BRANCH`,
  `NOMADTTY_REPO_URL`, `NOMADTTY_LOCAL_SOURCE` (offline/local-checkout installs).
- `install.sh` optional automatic HTTPS via `NOMADTTY_TLS=certbot` +
  `NOMADTTY_TLS_EMAIL` (Let's Encrypt via `certbot --nginx`).
- `install.sh` optional nginx Basic Auth via `NOMADTTY_BASIC_AUTH=user:password`.
- `nginx/ttyd.conf` now rate-limits the terminal endpoint by default
  (`limit_req_zone`/`limit_req`, 10r/s burst 20).
- `install.sh --help`/`--version` and `node server/main.js --help`/`--version`.
- `docker-entrypoint.sh` auto-generates `MCP_AUTH_TOKEN` per container start
  if not supplied, printing it once via `docker logs`.
- `docs/competitive-analysis.md`: a closed-source-style adoption-readiness
  review comparing NomadTTY against best-in-class self-hosted tools and the
  top web-terminal projects on GitHub.

### Changed
- `Dockerfile` base image bumped to `ubuntu:26.04` (previously `24.04`, via
  an earlier Dependabot update that predates this changelog).

## [0.2.0]
Everything up to and including the Session Manager + multi-session
architecture, the MCP server (10 tools for AI-agent terminal access), the
mobile keyboard toolbar (`src/kb.js`), rigorous mobile UX/stress testing via
Playwright device emulation, and the full community-health file set
(CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, SUPPORT, issue/PR templates). See
`docs/ai/decision-log.md` for the detailed history of these decisions —
this changelog starts tracking notable changes going forward from here
rather than reconstructing the full prior history retroactively.
