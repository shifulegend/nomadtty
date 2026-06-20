# NomadTTY — Mistake Log
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-06-20 -->
<!-- update immediately when a mistake is found; propagate lessons to engineering-rules.md -->

## Entry Template
```
### [YYYY-MM-DD-NNN] <short title>
- **Timestamp**: YYYY-MM-DD HH:MM UTC
- **Summary**: one-sentence description
- **Root cause**: why it happened
- **Affected files**: list
- **Detection method**: how it was caught
- **Correction**: what was done to fix it
- **Prevention rule**: durable lesson → also added to engineering-rules.md / adapter files
```

---

### [2026-06-20-006] sed mangled nginx sub_filter replacement string
- **Timestamp**: 2026-06-20 05:55 UTC
- **Summary**: `sed -i` on the nginx config corrupted the `sub_filter` line because the
  replacement string contained `/`, `&`, and other chars with special meaning in sed.
- **Root cause**: sed's `s///` delimiter conflicts with URL characters and `&&` in JS.
- **Affected files**: `nginx/ttyd.conf`, `/etc/nginx/sites-available/tailscale-router`
- **Detection method**: `grep sub_filter` revealed doubled/mangled lines.
- **Correction**: Rewrote entire nginx config files with `tee` heredoc instead of sed.
- **Prevention rule**: Never use `sed s///` to edit nginx `sub_filter` lines that contain
  JS or URLs. Use `tee` with a heredoc or a Python script with safe string replace.

### [2026-06-20-005] Chrome cached old toolbar-inject.js after switch to kb.js
- **Timestamp**: 2026-06-20 04:10 UTC
- **Summary**: After switching from `toolbar-inject.js` to `kb.js`, a running Chrome
  session showed the old red "TOOLBAR TEST" bar instead of the new toolbar.
- **Root cause**: Chrome cached the previous script; `Cache-Control: no-cache` only
  prevents future caching, not immediate cache eviction in a live tab.
- **Affected files**: `src/kb.js`, `nginx/ttyd.conf`
- **Detection method**: CDP screenshot showed unexpected red bar with old text.
- **Correction**: Killed Chrome process and started fresh with `--disk-cache-size=1`.
- **Prevention rule**: When renaming a served JS file, always hard-reload (Shift+F5 or
  clear cache) before taking a verification screenshot. Old tab state ≠ new deployment.

### [2026-06-20-004] nginx sub_filter parameter too long (inline CSS+HTML+JS attempt)
- **Timestamp**: 2026-06-20 03:30 UTC
- **Summary**: Attempted to inline the entire toolbar (CSS + HTML + JS) in a single
  `sub_filter` replacement string (6 453 B). nginx rejected it with "too long parameter".
- **Root cause**: nginx's `sub_filter` module has a ≈4 KB limit per parameter string.
- **Affected files**: `nginx/ttyd.conf`
- **Detection method**: `nginx -t` returned error; `sudo systemctl reload nginx` failed.
- **Correction**: Split into (a) tiny inline WS hook in sub_filter and (b) external `/kb.js`.
- **Prevention rule**: The inline sub_filter replacement must remain < 500 B. All toolbar
  logic stays in external `src/kb.js`. Document this limit in `engineering-rules.md`.

### [2026-06-20-003] dnsmasq ExecStartPre shell operators not wrapped in /bin/sh -c
- **Timestamp**: 2026-06-20 02:15 UTC
- **Summary**: `ExecStartPre=iptables ... || iptables ...` failed with "Bad argument '||'"
  because systemd does not interpret shell operators in `ExecStartPre`.
- **Root cause**: systemd's `Exec*` fields are not shell commands; `||` needs explicit shell.
- **Affected files**: `/etc/systemd/system/dnsmasq.service.d/tailscale-wait.conf`
- **Detection method**: `systemctl status dnsmasq` showed ExecStartPre failure.
- **Correction**: Wrapped the entire command in `/bin/sh -c '... || ...'`.
- **Prevention rule**: All multi-command logic in systemd `Exec*` fields must be wrapped
  in `/bin/sh -c '...'` or extracted to a shell script.

### [2026-06-20-002] ttyd started on wrong port 7681 (default apt service conflicted)
- **Timestamp**: 2026-06-20 01:50 UTC
- **Summary**: ttyd was running on port 7681 (apt default) instead of 47821 because
  the apt-installed default `ttyd.service` was already running and wasn't replaced.
- **Root cause**: `systemctl daemon-reload` was not run after placing the custom service file.
- **Affected files**: `/etc/systemd/system/ttyd.service`
- **Detection method**: `ss -tlnp | grep ttyd` showed port 7681 instead of 47821.
- **Correction**: `sudo systemctl daemon-reload && sudo systemctl restart ttyd`.
- **Prevention rule**: Always run `daemon-reload` immediately after writing a systemd unit
  file. Verify the active port with `ss -tlnp | grep ttyd` before testing the nginx proxy.

### [2026-06-20-001] ttyd started in read-only mode (--writable flag missing)
- **Timestamp**: 2026-06-20 01:30 UTC
- **Summary**: The terminal accepted input but it was not forwarded to the PTY. ttyd
  was started without `--writable`, making the session display-only.
- **Root cause**: Forgot to include `--writable` flag in `ExecStart`.
- **Affected files**: `/etc/systemd/system/ttyd.service`, `systemd/ttyd.service`
- **Detection method**: Typed in terminal — no response from shell.
- **Correction**: Added `--writable` to `ExecStart` in the service file.
- **Prevention rule**: `--writable` is mandatory and must always appear in `ExecStart`.
  It is now hardcoded in `systemd/ttyd.service` and `docker-entrypoint.sh`.
  Never remove it without an explicit security justification in the decision log.
