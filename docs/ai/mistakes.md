# NomadTTY — Mistake Log
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-07-30 -->
<!-- update immediately when a mistake is found; propagate lessons to engineering-rules.md -->

---

### [2026-07-30-007] install.sh hard-crashed with no fallback on any host without systemd as PID 1
- **Timestamp**: 2026-07-30 UTC
- **Summary**: Found via a real, zero-context sub-agent validation test (fresh Ubuntu
  26.04 Docker container, given only the install one-liner and told to follow nothing
  but the tool's own `--help`/stdout, per the user's explicit "validate self-
  explanatoriness" request). The installer got all the way through cloning, `npm ci`,
  and nginx config before hard-crashing at `systemctl daemon-reload` with
  `bash: line 299: systemctl: command not found`, exit code 127 under `set -e`, with
  **zero output printed afterward** — no partial summary, no manual-start hint, nothing.
  `install.sh --help` also documented no flag/env var for this case. A container/minimal-
  image target with no init system is not an edge case — it's a completely normal "fresh
  machine" for exactly the kind of one-command install this script advertises.
- **Root cause**: `install.sh`'s service-configuration step (`systemctl daemon-reload`,
  `systemctl enable --now nomadtty`, `systemctl reload nginx`) assumed systemd is always
  running as PID 1 with no detection or fallback at all.
- **Affected files**: `install.sh`.
- **Detection method**: real end-to-end sub-agent run against a genuinely fresh
  container, not a code read — the bug was invisible to `shellcheck`/review since the
  script is syntactically fine, it just has an unconditional systemd dependency.
- **Correction**: `install.sh` now detects PID-1 systemd (`command -v systemctl` AND
  `/run/systemd/system` existing — the former alone is insufficient, since the binary can
  be present via a base image's package set with no init actually running) and falls back
  to `start-stop-daemon` (part of `dpkg`, always present on Debian/Ubuntu) for process
  management: start/stop/idempotent-restart, privilege drop to `NOMADTTY_USER`, and a
  PID file at `/var/run/nomadtty.pid`. Verified empirically in this sandbox before
  committing: (1) env vars exported into the installer's own shell before calling
  `start-stop-daemon --chuid` ARE inherited by the started process; (2) only a *single*
  `exec node server/main.js >>log 2>&1` with no trailing shell statements keeps the
  spawned process at the exact PID recorded in the pidfile — a compound `cmd1; cmd2`
  script forks an extra, untracked child for the final command instead; (3) a full
  install run, an idempotent re-run (old process cleanly stopped, new one started, token
  preserved), and a real MCP `initialize` → `create_session` round trip all passed
  end-to-end in a fresh container. nginx also needed an explicit first-start (`nginx`) vs.
  `nginx -s reload` on re-runs, since minimal container images' package postinst scripts
  commonly skip auto-starting services (`policy-rc.d`).
- **Prevention rule**: Any installer step that assumes a specific init system/service
  manager must detect it first and provide a real, tested fallback — not just document
  the assumption. Verify process-management primitives (env inheritance across a
  privilege-drop, PID tracking through an exec chain, redirection under `--background`)
  empirically in a real disposable container before trusting them, rather than assuming
  standard-sounding tool behavior from memory.

---

### [2026-07-30-006] Five "known pre-existing flaky/failing" tests were treated as environment noise instead of being root-caused — all had real, fixable causes
- **Timestamp**: 2026-07-30 UTC
- **Summary**: Two tests (`list_active_ports`, the Hist/copy-mode test) had been confirmed
  failing consistently in this sandbox on both this session's changes and a clean
  checkout, and three more (`get_screenshot`, `type_command` `submit:false`,
  `send_keystroke` Ctrl+C) were already documented in `tests/README.md` as "repeatably
  flaky on a 2-core machine... not yet root-caused." Per explicit user instruction ("no
  preexisting errors are to be left unfixed"), all five were investigated properly
  instead of continuing to treat them as unavoidable environment noise — every one had a
  real, specific, fixable cause; none were actually "just flaky."
- **Root causes and corrections** (see `docs/ai/decision-log.md`'s matching entry for
  full detail):
  1. `list_active_ports` — `server/mcp/tmux.js`'s `listeningSockets()` only tried `ss`,
     with no `netstat`/procfs fallback; a missing `ss` binary silently produced an empty
     port list instead of a surfaced error. **Fixed**: added a pure-Node
     `/proc/net/{tcp,udp}{,6}` parsing fallback with best-effort inode→pid attribution.
  2. Hist/copy-mode test — `src/kb.js`'s touch-scroll handler fired one POST per
     touchmove line-crossing with zero debounce; a fast swipe could queue 100+ nearly-
     simultaneous requests, each a blocking server-side tmux subprocess spawn,
     serializing into multi-second latency. **This was a real user-facing bug**, not
     just a test artifact — any real user swiping quickly would hit it too. **Fixed**:
     coalesced pending scroll amounts into at most one in-flight request, flushed on the
     next animation frame.
  3. `type_command` `submit:false` — asserted "text not yet executed" with zero
     delay/poll immediately after `type_command` returned, racing the shell's own echo
     of the (unsubmitted) text into the pane buffer. **Fixed**: poll until the marker
     first appears (echo landed), then assert it appears exactly once (not executed).
  4. `send_keystroke` Ctrl+C — precondition matched the echoed *input* line
     (`content.includes('sleep 30')`), not proof `sleep` had actually been forked as the
     pty's foreground process; under contention the fork/exec-vs-interrupt race could be
     lost. **Fixed**: poll `get_process_status` (mirroring an existing sibling test's
     pattern) until `sleep` genuinely appears in the process tree before sending `C-c`.
  5. `get_screenshot` — not a logic bug; the first test in the file to pay real
     session-creation cold-start latency on top of this codebase's one-subprocess-per-
     tmux-call architecture, against a shared 8s poll default that's admittedly marginal
     under load. **Fixed**: a longer, test-scoped poll timeout (15s), not a change to the
     shared default (would have loosened every other test's timing assertions).
- **Detection method**: Three parallel Explore-agent investigations, each reading the
  actual test body, the exact tool implementation, and the underlying tmux/OS primitives
  it exercises — not just re-running the suite and hoping the failures wouldn't recur.
- **Correction**: See the five fixes above. Verified with 3 full, consecutive 63/63
  Playwright runs (not one) after all five fixes landed.
- **Prevention rule**: "Confirmed pre-existing, reproduces on a clean checkout" proves a
  failure isn't *this session's* regression — it does not prove the failure is
  unfixable, or that it's purely an environment artifact safe to keep working around.
  Documenting a flaky test as "known, not yet root-caused" is a legitimate short-term
  triage step, but it is not a resolution — treat it as an open item to actually
  investigate (reading the real code path the test exercises, not just re-running it)
  the next time there's room to do so, rather than a permanent, accepted cost.

---

### [2026-07-30-004] "Alpine has no ttyd apt package" was never actually true — an unverified assumption carried for over a month
- **Timestamp**: 2026-07-30 UTC
- **Summary**: The 2026-06-20 decision to base the Dockerfile on Ubuntu instead of
  Alpine gave, as its stated rationale, "Alpine (no ttyd apt package)... would require
  compiling ttyd from source." Re-evaluating the base image for size (competitive-
  analysis backlog item 20), actually checking (`apk search`, and separately confirmed
  via Alpine's public package index) showed `ttyd` has been in Alpine's `community` repo
  since at least 2024-04-02 — over a year before the original decision was made, and
  over two years before this correction. `nodejs`, `npm`, `nginx`, and `tmux` are all
  present too. The claim was wrong from the moment it was written, not just outdated.
- **Root cause**: The original decision was recorded without actually running `apk
  search ttyd` (or equivalent) against a real Alpine image — an assumption was stated as
  fact and then propagated into `docs/ai/decision-log.md` and `.claude/rules/infra.md`
  ("Do not switch to alpine without testing ttyd availability" — ironic, since the
  original decision itself never did that test either) without anyone independently
  re-verifying it until this session.
- **Affected files**: `Dockerfile` (base image switched to `alpine:3.20`),
  `docker-entrypoint.sh` (nginx vhost path), `docs/ai/decision-log.md`,
  `.claude/rules/infra.md`, `docs/ai/project-overview.md`.
- **Detection method**: Ran `apk search ttyd`/`apk search nodejs nginx tmux` against a
  real `alpine:3.20` container (working around this sandbox's TLS-intercepting proxy by
  temporarily switching the apk mirror to plain HTTP for the test only — never shipped
  that way) instead of trusting the prior decision-log entry's claim. Then built and ran
  a full Alpine-based image end-to-end (real `docker build`, `docker run`, session
  creation via the HTTP API spawning genuine `ttyd`/`tmux`, MCP auth) before committing
  to the switch, and measured the resulting image against a freshly-built Ubuntu-based
  comparison image for a fair size delta.
- **Correction**: Switched `Dockerfile`'s base image to `alpine:3.20`. Result: ~163MB vs
  ~686MB for the equivalent Ubuntu-based image (~4.2x smaller), with identical verified
  behavior. `docker-entrypoint.sh`'s `NOMADTTY_HOST` sed target updated to Alpine's
  nginx vhost path (`/etc/nginx/http.d/nomadtty.conf`, not Debian/Ubuntu's
  `sites-available`/`sites-enabled`).
- **Prevention rule**: A decision-log entry's stated rationale is not automatically true
  just because it's written down and was never contradicted — when re-evaluating an old
  architectural decision (especially one explicitly flagged as a TODO for re-evaluation,
  as this one was), re-verify its original premise directly against the real tool/package
  manager before accepting or rejecting the old conclusion, rather than treating the
  prior entry itself as the source of truth about external reality.

---

### [2026-07-30-003] install.sh's own health check could silently abort the script under `set -e`, skipping its own diagnostic output
- **Timestamp**: 2026-07-30 UTC
- **Summary**: While verifying `install.sh`'s new config-persistence feature (re-running
  with no env vars should repeat a previous custom install) in a test container with no
  real nginx/backend actually running, the script exited early with no summary output at
  all, right after printing `"==> Verifying deployment..."` — silently, with no
  `WARNING`/troubleshooting lines and no final summary/uninstall-instructions block ever
  printed, even though those exist specifically to help when something's wrong.
- **Root cause**: `HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/")"`
  is a bare command-substitution assignment. Under `set -e`, if the command inside `$()`
  exits non-zero (curl's own "connection refused"/"couldn't connect" exit code, e.g. `7`),
  bash treats the *assignment statement itself* as having failed and exits the script
  immediately — before the very next line even checks `$HTTP_STATUS`. This is a genuine,
  easy-to-miss `set -e` gotcha (unlike `x=$(false) && true`, a bare `x=$(false)` on its own
  line does trip `set -e`), and it predates this session's other `install.sh` changes — the
  original health check had the exact same construct.
- **Affected files**: `install.sh` (the health-check block).
- **Detection method**: Ran the real script end-to-end in a container where nginx/the
  backend were deliberately not started (only their config was being verified), rather
  than only testing the happy path where a prior manual `nginx -g 'daemon off;'` + `node
  server/main.js` was already running in the background. The silent, summary-less exit
  was the tell — a passing health check should print `HTTP 200 OK`, a failing one should
  print `WARNING: Got HTTP ...`, but nothing printed at all.
- **Correction**: `|| true` appended to both health-check curl invocations (the plain one
  and the `-u user:pass` Basic-Auth variant), so a connection failure can never abort the
  assignment. Deliberately not `|| echo "000"`: curl's own `-w "%{http_code}"` already
  prints `"000"` on its own when no response code was received, so an additional literal
  would double up into `"000000"` — caught by testing the actual printed value, not just
  checking the exit code was now 0.
- **Prevention rule**: Any `VAR="$(cmd)"` whose whole purpose is to *observe and report* an
  external condition (a health check, an optional/best-effort probe) — as opposed to a
  step whose failure should legitimately abort the script — needs `|| true` (or equivalent)
  under `set -e`, since a bare failed command substitution assignment aborts silently,
  before the reporting logic that was the entire point ever runs. When adding such a
  fallback, verify the *actual value* produced on the failure path (not just that the
  script no longer exits early) — a tool's own error-signaling convention (like curl's
  `"000"`) can silently combine with a naively-added fallback into a wrong-but-still-truthy
  result.

---

### [2026-07-30-002] install.sh's Basic Auth htpasswd file was unreadable by nginx's worker process (every request 500'd)
- **Timestamp**: 2026-07-30 UTC
- **Summary**: Implementing `install.sh`'s new `NOMADTTY_BASIC_AUTH` option, the htpasswd
  file was created with `chmod 640` while still owned `root:root` (the default from
  redirecting `openssl passwd` output into a file as root). `nginx -t` passed and the
  service started fine, but every real HTTP request — with or without correct
  credentials — returned `500 Internal Server Error`, not the expected `401`/`200`.
- **Root cause**: nginx's worker processes run as `www-data` on Debian/Ubuntu, not root.
  `auth_basic_user_file` needs the worker to be able to `open()` the htpasswd file;
  `root:root 640` denies that to any non-root, non-root-group process. The master
  process (root) loads the config fine, masking the problem until an actual request hit
  a worker.
- **Affected files**: `install.sh` (the `NOMADTTY_BASIC_AUTH` htpasswd-generation step).
- **Detection method**: Actually sent real HTTP requests (`curl -u user:pass ...`) against
  a live nginx+Session Manager pair after enabling Basic Auth, instead of stopping at
  `nginx -t` passing — the config being syntactically valid said nothing about whether
  the *runtime* worker process could read the file it referenced. `docker exec ... cat
  /var/log/nginx/nomadtty.error.log` showed the exact `open() ... failed (13: Permission
  denied)` line that pinpointed it immediately.
- **Correction**: `chown root:www-data "$HTPASSWD_FILE"` before `chmod 640`, so the
  worker's group membership grants read access without making the file world-readable.
  Re-verified: `401` with no credentials, `401` with wrong credentials, `200` with correct
  credentials — all three cases now behave as expected.
- **Prevention rule**: `nginx -t`/a syntactically valid config proves nginx will *start*,
  not that every file it references is *readable by the process that will actually serve
  requests* (the worker, running as a different, less-privileged user than the master).
  Any new nginx directive that reads a file at request time (`auth_basic_user_file`,
  `ssl_certificate_key`, etc.) needs its ownership/permissions checked against the actual
  worker user, and verified with a real end-to-end request — not just a config-test pass.

---

### [2026-07-30-001] Docker/install.sh quickstart was completely broken (502 Bad Gateway on every request)
- **Timestamp**: 2026-07-30 UTC
- **Summary**: While scoping work to unify NomadTTY's two deployment models, actually
  built and ran the shipped `Dockerfile` (`docker build -t nomadtty . && docker run -d
  -p 80:80 nomadtty`, the exact command in README.md's "Quick Install"/"Docker" sections)
  instead of just reading it. Every request returned `502 Bad Gateway` from nginx.
- **Root cause**: Commit `55a5208` ("feat: implement mobile-friendly session manager and
  process registry") rewrote `nginx/ttyd.conf` to reverse-proxy to
  `http://127.0.0.1:4000` (the Node Session Manager) and removed its old `sub_filter`
  injection entirely — a deliberate, correct change for the *new* architecture. But
  `Dockerfile`/`docker-entrypoint.sh` (and identically, `install.sh` +
  `systemd/ttyd.service`) were never updated to match: they still `apt-get install ttyd`
  and exec raw `ttyd --port 47821 ...` directly as the backend, with nothing ever
  listening on port 4000. nginx's own config (copied verbatim into both the Docker image
  and a bare-metal `install.sh` run) has proxied to a port nothing serves ever since that
  commit landed — this was not a hypothetical/future gap, it was the actual state of the
  two most prominent install paths in the README.
- **Affected files**: `Dockerfile`, `docker-entrypoint.sh`, `install.sh`,
  `systemd/ttyd.service`, `docker-compose.yml` (all describe/ship the broken raw-ttyd
  backend against a Session-Manager-only nginx config).
- **Detection method**: Rather than trusting the existing docs/ai/project-overview.md
  "ASSUMPTION" note (which frames this as merely "two parallel unreconciled models," not
  "one of them is non-functional"), actually ran `docker build` + `docker run` +
  `curl`/`docker logs`/`docker exec ... ps aux` against the literal Dockerfile as
  committed. The response was `502 Bad Gateway`; `docker exec ps aux` confirmed only raw
  `ttyd`+nginx processes running, nothing on port 4000.
- **Correction**: See `docs/ai/decision-log.md`'s matching 2026-07-30 entry — `Dockerfile`,
  `docker-entrypoint.sh`, `install.sh`, and `systemd/nomadtty.service` were rewritten so
  the "legacy" install paths actually start the Session Manager + MCP backend
  (`server/main.js`), matching what `nginx/ttyd.conf` already expects, instead of raw
  ttyd standalone. Verified via a rebuilt `docker run` returning real terminal HTML with
  `kb.js` present, `HTTP 200`.
- **Prevention rule**: When one half of a client/server pair changes (here, the nginx
  proxy target), grep every file that ships or configures the *other* half for the old
  target/assumption before considering the change complete — a reverse-proxy config and
  the process it points to are a single unit that must be verified together by actually
  running the resulting deployment, not just reading each file in isolation. "The nginx
  config was already updated for the new architecture" is not evidence the paths that
  install/run the backend were updated to match; always do a real `docker build && docker
  run && curl` (or the bare-metal equivalent) of a change that touches deployment wiring,
  even when time-pressured to move on to the next backlog item — this is exactly the kind
  of gap that only running the actual artifact surfaces, per every ttyd/nginx/systemd
  mistake already logged above (2026-06-20-001 through -006).

---

### [2026-07-29-024] `tmux send-keys -l`/a plain named key can hang indefinitely (not just error) when the target pane is in copy-mode
- **Timestamp**: 2026-07-29 18:10 UTC
- **Summary**: While implementing real tmux-copy-mode-driven touch scrolling
  (see docs/ai/decision-log.md's matching entry), investigated what happens
  if an MCP "send" tool (`type_command`, which calls `sendLiteral` ->
  `tmux send-keys -l`) runs while a human has the same pane frozen in
  copy-mode via the new browser scroll gesture. With NO tmux client ever
  attached to the test session, `send-keys -l` while in copy-mode returned
  `"no current client"` and the command never executed (confirmed via a
  later `capture-pane` showing no change). With a real, persistent
  pty-backed client attached (`script -qc "tmux attach-session -t X"
  /dev/null &`, simulating what ttyd genuinely is once a browser has
  joined), the identical `send-keys -l` command **hung indefinitely** --
  the command that discovered this was killed by a 2-minute Bash tool
  timeout rather than ever returning, with or without an error.
- **Root cause**: Not fully characterized (tmux internals), but the
  divergence is real and reproducible: `-l` (literal, disables key-name
  lookup) and a plain named key appear to need to resolve something
  relative to "the current client" (its terminal encoding/mode?) that a
  fresh, one-shot, unattached `tmux <cmd> -t <name>` script invocation
  does not itself provide -- unlike `-X` (explicit copy-mode command)
  invocations of the same kind (`copy-mode`, `send-keys -X scroll-up`,
  `send-keys -X cancel`), which were fast and safe as detached script
  calls in every no-client test run.
- **Affected files**: `server/mcp/tmux.js` (`sendLiteral`, `sendEnter`,
  `sendNamedKeys`, `sendHexKeys`) -- the code paths every MCP tool that
  types/sends keys ultimately goes through.
- **Detection method**: Deliberately reproduced the exact "human mid-scroll,
  agent sends a command" race by hand in a scratch tmux session before
  writing any product code, first with no attached client (`tmux
  new-session -d`, no client ever), then with a real pty-backed client
  (`script -qc "tmux attach-session -t X" /dev/null &`) -- the second
  scenario is what actually surfaced the hang, which the first scenario's
  clean "no current client" error had not predicted at all. A raw
  WebSocket-upgrade handshake to a real `ttyd` process was also tried to
  get an even more faithful "real ttyd client" reproduction, but `tmux
  list-clients` showed ttyd never actually registered as attached from
  that alone (it needs its own subprotocol handshake beyond a bare WS
  upgrade) -- so the real-ttyd-client condition specifically remains
  empirically unconfirmed either way, not just untested.
- **Correction**: `server/mcp/tmux.js`'s `sendLiteral`/`sendEnter`/
  `sendNamedKeys`/`sendHexKeys` now call a new `exitCopyModeIfActive()`
  helper first, unconditionally, forcing the pane back to live before
  ever reaching the unsafe code path. The new copy-mode primitives
  themselves (`isInCopyMode`/`enterCopyMode`/`exitCopyModeIfActive`/
  `scrollCopyMode`) use a 2s-bounded `execFileSync` (`tmuxBounded`),
  specifically because the real-client condition for even the `-X` path
  couldn't be fully verified safe -- see decision-log.md.
- **Prevention rule**: Before assuming any `tmux` subcommand's behavior
  from a detached/scripted `execFileSync` call is the same regardless of
  whether a real client happens to be attached to that session, test both
  conditions explicitly -- a `tmux new-session -d` with no client ever
  attached is NOT a faithful stand-in for "a real ttyd/browser session",
  and this codebase's actual production topology always has a real
  attached client. Any new synchronous `execFileSync`/`tmux` call whose
  safety under a real attached client is not independently confirmed
  should get an explicit timeout, since `execFileSync` has none by default
  and a hang blocks this entire single-threaded Node process, not just the
  one call.

---

### [2026-07-29-023] New-session navigation raced ttyd's own startup, permanently breaking the first request with no retry
- **Timestamp**: 2026-07-29 15:35 UTC
- **Summary**: After deploying the merged Session Manager architecture live, the Playwright suite showed 21-23/55 tests failing, always the same tests across independent full runs, and always the ones that create a session via the real UI (`createSessionViaUi`, i.e. clicking "+ Create New Session") rather than the raw API (`apiCreateSession`) -- `mcp-tools.spec.js` (API-only) and `session-lifecycle.spec.js` (list-only, no real terminal render) passed cleanly every time, which was the key clue. An isolated single-test run (no other tests, no cumulative load) reproduced the failure 100% of the time, ruling out load-related flakiness. Manually clicking through the same flow with `page.goto(...).../term/<id>/` (rather than the client's own `window.location.href` navigation) worked fine, which was the second clue.
- **Root cause**: `public/session-manager.js`'s `createSession()` navigates to `/term/<id>/` the instant its `POST /api/sessions` response resolves. Server-side, `spawnSession()` (`server/session-manager.js`) returns just as soon as `child_process.spawn('ttyd', ...)` has been *called* -- not once ttyd has actually finished binding its `--port`. `window.location.href` triggers a browser navigation with effectively zero added latency, so it consistently won the race against ttyd's own startup time on this host, arriving at the reverse proxy before ttyd was listening. `proxyHttp()`'s upstream error handler had no retry: on `ECONNREFUSED` it wrote a static "Upstream error" page once and gave up, and nothing on the client side ever re-fetches that page, so the browser was left showing a dead page for the rest of the test's 15-second `waitForSelector('.xterm-screen')` timeout.
- **Affected files**: `server/session-manager.js` (`proxyHttp`)
- **Detection method**: Compared which spec files failed vs. passed (100% correlation with `createSessionViaUi` vs. `apiCreateSession`); reproduced in complete isolation (single test, no other tests run before it) to rule out cumulative resource exhaustion; captured the actual failure screenshot (Playwright's `test-failed-1.png`), which showed the literal text "Upstream error" rather than a blank/slow-loading page -- confirming a hard proxy failure, not a slow render.
- **Correction**: Added a bounded retry-with-delay (`UPSTREAM_RETRY_MAX = 20`, `UPSTREAM_RETRY_DELAY_MS = 100`, so up to ~2s) in `proxyHttp()`, scoped to `GET` requests that fail with `ECONNREFUSED` specifically. Left session creation itself non-blocking (does not make the client wait for ttyd's readiness before navigating), matching `public/session-manager.js`'s own explicit "async-only, never block the UI thread" design note -- the fix absorbs the startup race in the proxy layer instead of introducing a new synchronous readiness wait on the create-session path. Verified via: (1) the previously 100%-reproducible isolated test, now passing; (2) a manual script driving the exact same click path (`#new-session-btn` → wait for terminal) against the live host, producing a working terminal with a real shell prompt and zero console errors.
- **Prevention rule**: Any reverse proxy sitting in front of an asynchronously-spawned backend process must tolerate that process not being ready for its first few connection attempts -- either the spawning side must block until the child is confirmed listening (which this codebase deliberately avoids for UX reasons), or the proxy side must retry transient connection failures before surfacing a dead-end error page. When a bug reproduces 100% of the time in one code path (UI click) but never via another (raw API call) that reaches the same backend, look for what's different in the *client's* timing/navigation behavior before assuming backend nondeterminism. Stopping ttyd.service destroyed the tmux server it wrapped, not just web access to it
- **Timestamp**: 2026-07-29 14:40 UTC
- **Summary**: During the cutover of `terminal.pz.net` from the legacy ttyd model to the Session Manager + MCP architecture, `sudo systemctl disable --now ttyd` was run on the assumption that tmux is a fully independent daemon and would keep the `main` session (created 2026-07-28, real user state) running in the background, merely unreachable via the browser until reattached over SSH. Instead, `tmux ls` immediately afterward reported "no server running" -- the tmux server itself, and every session on it, was gone. No tmux-resurrect/continuum snapshot existed on this box and the ttyd logs contained no pane content, so the session was unrecoverable.
- **Root cause**: `systemd/ttyd.service`'s `ExecStart` execs `tmux new-session -A -s main` directly as ttyd's wrapped child command, rather than pointing at an already-detached, independently-started tmux server. Because that `tmux new-session` invocation (and the tmux server process it started) lived inside `ttyd.service`'s own cgroup, systemd's default `KillMode=control-group` sent the stop signal to every process in that cgroup, not just the ttyd binary -- killing the tmux server along with it. "tmux sessions survive independently of whatever launched them" is only true when the tmux server was started detached, outside the cgroup of the thing being stopped.
- **Affected files**: none in-repo (the behavior is inherent to `systemd/ttyd.service`'s existing `ExecStart` pattern, unchanged by this session); the loss occurred on the live host's `ttyd.service`, not from any code edit.
- **Detection method**: Ran `tmux ls` immediately before and after the `systemctl disable --now ttyd` step (a habit worth keeping) and saw the session list go from `main: 1 windows...` to a hard "no server running on /tmp/tmux-1000/default" error.
- **Correction**: None possible after the fact. Going forward: before stopping any systemd unit whose `ExecStart` execs a `tmux new-session` (or any other long-lived daemon) directly as its wrapped command, assume that daemon dies with the unit unless the unit explicitly sets `KillMode=process` (kills only the main PID) or the daemon was started detached in a separate cgroup/session (e.g. via a prior standalone `tmux new-session -d` before the tracked process attaches with `-A`). The new Session Manager architecture (`server/session-manager.js`) intentionally does the opposite -- it calls `shutdownAllSessions()` on its own SIGTERM/SIGINT to explicitly `tmux kill-session` every session it owns on shutdown -- so under the new model, sessions are designed not to survive a `nomadtty.service` restart either; this is a deliberate lifecycle choice for that service, not a bug, but it means the same "will my terminal state survive stopping this service" question needs to be asked and answered (and communicated to the user) before every future stop/restart of it too.
- **Prevention rule**: Never assume a process is independent of the systemd unit that spawned it without checking that unit's `KillMode` and cgroup structure first. When a plan involves stopping a service that wraps or spawns a persistent daemon (tmux, screen, database, etc.), verify survivability empirically (`ps`/`tmux ls` before and after) on a low-stakes instance first, or explicitly warn the user of possible data loss before running the real stop command -- do not state a survivability assumption as fact in a plan without having verified it. "Footer at the bottom of the screen" was implemented as "end of scrollable content," not "pinned to the viewport"
- **Timestamp**: 2026-07-29 13:15 UTC
- **Summary**: The copyright footer was implemented with a flexbox `min-height:100dvh` + `margin-top:auto` sticky-footer pattern -- correct for "appears at the bottom of a short page, or after the last item on a long one," but the footer was still only reachable by scrolling on any list long enough to fill the screen. The user's actual requirement was "the footer area needs to be persistently [at the] bottom of the screen" -- i.e. always visible without scrolling, like a fixed status bar. Automated verification (a sweep from 1-20 sessions measuring the real DOM gap between the last row and the footer) never caught this because it was solving the wrong problem correctly: it proved "no overlap once you scroll to the end," which was never the actual complaint.
- **Root cause**: Treated an ambiguous request ("footer should be at the bottom of the page") as the flow-document sticky-footer pattern, without checking it against the one directly analogous pattern already established in this same codebase: `src/kb.js`'s `#kb` toolbar and `#back-btn` are both `position:fixed` overlays that stay on screen regardless of scroll position, with the scrollable content given reserved padding/margin so it can clear their footprint (`docs/ai/mistakes.md` 2026-07-29-017). That precedent should have been the first thing checked for a "persistent chrome element on a scrollable page" request in this app, rather than reaching for a generic CSS sticky-footer recipe.
- **Affected files**: `public/session-manager.html`
- **Detection method**: User clarified via direct follow-up after being asked (through `AskUserQuestion`) whether the reported issue was about a real device, a resize, or one of the screenshots sent, and whether the overlap was persistent or a scroll transient -- the answer ("footer needs to be persistently bottom of the screen") revealed the actual requirement had never matched the implementation.
- **Correction**: Changed `#sm-footer` to `position:fixed;left:0;right:0;bottom:0` (matching `#kb`'s pattern exactly), gave it its own background/border-top so it doesn't look transparent-over-content, and reserved `padding-bottom:calc(50px + env(safe-area-inset-bottom))` on `#sm-root` so the scrollable list can fully clear the footer's footprint. Re-verified with the same 1-20 session sweep: the footer is now visible in the viewport with zero scrolling at every count, and a 24px clearance remains between the last row and the footer even when scrolled to the true end of a 20-session list.
- **Prevention rule**: When a request describes a persistent/always-visible UI element in an app that already has an established `position:fixed` overlay pattern for exactly that (toolbar, Back button), reuse that pattern by default rather than defaulting to a generic web pattern (flexbox sticky footer) that solves a subtly different problem. When "top/bottom of the screen" is ambiguous between "end of content" and "fixed to the viewport," treat it as a genuinely open question worth a quick clarifying check, not an assumption to implement and hope is right.

### [2026-07-29-020] Session Manager footer-overlap verification used exactly enough sessions to still fit on screen, not enough to actually scroll
- **Timestamp**: 2026-07-29 12:45 UTC
- **Summary**: After fixing the Session Manager's sticky-footer layout (`#sm-root` flex + `margin-top:auto` on `#sm-footer`), verification used an 8-session list and reported "footer flows after content, no overlap" with a passing screenshot. The user pointed out the screenshot should have shown more sessions than fit on one screen. On investigation, 8 sessions at the Pixel 7 viewport happened to render at exactly ~839px tall on the CSS-visible-viewport-based measurement I checked (`document.documentElement.scrollHeight`), which matched the 839px viewport height and reported `exceedsViewport: false` -- meaning the 8-session case never actually exercised the scrolling/overlap scenario that mattered, even though it "passed."
- **Root cause**: Two compounding gaps: (1) picking a session count without first confirming it would exceed one screen's worth of content, so the test silently verified a non-scrolling case while looking like it verified the scrolling one; (2) `document.documentElement.scrollHeight` is the wrong element to measure here -- `public/session-manager.html`'s `html,body{height:100%;overflow-y:auto}` makes `body` (not `documentElement`) the actual scrolling container, so `documentElement.scrollHeight` silently reports the viewport height regardless of how much content is inside `body`, masking the fact that the page was scrollable at all.
- **Affected files**: none (test-only investigation; no product code was wrong) -- `public/session-manager.html`'s CSS itself was already correct.
- **Detection method**: User explicitly asked to verify with "12-13 sessions ... more than the screen length." Re-ran with 13 sessions and measured `document.body.scrollHeight` (1085px) against the viewport (839px) to confirm real overflow, then scrolled `document.body.scrollTop` (not `window.scrollTo`, which scrolls `documentElement` and had no effect here) to the bottom and captured that state -- only then was the footer's position relative to the last visible row measured with confidence, and a full-page Playwright screenshot was found to under-capture past the first ~10 rows for the same body-vs-documentElement scroll-container reason.
- **Correction**: Verified 13 sessions genuinely exceed the viewport (`body.scrollHeight` 1085px vs. 839px viewport), scrolled `document.body.scrollTop` to the true bottom, and confirmed an 8px gap between the last session row and the footer with zero overlap.
- **Prevention rule**: When verifying "does X overlap when the list is long," first confirm the test data actually produces overflow relative to the real scrolling element (check `scrollHeight > clientHeight` on whichever element has `overflow-y:auto`/`scroll` -- not reflexively `documentElement`) before trusting a passing assertion. A test that measures the wrong scroll container, or that under-shoots the content needed to trigger scrolling, can report "no overlap" while never having exercised the overlap condition at all.

### [2026-07-29-019] kb.js's toolbar buttons fired on ANY touch that ended over them, including a full-width drag/swipe
- **Timestamp**: 2026-07-29 07:10 UTC
- **Summary**: Toolbar buttons dispatch their action directly from an inline `ontouchend="..."` attribute on the button element itself, not from the browser's synthesized `click` (which natively tolerates a small amount of finger movement before suppressing itself). A touch that started on `#kb-c` (CTRL) and dragged 150px sideways before lifting -- exactly what swiping `.kr`'s horizontally-scrolling row to see more buttons feels like -- still toggled CTRL on, because `touchend` fires wherever the finger lifts regardless of how far it traveled to get there.
- **Root cause**: No distinction was ever made between "a finger tapped this button" and "a finger happened to lift over this button after a long drag." `ontouchend` fires unconditionally on the element under the finger at lift-off.
- **Affected files**: `src/kb.js`
- **Detection method**: A rigorous mobile-UX task explicitly asked to verify that dragging/scrolling gestures don't trigger accidental button presses. Dispatched a synthetic touchstart/touchmove(150px)/touchend sequence starting on `#kb-c` and checked whether it toggled -- it did, confirming the bug before writing any fix.
- **Correction**: Added a capture-phase touchstart/touchmove/touchend listener on `#kb` (an ancestor of every button, so it runs before each button's own bubble-phase handler) that tracks total finger movement per gesture; if it exceeds a 10px threshold, `stopPropagation()` (and `preventDefault()`, which also suppresses the compatibility click) stops the event from ever reaching the button's own handler. Verified: a 150px drag no longer toggles anything, a 3-4px natural tap jitter still does, and native `.kr` scrolling (which never calls `preventDefault()` on `touchmove`) is untouched.
- **Prevention rule**: Any element that fires an action directly from `touchend` (rather than relying on the browser's own click synthesis) must independently measure gesture distance and suppress the action once it exceeds a small tap-vs-drag threshold -- especially when that element sits inside or beside a scrollable/swipeable region.

### [2026-07-29-018] Touch-scroll on the terminal could spam real Up/Down-arrow key bytes into the PTY, corrupting visible output
- **Timestamp**: 2026-07-29 07:00 UTC
- **Summary**: kb.js's touch-scroll feature (`initTouchScroll`) translated finger swipes on `.xterm` into synthetic `WheelEvent`s, on the assumption that xterm.js's own wheel handler would scroll its client-side scrollback buffer. Under rigorous mobile stress-testing (scrolling while an AI-CLI-style stream was actively producing output), a screenshot showed dozens of literal `^[[A` sequences appearing as garbage text mixed into otherwise-correct streamed output -- a serious, visible "screen text distortion."
- **Root cause**: Every NomadTTY terminal session runs inside tmux (a hard architectural invariant, see CLAUDE.md). tmux repaints its pane as a fixed-size display and manages pane history entirely server-side (that's exactly what `tmux capture-pane` / the MCP `scroll_buffer` tool already use) -- it never feeds content into xterm.js's own client-side scrollback buffer. Confirmed directly: `window.term.buffer.active.length` stayed pinned exactly equal to `window.term.rows` even after streaming 300 lines through a 52-row terminal, meaning the client buffer never grows past what's on screen, no matter how much output has passed through. With zero client-side scrollback ever available, **every single dispatched wheel event** hit xterm.js's own documented fallback behavior for "nothing left to scroll in this direction": sending literal Up/Down-arrow key escape sequences (`\x1b[A`/`\x1bOA` and their Down-arrow counterparts) to the PTY as real client input -- a legitimate xterm.js feature intended for alternate-screen/TUI mouse-wheel-to-cursor-key translation, but actively harmful here. Those bytes reach whatever is running in the foreground; if it isn't reading stdin (any non-interactive long-running command, e.g. a streaming AI CLI response), the tty's own local echo prints them straight back as literal, repeated garbage character sequences mixed into live output. This was reproducible on **every** touch-scroll gesture tested, not a rare edge case -- confirmed with a single, gentle, small-magnitude wheel event, not just an aggressive overshoot.
- **Affected files**: `src/kb.js` (`initTouchScroll`)
- **Detection method**: Took an actual screenshot mid-stress-test (per the project's own "look at the resulting image" rule, mistakes.md 2026-07-29-012) instead of only checking pass/fail assertions, and saw the garbage text directly. Root-caused by capturing raw client→server WebSocket input frames during a scroll gesture (confirming literal `\x1bOA` bytes were being sent as PTY input) and by directly inspecting `window.term`'s exposed xterm.js buffer state (`buffer.active.length`, `.baseY`, `.options.scrollback`) to confirm the client buffer never actually retains scrolled-off content under tmux, regardless of its configured capacity. Also verified a candidate fix (`--client-option scrollback=N`) before adopting anything: it did change `options.scrollback` but produced an unrelated, unexplained row-count discrepancy in an early test, illustrating why every candidate fix must be independently re-verified rather than assumed correct once behavior looks superficially right.
- **Correction**: Disabled the wheel-event dispatch entirely -- `initTouchScroll` now only calls `preventDefault()` on `touchmove` (to keep suppressing iOS's page-bounce overscroll) and sends nothing to xterm.js's wheel handler. Verified with the exact original repro (a fast, large-delta swipe during an active stream): zero input bytes sent, zero `^[[A`/`\x1bOA`-family sequences in the output, stream completes cleanly. The existing MCP `scroll_buffer`/`read_terminal_contents` tools (server/mcp/tmux.js) are unaffected -- they already read tmux's own server-side history directly, which is unrelated to this client-side mechanism, and their tests continued passing throughout.
- **Prevention rule**: Before wiring any browser-side gesture to "scroll the terminal," confirm there is an actual client-side buffer for it to scroll into, given the specific multiplexer/wrapper (tmux, screen, etc.) in use -- a library feature (xterm.js scrollback) can be entirely non-functional, and its failure-mode fallback actively harmful, in a configuration the library autohor never tested against. A real, user-visible mobile scrollback UI would need to drive the multiplexer's own history mechanism (e.g. tmux copy-mode) directly, not the client renderer's local buffer -- tracked as a follow-up, not implemented here.

### [2026-07-29-017] Toolbar's floating Back button can fully cover the "A+" zoom button when the toolbar row is scrolled to its end
- **Timestamp**: 2026-07-29 06:35 UTC
- **Summary**: `#kb`'s row1 is a horizontally-scrolling flex row (`.kr{overflow-x:auto}`) whose natural content (CTRL through A+) is wider than any phone-sized viewport. `#back-btn` is a separate, always-fixed circle pinned to the top-right corner (`top:8px;right:8px`) with a higher z-index than the toolbar. Scrolling row1 all the way to its right end (a completely ordinary "swipe to see the last button" gesture) lands the row's last button, "A+", directly under `#back-btn`'s 34x34px circle -- confirmed visually via screenshot: "A+"'s label and tap target are entirely hidden behind the Back button, making it untappable at that scroll position.
- **Root cause**: The two elements were laid out independently -- the scrollable toolbar row was never given any reserved space accounting for the always-on-top, fixed-position Back button occupying the exact corner the row scrolls into.
- **Affected files**: `src/kb.js` (`.kr` CSS rule)
- **Detection method**: Writing `tests/specs/android-mobile-ux.spec.js`'s zoom-button test, Playwright's `.tap()` auto-scrolled the "A+" button into view and then failed with `<button id="back-btn"> intercepts pointer events` -- i.e. the test discovered this by trying to actually interact with the button the way a user would, not by inspecting CSS. Confirmed with a screenshot at `kr.scrollLeft = kr.scrollWidth` showing "A+" fully hidden behind the circular Back button.
- **Correction**: Added `padding-right:48px` to `.kr` (34px back-button width + 8px right offset + ~6px buffer), reserving enough scroll room that the last real button clears the back-button's footprint at maximum scroll. Re-verified via the same screenshot technique: "A+" now ends at x=361 while `#back-btn` starts at x=370, a clear 9px gap.
- **Prevention rule**: Any fixed-position overlay UI element (like `#back-btn`) that shares a screen region with a *scrollable* container must have its footprint explicitly reserved as padding/margin in that container, not just visually checked at one scroll position. "The button doesn't overlap the content I can currently see" is not the same claim as "the button can never overlap the content," and only the latter is true safety for a scrollable list/row.

### [2026-07-29-016] kb.js's modifier-key intercept didn't stop propagation, causing a double-send (control byte + literal key) to the PTY
- **Timestamp**: 2026-07-29 06:20 UTC
- **Summary**: Writing `tests/specs/android-mobile-ux.spec.js`'s test for the CTRL toolbar toggle button (tap CTRL, then press a letter key -- the only way a touch-only mobile user can send a control byte, since there's no physical Ctrl key to hold), the resulting PTY output showed BOTH the expected control-byte echo (`^C`) AND the literal, unmodified character typed right after it (e.g. tapping CTRL then pressing 'c' produced `^Cc`, then a second stray `c` began the next typed command -- garbling `echo mobile_ctrlc_ok` into `cecho mobile_ctrlc_ok`, which bash then failed to find as a command).
- **Root cause**: kb.js's `document.addEventListener('keydown', ..., true)` intercept (used when CTRL/SHFT/ALT is toggled on via the toolbar) called `ev.preventDefault()` but never `ev.stopPropagation()`. `preventDefault()` only suppresses the browser's own default action (text insertion into the focused element) -- it does *not* stop the same event from continuing to bubble to other listeners. xterm.js's own keydown handler on its hidden textarea (bubble phase, which runs *after* this capture-phase listener) still received the identical keydown event and independently forwarded the raw, unmodified key to the PTY over its own path, producing a second, unwanted byte for every single intercepted keystroke.
- **Affected files**: `src/kb.js` (the physical-keyboard-intercept-for-active-modifiers block)
- **Detection method**: No existing test exercised this code path at all -- the one existing Ctrl+C test (`terminal-interaction.spec.js`) uses a real `Control+c` OS-level chord, which xterm.js's own native Ctrl-modifier detection handles directly and never reaches kb.js's toggle-button-driven intercept branch (`M.c` is only set true by tapping `#kb-c`). This bug was only reachable, and only found, by writing a test for the specific mobile interaction pattern (tap a toggle button, then press a key) that the manual verification checklist in `.claude/rules/tests.md` describes ("Tap CTRL (turns blue) → type a letter → confirm control byte intercepted") but had apparently never checked that *only* the control byte arrived.
- **Correction**: Added `ev.stopPropagation()` immediately after `ev.preventDefault()` in the same intercept block, so once kb.js claims a keydown for an active modifier, no other listener (xterm.js's included) gets a chance to also act on it.
- **Prevention rule**: A capture-phase event listener that claims ownership of an event to send a custom, transformed action (as opposed to just observing) must call `stopPropagation()`, not just `preventDefault()`, whenever the same DOM element tree has another listener (first-party or from a bundled library like xterm.js) that would otherwise also independently act on the untransformed event. A manual test-checklist step that only checks "the desired effect happened" (a control byte arrived) can still miss "and *only* the desired effect happened" (no extra byte also arrived) -- verify the complete output, not just that it contains what you expected.

### [2026-07-29-015] Test helper's `waitForTerminalReady()` hardcoded a `canvas` selector, silently coupling the whole suite to one renderer
- **Timestamp**: 2026-07-29 06:05 UTC
- **Summary**: `tests/helpers/session-manager.js`'s `waitForTerminalReady()` used
  `page.waitForSelector('.xterm-screen canvas', ...)`. The moment `TTYD_RENDERER_TYPE`'s default changed
  from `canvas` to `dom` (see 2026-07-29-014 below), this selector would never resolve — the 'dom' renderer
  never creates a `<canvas>` element — which would have broken all 35 existing Playwright tests (every one
  of them calls this helper before interacting with a terminal), not just the mobile-DPR investigation that
  surfaced the underlying renderer bug.
- **Root cause**: A renderer-specific implementation detail (`<canvas>` existing at all) leaked into a
  helper meant to answer a renderer-agnostic question ("has the terminal mounted?"). Nothing forced this
  coupling — `.xterm-screen` (the container xterm.js always creates, regardless of webgl/canvas/dom) was
  available and equally valid the whole time.
- **Affected files**: `tests/helpers/session-manager.js`, plus stale explanatory comments in
  `tests/README.md`, `tests/specs/terminal-interaction.spec.js`, `tests/helpers/ws-capture.js` that
  asserted "xterm.js renders via WebGL/canvas" as if it were the only possibility.
- **Detection method**: Ran the corrected renderer default through a probe script that reused the old
  `canvas`-suffixed selector; it timed out even though the console line
  `[ttyd] dom renderer loaded` had already printed, proving the app was fine and the selector was stale.
  Grepped the whole `tests/` tree for `canvas` afterward instead of assuming the one selector was the only
  reference.
- **Correction**: Changed the selector to `.xterm-screen` (no `canvas` suffix). Re-ran the full 35-test
  suite against the new `dom` default — 35/35 passed. Updated the stale comments to describe renderer
  choice as configurable rather than fixed.
- **Prevention rule**: Test helpers that wait for "the terminal is ready" must assert on markup that is
  guaranteed to exist across every supported rendering mode, not on an implementation detail of whichever
  renderer happened to be the default when the helper was written. After changing any config default with
  multiple valid values (renderer type, feature flag, etc.), grep the whole test tree for the old value's
  name, not just the one call site that prompted the change.

### [2026-07-29-014] Canvas renderer (the previous "fix" for headless WebGL breakage) draws glyphs wrong at real mobile devicePixelRatio
- **Timestamp**: 2026-07-29 05:55 UTC
- **Summary**: Mistake 2026-07-29-012 fixed a headless-sandbox WebGL rendering bug by switching ttyd's
  default renderer to `canvas`, verified only at desktop `devicePixelRatio=1`. Rigorously re-testing under
  Playwright's `devices['Pixel 7']` profile (`devicePixelRatio=2.625` — an ordinary real phone, and this is
  a mobile-first product) showed the canvas renderer drawing glyphs roughly DPR-times too large: only
  ~20 characters visible across a 381px-wide terminal where 48+ should fit. The underlying tmux pane's
  logical grid was computed reasonably (50 cols x 51 rows, close to desktop's 55x52) — the bug is in
  xterm.js's canvas-renderer font-metric/scaling calculation at high DPR, not in NomadTTY's own CSS/layout
  sizing, which stayed correct.
- **Root cause**: The fix for -012 was verified in exactly one condition (headless sandbox, DPR=1) and
  never re-tested at a real mobile DPR before being treated as settled — the same class of gap as -012
  itself (trusting "no console errors" / "looks fine once" over actually looking at pixels in the
  conditions that matter for a mobile-first app).
- **Affected files**: `server/session-manager.js` (`spawnSession`)
- **Detection method**: Direct side-by-side comparison of raw `ttyd --client-option rendererType=webgl` and
  `rendererType=dom` processes against the identical Pixel 7 device profile: both computed a correctly
  fine-grained tmux grid (122x129), unlike canvas's 50x51, and viewing the resulting screenshots confirmed
  DOM renders crisp and correctly-sized while webgl reproduces the already-known headless breakage (-012).
- **Correction**: Changed `spawnSession()`'s default `TTYD_RENDERER_TYPE` fallback from `canvas` to `dom` —
  the only one of the three renderers verified correct in both failure conditions (headless/no-GPU sandbox
  *and* real mobile DPR). Re-confirmed end-to-end through the real `spawnSession()` code path (not just the
  raw-ttyd comparison) at both DPR=1 and DPR=2.625: nearly identical, correctly fine-grained tmux grids
  (49x52 vs 49x51). See `docs/ai/decision-log.md` for the full renderer decision history.
- **Prevention rule**: For a mobile-first product, any rendering fix must be verified at a real mobile
  `devicePixelRatio` (e.g. via Playwright's `devices[...]` profiles), not just at desktop DPR=1, before
  being considered resolved. A fix verified in only the one condition that prompted it is not verified.

### [2026-07-29-013] New MCP-tool HTTP tests repeated the "matched the input, not the output" bug
- **Timestamp**: 2026-07-29 05:10 UTC
- **Summary**: Writing `tests/specs/mcp-tools.spec.js`, several completion-polling predicates used
  `content.includes(marker)` where `marker` also appeared inside the command *typed* to produce it
  (`seq 1 300`'s own echoed input already contains the substring "300"; `printf '...red_ansi_marker...'`
  echoes that text before executing). Every one of those polls could resolve on the echoed input alone,
  before the command had actually run — one (`ansi=true`) failed outright when its assertion depended on the
  real output; two others (`mode=head`, `scroll_buffer`) failed downstream because `head`/`scroll_buffer`
  were then called before the shell had actually produced the scrollback they were supposed to inspect;
  one (`mode=tail`) *passed* despite the same flaw, purely because its assertions happened to also hold for
  the wrong (premature) content — a false-positive pass, not a working test.
- **Root cause**: This is the exact same bug class as mistakes.md 2026-07-29-009 (documented for the
  WebSocket/browser suite's `waitForOutputCount` → `waitForOutputLine` fix), just not carried over when
  writing a *second*, HTTP-based test suite against the same terminals. Knowing a lesson in one test file
  doesn't prevent repeating it in a sibling one — the underlying PTY behavior (canonical-mode echo of
  typed input) is identical regardless of which client (browser WS vs raw HTTP) is watching it.
- **Affected files**: `tests/specs/mcp-tools.spec.js`, `tests/helpers/mcp-client.js`
- **Detection method**: Ran the new suite repeatedly (not just once) and read the actual captured
  `content` in each failure message rather than assuming the polling predicate was correct.
- **Correction**: Added `outputHasOwnLine(content, marker)` to `helpers/mcp-client.js` — the HTTP-call
  equivalent of `ws-capture.js`'s `waitForOutputLine()` — and replaced every completion-check predicate in
  `mcp-tools.spec.js` that could be satisfied by echoed input with it.
- **Prevention rule**: Any test polling for "has this command finished running" against a raw PTY/tmux
  capture — over *any* transport (WebSocket, HTTP, direct `tmux capture-pane`) — must check for the output
  as a complete line of its own, never a bare substring/count, and this applies per test file: check for
  and reuse the existing helper (or its equivalent) rather than re-deriving the naive version from scratch.

### [2026-07-29-012] ttyd's default WebGL renderer painted incorrectly under headless/software GPU
- **Timestamp**: 2026-07-29 04:40 UTC
- **Summary**: Screenshots of `/term/<id>/` taken via headless Playwright (for README documentation) showed
  a mostly-blank terminal with a handful of huge, sparse glyphs — even after fixing the recursion bug
  above and confirming DOM/canvas CSS sizing and the tmux pane's cols/rows (a sane `47x40`) were all
  correct. The console logged `Automatic fallback to software WebGL has been deprecated` from Chromium.
  Spawning a bare ttyd with `--client-option rendererType=canvas` (no WebGL) rendered the identical content
  correctly and legibly; `--enable-unsafe-swiftshader` on the WebGL path did not help.
- **Root cause**: ttyd's default xterm.js renderer is WebGL. Under a headless browser without real GPU
  acceleration (this sandbox, likely CI generally, and possibly some low-end/virtualized real devices),
  Chromium's software WebGL fallback can composite the terminal's glyph atlas incorrectly — a rendering
  defect in that fallback path, not in NomadTTY's own layout/sizing code, which was verified correct.
- **Affected files**: `server/session-manager.js` (`spawnSession`)
- **Detection method**: Took the actual documentation screenshots this task required and looked at them,
  rather than trusting that "no console errors" meant correct rendering. Isolated the cause by bypassing
  session-manager/kb.js entirely and testing a bare `ttyd --client-option rendererType=canvas` process.
- **Correction**: `spawnSession()` now passes `--client-option rendererType=canvas` by default (overridable
  via `TTYD_RENDERER_TYPE`) — xterm.js's long-standing, broadly-compatible default renderer, not a new or
  experimental option. See `docs/ai/decision-log.md`.
- **Prevention rule**: When a task specifically asks for a screenshot, actually look at the resulting image
  before considering the capture step "done" — a clean console and correct computed styles do not guarantee
  correct pixels, especially for canvas/WebGL content in headless/software-rendering environments.

### [2026-07-29-011] kb.js's updateLayout() recursed infinitely via its own dispatched 'resize' event
- **Timestamp**: 2026-07-29 04:37 UTC
- **Summary**: Capturing a mobile-viewport screenshot of `/term/<id>/` produced repeated `Maximum call stack
  size exceeded` page errors and a terminal that failed to render its content. `updateLayout()` ends with
  `window.dispatchEvent(new Event('resize'))` (to notify ttyd's fitAddon), and is *also* registered via
  `window.addEventListener('resize', updateLayout)` — so dispatching 'resize' synchronously re-invokes
  `updateLayout`, which dispatches 'resize' again, unbounded, until the call stack overflows.
- **Root cause**: No re-entrancy guard between updateLayout's own resize dispatch and its own resize
  listener registration. Present since the very first commit (`4d38c04`, 2026-06-20); nothing had
  previously exercised it against a real browser to surface the resulting console errors or rendering
  breakage — all prior automated verification of terminal behavior (Playwright suite, MCP tools) asserts on
  the WebSocket byte stream, not on rendered pixels or console errors.
- **Affected files**: `src/kb.js` (`updateLayout`)
- **Detection method**: `page.on('pageerror', ...)` while capturing a documentation screenshot in a mobile
  viewport surfaced the repeated stack-overflow errors; a blank/broken terminal in the resulting screenshot
  confirmed the layout pass was not completing correctly.
- **Correction**: Added a module-level `inUpdateLayout` boolean guard: a re-entrant call to `updateLayout`
  from within its own dispatched 'resize' event now returns immediately as a no-op, while the dispatched
  event still reaches every *other* 'resize' listener (ttyd's fitAddon included) exactly once.
- **Prevention rule**: Any function that both dispatches an event AND is registered as that same event's
  own listener needs an explicit re-entrancy guard — the coupling is a latent infinite-recursion bug even
  if it happens not to manifest visibly in every environment/timing. Directly relevant to AGENTS.md's
  "Terminal Emulator Performance Constraint" (avoid heavy DOM reflows) — this was reflow/recursion at its
  worst, and had gone undetected because rendering was never actually screenshotted before.

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
