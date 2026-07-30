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
- `install.sh` re-runs now preserve `NOMADTTY_HOST`/`NOMADTTY_TLS`/
  `NOMADTTY_BASIC_AUTH`/etc. instead of silently resetting them to defaults
  unless re-supplied identically every time.
- `install.sh`'s health check could silently abort the whole script under
  `set -e` before ever printing its own diagnostic output, on any real
  connection failure.
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
- `.env.example` documenting every `server/**` runtime env var, for developers
  running `node server/main.js` directly without `install.sh`.
- `install.sh --help`/`--version` and `node server/main.js --help`/`--version`.
- `docker-entrypoint.sh` auto-generates `MCP_AUTH_TOKEN` per container start
  if not supplied, printing it once via `docker logs`.
- `docs/competitive-analysis.md`: a closed-source-style adoption-readiness
  review comparing NomadTTY against best-in-class self-hosted tools and the
  top web-terminal projects on GitHub.

### Changed
- `Dockerfile` base image switched to `alpine:3.20` (previously `ubuntu:26.04`,
  itself bumped from `24.04` via an earlier Dependabot update predating this
  changelog) — ~4x smaller image (163MB vs. 686MB), zero functional change.
  The original "Alpine has no ttyd package" rationale for avoiding it turned
  out to be simply incorrect when actually checked.
- CI (`.github/workflows/ci.yml`) gained an `nginx-config` job (validates
  `nginx/ttyd.conf` with a real `nginx -t`) and a `playwright` job (runs the
  full test suite on every push/PR) — previously only `shellcheck` and
  `docker-build` ran in CI.

## [0.2.0]
Everything up to and including the Session Manager + multi-session
architecture, the MCP server (10 tools for AI-agent terminal access), the
mobile keyboard toolbar (`src/kb.js`), rigorous mobile UX/stress testing via
Playwright device emulation, and the full community-health file set
(CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, SUPPORT, issue/PR templates). See
`docs/ai/decision-log.md` for the detailed history of these decisions —
this changelog starts tracking notable changes going forward from here
rather than reconstructing the full prior history retroactively.
