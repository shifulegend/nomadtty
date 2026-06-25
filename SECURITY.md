# Security Policy

## Security model

NomadTTY is a **self-hosted** web terminal. The security posture depends entirely on
your deployment:

- ttyd listens on `127.0.0.1` only and is never exposed directly to the network.
- nginx is the only public-facing component. It proxies ttyd and injects `kb.js`.
- **There is no authentication built in.** You are responsible for restricting access —
  Tailscale, nginx `auth_basic`, firewall rules, or equivalent.
- The recommended deployment is behind [Tailscale](https://tailscale.com) so the
  terminal is never on the public internet.
- Sessions persist in a tmux session (`main`). Anyone who can reach nginx can reach
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

- **Docker** — the `ubuntu:24.04` base image and any apt-pinned versions
- **GitHub Actions** — workflow action versions in `.github/workflows/`

Dependabot raises automated PRs when new versions or CVE patches are available.
Review and merge dependency PRs promptly; do not auto-merge without reading the diff.

## Known hardening recommendations

| Recommendation | Priority | Notes |
|----------------|----------|-------|
| Deploy behind Tailscale or a VPN | **High** | Never expose port 80/443 publicly without authentication |
| Enable HTTPS (Let's Encrypt / Tailscale Serve) | **High** | Required for `navigator.clipboard` API; reduces session-hijacking risk |
| Add nginx `auth_basic` or OAuth2 proxy | **High** | Extra authentication layer in front of nginx |
| Run ttyd as the deploy user (not root) | **Required** | `User=ubuntu` in systemd service — do not change |
| Rate-limit nginx connections | **Medium** | `limit_req_zone` prevents brute-force against the terminal endpoint |
| Restrict `server_name` to your exact hostname | **Medium** | Prevents host-header injection; set `NOMADTTY_HOST` to a real domain |
| Enable `Content-Security-Policy` header in nginx | **Low** | Reduces XSS surface; requires testing with ttyd's bundled xterm.js |
