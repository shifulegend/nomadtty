# NomadTTY — Engineering Rules
<!-- canonical source of truth | update this file first, then sync tool adapters -->
<!-- last updated: 2026-06-20 -->

## Modularity Requirements
- **One responsibility per file.** `kb.js` handles only toolbar UI and PTY input.
  nginx config handles only routing and injection. These concerns must never merge.
- **No logic in `docker-entrypoint.sh`** beyond service startup sequencing.
  Operational logic belongs in config files or environment variables.
- **Functions in `kb.js` must be small** (< 30 lines each) and named for what they
  do, not how they do it. Global handlers (`KN`, `KA`, `KF`, `KM`, `TFN`, `KZ`)
  are intentionally short because they are called from inline HTML `onclick`.
- Any new feature to the toolbar must be added as a new named handler or
  by extending the existing NAV/FK tables — not by duplicating send logic.
- nginx config changes must not break the `sub_filter` injection chain.
  The three elements (viewport meta, WS hook, kb.js script tag) must remain
  in a single `sub_filter` replacement string and in that order.

## No-Hardcoding / Configurability Rules
- **ttyd port** is configurable via `TTYD_PORT` env var (default: 47821).
  Never hardcode 47821 anywhere except as the default fallback.
- **Domain/hostname** is configurable via `NOMADTTY_HOST` env var (default: `_`).
  Never hardcode a domain in config files; use `yourdomain.com` as a placeholder.
- **nginx web root** (`/var/www/nomadtty`) is defined once in `nginx/ttyd.conf`
  and in `install.sh`. If it changes, update both atomically.
- **tmux session name** (`main`) is set only in `systemd/ttyd.service`
  and `docker-entrypoint.sh`. Extract to env var if more than one session
  name is ever needed.
- Zoom levels, button labels, and key sequences in `kb.js` are defined in
  the `NAV`, `FK`, and `FK_CODES` tables at the top of the IIFE — not
  scattered through the button-building code.

## Code Organisation Expectations
- `src/kb.js` must remain a **single IIFE** with no external dependencies.
  It runs in ttyd's page context after injection; it cannot import modules.
- Key sequence tables (`NAV`, `FK`, `FK_CODES`) must be declared at the
  top of the IIFE so they are easy to audit against xterm escape sequences.
- CSS is inlined via a `<style>` tag created by `kb.js` (no external CSS file).
  This is intentional: one HTTP round-trip for the toolbar.
- **nginx config files** use `# NomadTTY —` comment headers so `grep` can
  locate them quickly across a multi-site nginx install.
- Shell scripts (`install.sh`, `docker-entrypoint.sh`) must use `set -euo pipefail`.
- **No silent failures**: shell scripts must emit clear error messages to stderr
  before any `exit 1`.

## Verification Expectations
- After any change to `src/kb.js`:
  1. Reload nginx (`sudo systemctl reload nginx` or container restart).
  2. Open `http://terminal.pz.net/` (or configured host) in a browser.
  3. Confirm toolbar renders at top of page with two visible rows of buttons.
  4. Open DevTools console — zero JS errors expected.
  5. Send a key sequence (e.g., click ESC) and confirm it reaches the PTY
     (check tmux pane or observe terminal response).
  6. Test CTRL toggle: tap CTRL (turns blue), type a letter, confirm it was
     intercepted by the `keydown` listener and sent as a control byte.
  7. Test Fn toggle: tap Fn, confirm F1–F12 row appears.
- After any change to `nginx/ttyd.conf`:
  1. Run `sudo nginx -t` — must pass with zero errors (warnings about duplicate
     MIME types from other vhosts are acceptable).
  2. Run `sudo systemctl reload nginx`.
  3. `curl -s http://terminal.pz.net/ | grep 'kb.js'` must return a match.
- After any change to `install.sh`:
  1. Shellcheck the script: `shellcheck install.sh`.
  2. ASSUMPTION: a clean VM test is preferred but not always available.
- After any Dockerfile change:
  1. `docker build -t nomadtty-test .` must succeed.
  2. `docker run --rm -p 18080:80 nomadtty-test` — open `http://localhost:18080`
     and confirm toolbar and terminal load.

## Definition of Done
A task is done when:
- [ ] Code changes are complete and follow the rules above.
- [ ] Manual verification was performed per the Verification Expectations above.
- [ ] Any newly discovered durable rule is added to this file.
- [ ] `docs/ai/change-trace.md` has a new entry.
- [ ] `docs/ai/mistakes.md` is updated if a mistake was found.
- [ ] `docs/ai/decision-log.md` is updated if an architectural decision was made.
- [ ] Tool-specific adapter files are synchronized (see `docs/ai/tool-sync-policy.md`).
- [ ] A commit checkpoint is proposed or executed.

## Security / Safety Constraints
- ttyd **must** listen on `127.0.0.1` only, never `0.0.0.0`. Network exposure
  is nginx's responsibility. This prevents direct unauthenticated PTY access.
- ttyd **must** be started with `--writable`. Without it the terminal is read-only.
  (Historical mistake — see `docs/ai/mistakes.md` entry 2026-06-20-001.)
- nginx must not expose ttyd's port 47821 directly to external interfaces.
- `install.sh` requires root. It must validate this and exit clearly if not root.
- `NOMADTTY_HOST` must be sanitised before being injected into nginx config via
  `sed`. TODO: add regex validation in `install.sh`.
- The inline WS hook script in `sub_filter` must not grow beyond ≈300 B minified.
  Exceeding nginx's sub_filter parameter limit (≈4 KB) causes silent injection failure.
- Docker image: `User=root` is needed because ttyd requires PTY creation privileges.
  This is documented and accepted. Do not add a non-root user without testing PTY creation.
