# Security Policy

## Security model

NomadTTY is a **self-hosted** web terminal. The security posture depends entirely on
your deployment:

- ttyd listens on `127.0.0.1` only and is never exposed directly to the network.
- nginx is the only public-facing component. It proxies ttyd and injects `kb.js`.
- **There is no authentication built in.** You are responsible for restricting access
  to whatever network segment can reach nginx. **[Tailscale](https://tailscale.com) (or
  another VPN) is one option, not a requirement** — it's the right call if you want
  remote access without exposing NomadTTY to the public internet. Plenty of valid setups
  don't need it: a plain trusted LAN (with your router/firewall keeping it off the public
  internet), or purely local hosting (nginx bound to `127.0.0.1`/`localhost` only, no
  network exposure at all) are equally legitimate, first-class choices. Whichever you
  pick, add `NOMADTTY_BASIC_AUTH` (see the config table) if more than one person can
  reach that segment and you want a login prompt in front of the UI.
- Sessions persist in a tmux session per terminal. Anyone who can reach nginx can reach
  your shell.

## Supported versions

Only the latest commit on `main` is actively maintained.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use [GitHub private security advisories][advisories] to report confidentially. Include:

- A description of the vulnerability and its impact.
- Steps to reproduce or a proof-of-concept.
- Your suggested fix, if you have one.

You will receive a response within **7 days**. If the issue is confirmed, a fix will be
released and you will be credited in the release notes unless you prefer otherwise.

[advisories]: https://github.com/shifulegend/nomadtty/security/advisories/new

## Automated dependency scanning

GitHub Dependabot is configured (`.github/dependabot.yml`) to scan:

- **Docker** — the `alpine:3.20` base image and any apk-pinned versions
- **GitHub Actions** — workflow action versions in `.github/workflows/`

Dependabot raises automated PRs when new versions or CVE patches are available.
Review and merge dependency PRs promptly; do not auto-merge without reading the diff.

## Known hardening recommendations

| Recommendation | Priority | Status |
|----------------|----------|--------|
| Deploy behind Tailscale or a VPN | **High if exposed beyond a trusted LAN** | Optional, not required — see the Tailscale Setup section of README.md. A trusted LAN or purely local (loopback-only) hosting is an equally valid choice that doesn't need this at all; not automated by `install.sh` either way (a VPN is a separate tool/tunnel, not something an installer should silently require) |
| Enable HTTPS (Let's Encrypt / Tailscale Serve) | **High** | **Available**: `install.sh NOMADTTY_TLS=certbot NOMADTTY_TLS_EMAIL=you@example.com` obtains and auto-renews a Let's Encrypt cert via `certbot --nginx` (requires a real, publicly-resolvable `NOMADTTY_HOST`). Tailscale Serve remains the alternative for Tailscale-only deployments. |
| Add nginx `auth_basic` or OAuth2 proxy | **High** | **Available (auth_basic)**: `install.sh NOMADTTY_BASIC_AUTH=user:password` adds a Basic Auth layer in front of the Session Manager/terminal UI, independent of `MCP_AUTH_TOKEN`. A full OAuth2 proxy is not implemented — that's a heavier integration (a separate reverse-proxy layer) left to operators who need it. |
| Run the backend as a non-root deploy user | **Required** | `NOMADTTY_USER` in `install.sh`/`systemd/nomadtty.service` — do not change to root |
| Rate-limit nginx connections | **Medium** | **Done**: `limit_req_zone`/`limit_req` (10r/s, burst 20) is on by default in `nginx/ttyd.conf` itself, not just documented |
| Restrict `server_name` to your exact hostname | **Medium** | **Done**: `install.sh` validates `NOMADTTY_HOST` against a hostname regex before use |
| Enable `Content-Security-Policy` header in nginx | **Low** | Not yet implemented — reduces XSS surface, but requires compatibility testing against `kb.js`'s inline WebSocket hook and ttyd's bundled xterm.js first; tracked in `docs/ai/project-overview.md`'s TODO list |
