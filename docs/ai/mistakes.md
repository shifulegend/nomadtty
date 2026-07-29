# NomadTTY — Mistake Log
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-07-29 -->
<!-- update immediately when a mistake is found; propagate lessons to engineering-rules.md -->

---

### [2026-07-29-010] get_screenshot/scroll_buffer showed near-empty content on a fresh session
- **Timestamp**: 2026-07-29 04:35 UTC
- **Summary**: `captureViewport(tmuxName, { offsetFromBottom: 0 })` (backing `get_screenshot` and the live view in
  `scroll_buffer`) computed `end = -offsetFromBottom` (i.e. `0`) and `start = end - height + 1`, anchoring
  the captured range on tmux row 0 (the pane's fixed top) rather than the cursor's current row. On a
  session that hadn't yet filled its whole pane, this returned only the first line or two of real content
  and cut off everything after it (the actual command output and the next prompt) — the exact same class of
  bug as 2026-07-29-008's `captureTail`, in the same file, missed when only `captureTail` was fixed.
- **Root cause**: Never anchored `captureViewport` on `#{cursor_y}` when fixing the sibling bug in
  `captureTail`. The bug was masked in prior manual testing because that test used a `seq 1 200` session
  whose pane was already completely full, where `cursor_y` happens to equal `height - 1` — coincidentally
  matching the buggy formula's assumption and hiding the defect.
- **Affected files**: `server/mcp/tmux.js` (`captureViewport`)
- **Detection method**: Ran `scripts/verify-mcp-agent.mjs` (a genuinely independent, from-scratch MCP client)
  against a *freshly created* session — `get_screenshot` returned only the echoed input line, not the
  command's real output or the next prompt, even though `type_command` had clearly succeeded.
- **Correction**: Anchor `captureViewport` on `#{cursor_y}` exactly like `captureTail`:
  `end = cursorY - offsetFromBottom`, `start = end - height + 1`. Re-verified both the previously-broken
  fresh-session case and the previously-passing full-pane case (`scroll_buffer` up/down) after the fix.
- **Prevention rule**: When one of several sibling functions sharing the same coordinate-system bug gets
  fixed, audit every other function using that same coordinate system before considering the bug closed —
  and prefer testing against a fresh/sparse session over an artificially full one, since a full pane can
  coincidentally mask an anchor-point bug that a sparse one exposes immediately.

### [2026-07-29-009] Playwright: "wait for 2 occurrences" flaked when a redraw split the echoed input
- **Timestamp**: 2026-07-29 04:15 UTC
- **Summary**: `tests/helpers/ws-capture.js`'s `waitForOutputCount(marker, 2)` (added to distinguish a
  command's real stdout from the PTY's echo of what was typed) intermittently timed out in
  `specs/terminal-interaction.spec.js`'s viewport-resize test. Root cause: the resize itself triggered a
  terminal redraw that landed mid-typing, splitting the echoed *input* text into two writes (e.g.
  `"...resiz"` then a redraw then `"e"`) — so the exact substring never appeared a second time as one
  contiguous run, even though the command executed and its real stdout line was intact and present.
- **Root cause**: Raw substring occurrence-counting assumes both the echoed input and the real output are
  each written as one contiguous chunk. A redraw (resize, tmux status-bar refresh, prompt reflow, etc.) can
  interleave escape sequences into the *input* echo mid-word; the real stdout write is not subject to the
  same interleaving since it isn't happening concurrently with keystroke-by-keystroke typing.
- **Affected files**: `tests/helpers/ws-capture.js`, `tests/specs/terminal-interaction.spec.js`,
  `tests/specs/session-persistence.spec.js`
- **Detection method**: Ran the suite repeatedly back-to-back (not just once) after an unrelated backend
  change and caught an intermittent failure; the captured buffer in the error message showed the marker
  text visibly split by an escape sequence mid-word.
- **Correction**: Added `waitForOutputLine(line)` — matches `line` only when it appears as a complete line
  on its own (preceded by a newline/buffer-start, followed by `\r\n`), which uniquely identifies the real
  stdout write regardless of whether the *input* echo got split by a redraw. Replaced all
  `waitForOutputCount(x, 2)` call sites with it; kept `waitForOutputCount` for cases that only need a
  presence check, not a genuine-execution proof.
- **Prevention rule**: When asserting "a command genuinely produced output" (not just "input was accepted")
  against a raw PTY stream, match the output as its own complete line, not as a repeated substring count —
  and always run a new terminal-output assertion strategy several times back-to-back before trusting a
  single green run, especially around resize/redraw-triggering actions.

### [2026-07-29-008] read_terminal_contents "tail" returned blank lines on a fresh session
- **Timestamp**: 2026-07-29 03:50 UTC
- **Summary**: `captureTail(tmuxName, n)` computed its `tmux capture-pane -S <start>` start line as
  `pane_height - n`, i.e. anchored to the pane's fixed geometric height. On a freshly created session (only
  a prompt line printed), most of that geometric height is unused blank space below the cursor, so the
  "last N lines" came back as N blank lines instead of the actual last N lines of real output. The MCP
  server's `read_terminal_contents` follow-mode diffing was built on top of this, so it silently never
  detected real content changes either (comparing blank-vs-blank forever).
- **Root cause**: tmux's `capture-pane -S/-E` row numbering spans the pane's full rendered height
  regardless of how much of it is actually populated; "last N lines of real content" and "last N rows of
  the rendered viewport" are only the same thing once the pane happens to be completely full.
- **Affected files**: `server/mcp/tmux.js` (`captureTail`), `server/mcp/tools.js` (`read_terminal_contents`
  follow mode, `full` mode's total-line estimate)
- **Detection method**: Manually drove the MCP server's `read_terminal_contents`/`follow` mode end-to-end
  against a freshly created session and saw only blank content, then confirmed via `tmux capture-pane -S 0
  -E <n>` by hand that real content sat at low row numbers while the "tail" math was reading from high ones.
- **Correction**: Anchor `captureTail` on `#{cursor_y}` (the cursor's current row — i.e., where the last
  real output line sits) instead of `#{pane_height}`: `start = cursorY - n + 1`, `end = cursorY`.
- **Prevention rule**: Any tmux capture-pane range meant to represent "the end of real content" must be
  anchored on `#{cursor_y}`, never on `#{pane_height}` — height describes the rendered viewport, not how
  much of it has been written to.

### [2026-07-29-007] tmux `-F` format strings silently replace literal tabs with `_`
- **Timestamp**: 2026-07-29 03:45 UTC
- **Summary**: Used `#{history_size}\t#{pane_width}\t#{pane_height}\t#{pane_pid}` (a literal tab between
  fields) as a `tmux display-message -F` format string, intending to split the result on tabs. tmux returned
  `0_80_24_28043` — every tab character was replaced with `_`, so splitting on `\t` produced one field
  containing the whole underscore-joined string, and `Number()` on it produced `NaN`/`undefined` for every
  field after the first, which `JSON.stringify` then silently dropped from tool output entirely.
- **Root cause**: tmux's format-string engine sanitizes literal control characters (including a literal tab
  byte appearing directly in the format string) to `_` before returning output — it does not preserve them
  as a delimiter the way a shell/printf format string would.
- **Affected files**: `server/mcp/tmux.js` (`getPaneInfo`)
- **Detection method**: `get_screenshot`'s tool output was missing `width`/`height` fields entirely, with no
  error thrown (JSON.stringify just omits `undefined` values); reproduced by calling `getPaneInfo` directly
  in Node and comparing against a manual `tmux display-message` invocation.
- **Correction**: Use `|` (or any character tmux won't sanitize) as the field separator instead of `\t`.
- **Prevention rule**: Never use a literal tab (or other control character) as a field separator in a tmux
  `-F` format string. Use a plain printable delimiter like `|`.

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
