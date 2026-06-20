# Security Policy

## Security model

NomadTTY is a **self-hosted** web terminal. The security posture depends entirely on your deployment:

- ttyd listens on `127.0.0.1` only and is never exposed directly to the network.
- nginx is the only public-facing component. It proxies ttyd and injects `kb.js`.
- **There is no authentication built in.** You are responsible for restricting access — Tailscale, nginx `auth_basic`, firewall rules, or equivalent.
- The recommended deployment is behind [Tailscale](https://tailscale.com) so the terminal is never on the public internet.
- Sessions persist in a tmux session (`main`). Anyone who can reach nginx can reach your shell.

## Supported versions

Only the latest commit on `main` is actively maintained.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use [GitHub private security advisories](https://github.com/shifulegend/nomadtty/security/advisories/new) to report confidentially. Include:

- A description of the vulnerability and its impact.
- Steps to reproduce or a proof-of-concept.
- Your suggested fix, if you have one.

You will receive a response within **7 days**. If the issue is confirmed, a fix will be released and you will be credited in the release notes unless you prefer otherwise.

## Known hardening recommendations

- Run behind Tailscale or a VPN — do not expose port 80/443 to the public internet without authentication.
- Add nginx `auth_basic` or OAuth2 proxy for an additional auth layer.
- Enable HTTPS (Let's Encrypt / Tailscale Serve) — required for `navigator.clipboard` API and reduces risk of session hijacking.
- The systemd service runs as the deploy user (not root). Do not change this.
