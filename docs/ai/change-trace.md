# NomadTTY — Change Trace
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-07-30 -->
<!-- add an entry for every notable change: what, why, affected areas, commit -->

### [2026-07-30] install.sh: fall back to start-stop-daemon when no systemd is present
- **Timestamp**: 2026-07-30 UTC
- **Change**: Found via a live zero-context sub-agent install-validation run (fresh
  Ubuntu 26.04 container, no init system) that `install.sh` hard-crashed with
  `systemctl: command not found` at the service-configuration step, with no fallback
  and nothing in `--help` about it. `install.sh` now detects real PID-1 systemd
  (`command -v systemctl` + `/run/systemd/system`) and, when absent, runs the backend
  via `start-stop-daemon` instead — privilege-dropped to `NOMADTTY_USER`, PID-file
  tracked at `/var/run/nomadtty.pid`, idempotent across re-runs. `--help` text, the
  install-time info banner, and the final summary's Logs/Restart/Stop/Uninstall
  sections all branch on which path was used. See `docs/ai/mistakes.md` 2026-07-30-007
  and `docs/ai/decision-log.md`'s matching entry for full root-cause/verification detail.
- **Verified**: `shellcheck install.sh` clean; a full real install run in a fresh
  container (via `NOMADTTY_LOCAL_SOURCE`) reached "HTTP 200 OK — Session Manager is
  responding"; a real MCP `initialize` → `create_session` round trip over HTTP
  succeeded; a second install.sh run on the same container correctly stopped the old
  background process and started a new one with the same preserved `MCP_AUTH_TOKEN`;
  confirmed via `ps`/`start-stop-daemon --stop` that exactly one node process runs at a
  time and stop actually terminates it.
- **Affected areas**: `install.sh`.

### [2026-07-30] Clarified Tailscale is optional, not compulsory, in README/SECURITY.md
- **Timestamp**: 2026-07-30 UTC
- **Change**: Per explicit user clarification ("Tailscale path is not compulsory. Users
  may choose without tailscale (normal lan) or local hosting"), reworded README.md's
  Security Posture section, its architecture diagram's client-side label, and its
  Tailscale Setup section preface, plus SECURITY.md's security-model bullet and
  hardening table row, so a trusted-LAN or purely-local (loopback-only) deployment reads
  as an equally valid, first-class choice — not a fallback for people who "don't use
  Tailscale yet." No underlying security model changed (Tailscale was already optional
  in practice, per `docs/ai/decision-log.md`'s earlier "open LAN/Tailscale access is the
  intended model" entry) — this is a wording fix so the docs actually say what was
  already true. Also fixed a stale `ubuntu:24.04` reference in SECURITY.md's Dependabot
  section (should have read `alpine:3.20` since this session's earlier base-image
  switch).
- **Affected areas**: `README.md`, `SECURITY.md`.
- **Timestamp**: 2026-07-30 UTC
- **Change**: Per explicit user instruction ("no preexisting errors are to be left
  unfixed"), investigated and fixed all five tests previously documented as flaky or
  confirmed-pre-existing-but-unfixed:
  - `server/mcp/tmux.js`'s `listeningSockets()` gained a pure-Node
    `/proc/net/{tcp,udp}{,6}` parsing fallback (with best-effort inode→pid attribution)
    for hosts without `ss`/`netstat` installed — fixes `list_active_ports`.
  - `src/kb.js`'s `initTouchScroll()` now coalesces pending scroll amounts into at most
    one in-flight `copy-scroll` POST (flushed on the next animation frame), instead of
    one POST per touchmove line-crossing — a real mobile-UX responsiveness fix, and the
    root cause of the Hist/copy-mode test's flakiness.
  - `tests/specs/mcp-tools.spec.js`: `submit:false` now polls until the echo lands before
    asserting exactly-once (was zero-delay, racing the shell's echo); the Ctrl+C test's
    precondition now polls `get_process_status` for `sleep` actually forking (was a
    substring match on the echoed input line only); `get_screenshot`'s cold-start test
    got a longer, test-scoped poll timeout (15s, not the shared 8s default).
- **Rationale**: All five had been treated as accepted environment noise ("confirmed to
  reproduce on a clean checkout, not this session's regression") without ever being
  properly root-caused. None turned out to be irreducible — two were real product bugs.
- **Affected areas**: `server/mcp/tmux.js`, `src/kb.js`,
  `tests/specs/mcp-tools.spec.js`, `docs/ai/mistakes.md`, `docs/ai/decision-log.md`,
  `tests/README.md`, `CHANGELOG.md`. Also cleaned up a stray duplicated Entry Template
  block accidentally left mid-file in `docs/ai/decision-log.md` from an earlier edit
  this session.
- **Related decisions**: `docs/ai/decision-log.md`'s matching 2026-07-30 entry (also
  confirms the previously-unverified tmux copy-mode real-attached-client safety
  condition from mistakes.md 2026-07-29-024).
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-30-006.
- **Verification**: Each fix re-run in isolation multiple times (4-6 repeats) before
  moving to the next; full Playwright suite run **3 consecutive times**, 63/63 every
  time (not a single green run) — including the previously-untouched
  `android-mobile-ux.spec.js`/`android-mobile-stress.spec.js` full suites re-run to
  confirm the `kb.js` throttling change caused no regression elsewhere.

### [2026-07-30] Docker base image switched to alpine:3.20 (~4x smaller); CI gained nginx-config and Playwright jobs
- **Timestamp**: 2026-07-30 UTC
- **Change**: `Dockerfile`'s base image is now `alpine:3.20` (was `ubuntu:26.04`) —
  found the original "Alpine has no ttyd" rationale was simply wrong when re-checked
  directly. `docker-entrypoint.sh` updated for Alpine's nginx vhost path
  (`/etc/nginx/http.d/`). `.github/workflows/ci.yml` gained an `nginx-config` job
  (validates `nginx/ttyd.conf` with a real `nginx -t`) and a `playwright` job (runs the
  full 63-test suite on every push/PR, uploading the HTML report on failure) —
  previously only `shellcheck` and `docker-build` ran in CI. `.claude/rules/tests.md`'s
  "Future test targets" TODO list is now fully checked off.
- **Rationale**: Closes competitive-analysis backlog items 18-20 (Tier 4 engineering
  hygiene): CI wiring, version-pinning evaluation (deliberately not hard-pinned — see
  decision-log), and base-image size.
- **Affected areas**: `Dockerfile`, `docker-entrypoint.sh`, `.github/workflows/ci.yml`,
  `.claude/rules/infra.md`, `.claude/rules/tests.md`, `docs/ai/project-overview.md`.
- **Related decisions**: `docs/ai/decision-log.md`'s 2026-07-30 "Docker base image
  switched..." entry.
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-30-004 (the original Alpine
  rationale was never actually true, not just outdated).
- **Verification**: Real `docker build`+`docker run` of the exact committed
  `Dockerfile`/`docker-entrypoint.sh` (200 status, real session creation spawning
  genuine ttyd/tmux, correct toolbar injection, MCP auth enforced, `NOMADTTY_HOST`
  substitution correct). Measured 163MB (Alpine) vs. 686MB (Ubuntu, freshly rebuilt for
  a fair comparison) for an otherwise-identical image. `shellcheck docker-entrypoint.sh`
  passes; `ci.yml` YAML syntax validated; the new `nginx-config` job's exact steps
  tested directly beforehand.

### [2026-07-30] install.sh persists all its settings across re-runs; fixed a health-check set -e bug; added .env.example
- **Timestamp**: 2026-07-30 UTC
- **Change**: `install.sh` now reads `/etc/nomadtty/nomadtty.env` first and falls back to
  any previously-stored `NOMADTTY_HOST`/`NOMADTTY_USER`/`NOMADTTY_TLS`/
  `NOMADTTY_TLS_EMAIL`/`NOMADTTY_BASIC_AUTH` value (an explicitly-passed env var this run
  still wins), and persists all five into that file on every run — previously only
  `MCP_AUTH_TOKEN` survived a bare re-run. Fixed a real bug found during verification: the
  health check's `curl` call could silently abort the whole script under `set -e` before
  ever printing its own diagnostic/summary output (`|| true` fix — see mistakes.md
  2026-07-30-003). Added `.env.example` at the repo root documenting every `server/**`
  runtime env var for the `node server/main.js`-direct dev path, linked from README and
  `.claude/rules/config.md`; added `.env`/`.env.example` handling to `.gitignore`.
- **Rationale**: Closes the competitive-analysis backlog's "unify configuration surface"
  item — a real config surface's defining property is that it's a durable record, not a
  set of flags that must be identically re-supplied on every invocation.
- **Affected areas**: `install.sh`, `.env.example` (new), `.gitignore`, `README.md`,
  `.claude/rules/config.md`.
- **Related decisions**: `docs/ai/decision-log.md`'s 2026-07-30 "install.sh persists its
  own settings..." entry.
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-30-003.
- **Verification**: `shellcheck install.sh` passes. In a disposable container: ran
  install.sh with a custom `NOMADTTY_HOST` + `NOMADTTY_BASIC_AUTH`, then re-ran with zero
  config env vars — confirmed the summary output, the regenerated nginx config
  (`server_name`/`auth_basic` directives), and the persisted `nomadtty.env` all matched
  the original configuration. Confirmed the `curl`/`set -e` fix produces a clean `"000"`
  (not a doubled `"000000"`) on a real connection failure.

### [2026-07-30] Added --help/--version to install.sh and server/main.js; added CHANGELOG.md; small Session Manager UI copy/tooltip improvements
- **Timestamp**: 2026-07-30 UTC
- **Change**: `install.sh -h|--help|--version` now prints usage/version and exits before
  touching the system (embedded text, not re-read from `$0`, so it works whether the
  script is piped via `curl | bash` or run as a local file). `node server/main.js
  -h|--help|--version` does the same, checked before `require`-ing `session-manager`/
  `mcp` (which have port-binding side effects). Added `CHANGELOG.md` (Keep a Changelog
  format), linked from README and tracked in `docs/ai/tool-sync-policy.md`'s community
  health files table. `public/session-manager.html`/`.js` gained a `title` tooltip on
  the Create/Join/Close buttons and richer empty-state copy (matching Uptime Kuma/
  Portainer's lightweight pattern researched in the competitive analysis) — no
  full onboarding tour.
- **Rationale**: Closes the documentation/help gaps identified in the competitive
  analysis: `--help`/`--version` is a GNU-standards baseline every comparator CLI met
  and NomadTTY had a confirmed hard zero of; CHANGELOG.md is common in this tier though
  not universal; in-product help was previously a single empty-state string.
- **Affected areas**: `install.sh`, `server/main.js`, `CHANGELOG.md` (new), `README.md`,
  `CONTRIBUTING.md`, `docs/ai/tool-sync-policy.md`, `public/session-manager.html`,
  `public/session-manager.js`.
- **Verification**: `shellcheck install.sh` passes; `install.sh --help`/`--version`
  tested both piped (`cat install.sh | bash -s -- --help`) and as a local file;
  `node server/main.js --help`/`--version` tested, and normal boot (with
  `MCP_AUTH_TOKEN` set) confirmed still starts both listeners unchanged. Full Playwright
  suite: 61/63 (same 2 pre-existing failures as the prior commit, not new).

### [2026-07-30] install.sh: opt-in TLS (Certbot), Basic Auth, and default nginx rate limiting
- **Timestamp**: 2026-07-30 UTC
- **Change**: `install.sh` gained `NOMADTTY_TLS=certbot`/`NOMADTTY_TLS_EMAIL` (Let's
  Encrypt via `certbot --nginx`, non-aborting on failure) and
  `NOMADTTY_BASIC_AUTH=user:pass` (nginx `auth_basic`, htpasswd `chown root:www-data`).
  `nginx/ttyd.conf` gained a default `limit_req_zone`/`limit_req` (10r/s, burst 20).
  README/SECURITY.md/`.claude/rules/config.md`/`.claude/rules/infra.md`/
  `docs/ai/project-overview.md` updated to match; the last also had its stale
  "two deployment models" note and legacy sub_filter architecture description replaced
  with the current, accurate single-model architecture.
- **Rationale**: Turns three SECURITY.md "documented recommendation only" hardening
  items (HTTPS, auth_basic/OAuth2 proxy, rate limiting) into real, tested, one-flag (or
  zero-flag, for rate limiting) options — from the competitive-analysis backlog.
- **Affected areas**: `install.sh`, `nginx/ttyd.conf`, `README.md`, `SECURITY.md`,
  `.claude/rules/config.md`, `.claude/rules/infra.md`, `docs/ai/project-overview.md`.
- **Related decisions**: `docs/ai/decision-log.md`'s 2026-07-30 "install.sh gets opt-in
  TLS..." entry.
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-30-002 (htpasswd ownership bug,
  found and fixed during verification).
- **Verification**: `shellcheck install.sh` passes. In a disposable container: Basic
  Auth verified end-to-end (401 no-creds, 401 wrong-creds, 200 correct-creds, and clean
  removal of both the htpasswd file and nginx directives when unset on a re-run);
  `NOMADTTY_TLS=certbot` validation fast-fails correctly when `NOMADTTY_HOST`/
  `NOMADTTY_TLS_EMAIL` are missing, and a real certbot failure (unresolvable test domain)
  was confirmed not to abort the rest of the install. Real Let's Encrypt issuance itself
  could not be exercised (no public DNS record can point at this sandbox's ephemeral
  container) — documented as a residual, environment-specific verification gap, not
  assumed to work.

### [2026-07-30] Fixed Docker/install.sh 502 Bad Gateway; unified the two deployment models
- **Timestamp**: 2026-07-30 UTC
- **Change**: `Dockerfile`, `docker-entrypoint.sh`, `install.sh`, and
  `systemd/nomadtty.service` now install Node.js and run
  `server/main.js` (Session Manager + MCP) instead of raw `ttyd` directly —
  matching what `nginx/ttyd.conf` already reverse-proxies to. `install.sh`
  gained `NOMADTTY_INSTALL_DIR`/`NOMADTTY_BRANCH`/`NOMADTTY_LOCAL_SOURCE`
  options, auto-generates (and preserves across re-runs)
  `MCP_AUTH_TOKEN` into `/etc/nomadtty/nomadtty.env` (`chmod 600`), and
  templates the systemd unit's working directory/node path/user the same
  way it already templated `ttyd.service`'s port/user.
  `docker-entrypoint.sh` auto-generates `MCP_AUTH_TOKEN` per container start
  if not supplied and prints it once via `docker logs`. `docker-compose.yml`
  publishes port `4200` and documents `MCP_AUTH_TOKEN`. README's Quick
  Install/Docker/Manual Install/Architecture/Security Posture sections were
  rewritten to match; the mermaid diagram now shows the real topology
  (Session Manager + per-session ttyd + MCP server), not the old
  single-ttyd/sub_filter model.
- **Rationale**: See `docs/ai/mistakes.md` 2026-07-30-001 — the shipped
  Docker/`install.sh` paths were completely broken (502 Bad Gateway on every
  request) because `nginx/ttyd.conf` was updated in commit `55a5208` to
  proxy to the Session Manager but nothing was ever updated to run it. This
  is also the correct fix for the competitive-analysis backlog's "unify the
  two deployment models" item — there was no working, separate "legacy
  model" left to preserve.
- **Affected areas**: `Dockerfile`, `docker-entrypoint.sh`, `install.sh`,
  `systemd/nomadtty.service`, `docker-compose.yml`, `README.md`,
  `.dockerignore` (new).
- **Related commit**: (this session, branch
  `claude/tool-competitive-analysis-3cap2l`)
- **Related decisions**: `docs/ai/decision-log.md`'s 2026-07-30 entry.
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-30-001.
- **Verification**: Rebuilt the Docker image for real and confirmed `HTTP
  200` (was `502`) plus a real session created via the HTTP API spawning
  genuine `ttyd`/`tmux` processes and a correctly toolbar-injected
  `/term/<id>/` page. Ran the equivalent `install.sh` flow inside a
  disposable container (real `apt-get`, `npm ci`, `nginx -t`, MCP token
  generation/preservation across re-runs, systemd-unit template
  substitution all verified for real; `systemctl enable --now` itself could
  not be exercised in this sandbox — no real systemd PID 1 or working nested
  cgroup delegation is available here — so the generated unit's correctness
  was instead proven by manually starting `node server/main.js` with the
  exact generated env file and confirming the same working request chain
  through nginx). `shellcheck install.sh` passes. Full Playwright suite:
  61/63 passing; the 2 failures were confirmed to reproduce identically on
  the pre-fix baseline (stashed changes, same commit) — pre-existing,
  unrelated to this change (see `tests/README.md`'s flakiness section for
  the newly-documented entry).

## Entry Template
```
### [YYYY-MM-DD] <change title>
- **Timestamp**: YYYY-MM-DD HH:MM UTC
- **Change**: what changed
- **Rationale**: why
- **Affected areas**: files / modules / config
- **Related commit**: <hash or message>
- **Related decisions**: links to decision-log entries
- **Related mistakes**: links to mistakes entries (if applicable)
```

---

### [2026-07-30] Added docs/competitive-analysis.md — closed-source-style adoption-readiness review
- **Timestamp**: 2026-07-30 UTC
- **Change**: Added `docs/competitive-analysis.md`, a human/product-facing
  report (explicitly not part of the `docs/ai/**` AI-agent memory tree)
  evaluating NomadTTY as an outside adopter would: installation friction
  (benchmarked against Tailscale, Pi-hole, Portainer, Uptime Kuma, Home
  Assistant, netdata, Cockpit, Coolify, and upstream ttyd), configuration/
  wizard ergonomics, first-time hosting ease, documentation/help best
  practices (GNU standards, Diátaxis, Keep a Changelog), and a competitive
  landscape comparison against ttyd, GoTTY, Wetty, Shellinabox, sshwifty,
  WebSSH2, tmate, Cockpit, and code-server — plus a search confirming no
  mainstream web-terminal project has NomadTTY's combination of a mobile
  touch-toolbar and an authenticated MCP server. Ends in a prioritized
  backlog of recommended changes (analysis only — nothing in the backlog
  was implemented this session).
- **Rationale**: Explicit user request to review the tool "as if it was
  closed source" across install/config/hosting/docs/competitive-comparison
  angles and produce a list of changes to consider.
- **Affected areas**: `docs/competitive-analysis.md` (new); no code changed.
- **Related decisions**: none new — the report itself documents no
  additional consequences beyond what `docs/ai/project-overview.md`'s
  existing "two unreconciled deployment models" ASSUMPTION note already
  covers; the backlog's top item (unify install/deploy) reinforces that
  existing TODO rather than superseding it.
- **Related mistakes**: none.

---

### [2026-07-30] Confirmed the tmux capture-pane line-wrap fix (d72c259/0cb6e62) is solid; full-suite flakiness reconfirmed as pre-existing, not a regression
- **Timestamp**: 2026-07-30 14:29-14:43 UTC
- **Change**: Re-ran the full 63-test Playwright suite on the same Colab
  reference VM (`nomadtty-uxreview`, 2 vCPU/12GB) two additional times after
  a prior single run (60 passed / 3 failed: `mcp-tools.spec.js:277`,
  `terminal-interaction.spec.js:41`, `terminal-interaction.spec.js:81`).
  Run 2: 63/63 passed (2.9m). Run 3: 63/63 passed (2.8m). No single test
  failed in 2+ of the 3 runs, so per this task's own criterion this is
  confirmed as the already-documented full-suite-under-load flakiness class
  (see `tests/README.md`'s "A note on flakiness"), not a regression from
  the line-wrap fix. No code change was needed as a result.
  Also produced supplementary (non-permanent-suite) scroll evidence: a
  one-off spec generating 500 lines of overflow content, toggling Hist,
  swiping, and asserting real early content ("line 1 of overflow test
  content") reappears over the ttyd WebSocket (not a DOM check) — 1 passed
  (8.3s) on Colab, with before/after screenshots + video captured on the VM
  (see `docs/ai/../../nomadtty-verification/2026-07-30/evidence/README.md`
  for checksums/paths — files were left on the Colab VM rather than pulled
  back locally, since the only transfer channel available under the
  single-Colab-channel constraint is 8KB-capped MCP `type_command` text,
  and the artifacts (373-600KB each) would have needed 100+ chunked
  round-trips to move, judged not worth the time cost). Real AVD (Android
  emulator) testing was not attempted: `/dev/kvm` is absent on this Colab
  VM and no Android SDK tooling is installed, consistent with this
  project's existing decision to use Playwright device emulation instead
  of a full AVD in this class of environment.
- **Rationale**: The fix (d72c259 "join wrapped tmux display lines in
  capture-pane output", 0cb6e62 "tolerate trailing whitespace in
  outputHasOwnLine") needed confirmation beyond the single mixed-result run
  already on record, given 3 different tests failed than the 4 originally
  targeted by that fix — verifying whether that was noise (this environment's
  documented flaky-test class) or a real regression before treating the fix
  as solid.
- **Affected areas**: none (verification only; no source changes)
- **Related decisions**: 2026-07-29 "Mobile UX validation uses Playwright
  device emulation" (AVD infeasibility reconfirmed); 2026-07-29 "Mobile
  touch-scroll re-enabled..." (scroll mechanism reconfirmed working)
- **Related mistakes**: none new

### [2026-07-30] Verified the copy-mode scroll fix end-to-end on a real remote VM; found and fixed 3 test bugs plus a real perf regression
- **Timestamp**: 2026-07-30 02:00-05:10 UTC
- **Change**: This local sandbox stayed under sustained heavy load (7+ on 2
  cores) for the entire prior session, making full-suite verification of the
  scroll fix (888e748) inconclusive. Used the Colab CLI already available in
  this environment to provision a properly-resourced 2-core/12GB reference
  VM and ran the full Playwright suite there, iterating through 4 real bugs
  the process uncovered: (1) `android-mobile-ux.spec.js`'s Hist-toggle test
  checked for a specific marker string in `capture.getOutput()`'s
  accumulated WS byte stream, which lost frames across a transient WS
  reconnect under load -- replaced with a check on tmux's own rendered
  copy-mode position indicator, a strictly more direct signal (see 19f4b7f,
  754a601); (2) the same test's "zero PTY input" assertion checked the
  WHOLE test's accumulated `getSentInput()` against `''`, which could never
  pass once the setup step's own legitimate typing was accounted for --
  rescoped to a delta against a pre-gesture baseline (19f4b7f); (3)
  `mcp-tools.spec.js`'s `send_keystroke` interop test used a marker
  containing `_`, invalid per `NAMED_KEY_RE` (8ce9072); (4) most
  significantly, `exitCopyModeIfActive()`'s unconditional `tmux
  display-message` check measurably doubled per-call latency for every
  single MCP send (3.4ms -> 7.7ms average, measured directly) -- enough to
  push several send-heavy tests over their timeout budgets. Fixed with an
  in-memory Set tracking which panes this app's own copy-mode functions
  have engaged, restoring send latency to baseline (ebfe470).
- **Rationale**: The user explicitly asked for thorough verification with
  screenshots/video given the local sandbox's resource constraints, and
  later corrected the Colab interaction pattern mid-session (see
  `memory/colab-cli-single-channel.md` -- mixing direct CLI calls with an
  in-session `colab console` connection caused a silent fresh-VM
  reprovision that lost ~8 minutes of environment setup).
- **Affected areas**: `tests/specs/android-mobile-ux.spec.js`,
  `tests/specs/mcp-tools.spec.js`, `server/mcp/tmux.js`,
  `server/session-manager.js`, `tests/README.md` (new flakiness note).
- **Verification**: Final clean run on the reference VM: 59/63 passed. The
  remaining 4 (`get_screenshot`, `submit:false`, `send_keystroke` Ctrl+C,
  and one instance also affecting `type_command` copy-mode interop) were
  confirmed, via a side-by-side run of an unmodified `394e1e4` checkout on
  the identical VM, to fail identically on code with none of this session's
  changes -- pre-existing, unrelated fragility, documented in
  `tests/README.md` rather than chased further today. Also independently
  confirmed via `google-colab-cli` upstream issue #94 that the tool's own
  `KernelClient` crash (encountered early in this process) was a known,
  already-reported bug (`jupyter-kernel-client==1.0.0` incompatibility);
  fixed locally by pinning `jupyter-kernel-client==0.9.0` per that issue's
  own suggested workaround.

### [2026-07-29] Re-enabled mobile touch-scroll via real tmux copy-mode, with MCP self-heal
- **Timestamp**: 2026-07-29 17:00-18:30 UTC
- **Change**: Added a sticky "Hist" toolbar toggle (`src/kb.js`) that drives
  real tmux copy-mode server-side instead of xterm.js's (nonexistent, under
  tmux) client-side scrollback. New primitives in `server/mcp/tmux.js`
  (`isInCopyMode`, `enterCopyMode`, `exitCopyModeIfActive`, `scrollCopyMode`,
  via a new timeout-bounded `tmuxBounded()`), a new
  `POST /api/sessions/:id/copy-scroll` route in `server/session-manager.js`,
  and `kb.js`'s `initTouchScroll` now maps swipe distance to scroll-line
  requests while "Hist" is on. Every MCP "send" tool
  (`sendLiteral`/`sendEnter`/`sendNamedKeys`/`sendHexKeys`) now calls
  `exitCopyModeIfActive()` first, unconditionally.
- **Rationale**: User reported being unable to scroll a session with long
  output; investigation traced it to the intentional 2026-07-29-018 fix
  (mistakes.md) which disabled touch-scroll entirely rather than fixing it.
  User explicitly required the reimplementation not interfere with the MCP
  server, which acts on the same tmux panes concurrently — see
  decision-log.md's matching entry for the full design and the empirical
  investigation (mistakes.md 2026-07-29-024) that shaped the self-heal.
- **Affected areas**: `src/kb.js`, `server/mcp/tmux.js`,
  `server/session-manager.js`, `.claude/rules/config.md` (new
  `SESSION_MANAGER_SCROLL_LINES_MAX` env var), `CLAUDE.md` (updated the
  now-stale "touch-scroll is disabled" hard invariant), `README.md`
  (Keyboard Toolbar Reference table), `tests/helpers/ws-capture.js` (new
  `getSentInput()` to assert zero PTY bytes sent by a gesture),
  `tests/specs/android-mobile-ux.spec.js` (new Hist-toggle test),
  `tests/specs/mcp-tools.spec.js` (new "touch-history (copy-mode) / MCP
  interop" describe block).
- **Related decisions**: docs/ai/decision-log.md's matching 2026-07-29 entry.
- **Related mistakes**: docs/ai/mistakes.md 2026-07-29-018 (original
  corruption bug), 2026-07-29-024 (the copy-mode/send-keys hang finding).
- **Verification**: `node --check` passes on all 3 changed server/client
  files. The core "self-heal wins over a concurrent human scroll" claim was
  verified DIRECTLY (bypassing HTTP/MCP/Playwright): a script drove
  `enterCopyMode()` then `sendLiteral()`/`sendEnter()` (the exact functions
  `type_command` calls) in-process against a real tmux session and confirmed
  copy-mode was force-exited (166ms) and the command produced correct real
  output. The full Playwright suite (including the two new spec files' new
  tests) was NOT confirmed clean end to end: this host was under sustained
  heavy load (7+ on 2 cores, <100MB free RAM) for this entire session,
  unrelated to this change, and multiple attempts to boot even a bare test
  server instance timed out just trying to bind a port. One real bug was
  found and fixed in the process (a flawed "output never seen before"
  assertion in the new Hist-toggle test, and a send_keystroke test marker
  too long for the 32-key cap) -- both fixed before this commit, but not
  re-run to green. **Owed**: a clean `cd tests && npx playwright test` run
  once host load is normal, before fully trusting the new tests as passing
  (not just correct-looking).

### [2026-07-29] New tmux sessions now start in the deploy user's home directory
- **Timestamp**: 2026-07-29 18:40 UTC
- **Change**: `server/session-manager.js`'s `spawnSession()` now passes
  `-c $SESSION_START_DIR` to `tmux new-session`. New module-level constant
  `SESSION_START_DIR`, resolved from the new `SESSION_MANAGER_START_DIR`
  env var, falling back to `os.homedir()`, falling back to the repo root
  if neither exists on disk.
- **Rationale**: User reported every new session opened with cwd set to
  the app's own repo checkout — an unintended side effect of `tmux
  new-session` inheriting the spawning process's own CWD with no `-c` ever
  passed, not a deliberate design choice.
- **Affected areas**: `server/session-manager.js`, `.claude/rules/config.md`.
- **Related decisions**: docs/ai/decision-log.md's matching 2026-07-29 entry.
- **Verification**: `node --check server/session-manager.js` passes. Directly
  verified via a scratch script calling the real `spawnSession()`: a
  freshly created session's shell printed `CWD_IS:/home/ubuntu` for
  `echo CWD_IS:$(pwd)`.

### [2026-07-29] Added list_sessions/create_session/close_session MCP tools
- **Timestamp**: 2026-07-29 16:00-16:15 UTC
- **Change**: Added 3 new MCP tools wired to `server/session-manager.js`'s existing
  `spawnSession`/`closeSession`/`listSessions` functions. New validators
  `requireTerminalIdFormat` and `requireLabel` in `server/mcp/validation.js` (new env
  var `MCP_MAX_LABEL_BYTES`, default 256). Threaded the 3 functions through
  `server/mcp/index.js` (`createMcpServer`/`createMcpRequestHandler`/`start`) and the
  call site in `server/main.js`. Restarted the live `nomadtty.service` to deploy.
- **Rationale**: See `docs/ai/decision-log.md`'s matching 2026-07-29 entry.
- **Affected areas**: `server/mcp/tools.js`, `server/mcp/validation.js`,
  `server/mcp/index.js`, `server/main.js`, `.claude/rules/config.md`,
  `docs/ai/engineering-rules.md`, `tests/specs/mcp-tools.spec.js`, `README.md`,
  `CLAUDE.md`, `.claude/rules/tests.md`, `.claude/rules/infra.md`,
  `docs/ai/project-overview.md` (the latter three also corrected a stale claim that
  `systemd` didn't run this architecture yet -- it does, as of the cutover earlier
  today).
- **Verification**: `tools/list` on the live server confirms all 10 tools register with
  the expected schemas (diffed directly, used verbatim in the README updates rather than
  hand-written). Full live lifecycle test via curl: `create_session` (status
  `"starting"`) -> `list_sessions` shows it (status `"running"` ~1s later) ->
  `type_command` + `get_screenshot` confirm the session is a real, working terminal ->
  `close_session` -> `list_sessions` confirms it's gone -> `close_session` on a bogus id
  returns a clean `isError` result. 5 new Playwright tests added to
  `tests/specs/mcp-tools.spec.js` covering the same ground plus validation-error paths;
  full suite re-run to confirm no regressions.
- **Related decisions**: `docs/ai/decision-log.md` [2026-07-29] "Added session-lifecycle
  MCP tools..."

### [2026-07-29] Fixed ttyd-startup race in the reverse proxy (Upstream error on new sessions)
- **Timestamp**: 2026-07-29 15:35-15:45 UTC
- **Change**: Added a bounded retry-with-delay (`UPSTREAM_RETRY_MAX=20`, `UPSTREAM_RETRY_DELAY_MS=100`) in `server/session-manager.js`'s `proxyHttp()`, scoped to `GET` requests failing with `ECONNREFUSED`. Restarted the live `nomadtty.service` to deploy it.
- **Rationale**: See `docs/ai/mistakes.md` [2026-07-29-023] -- the post-cutover Playwright re-run showed 21-23/55 tests failing consistently across independent runs, 100% correlated with tests that create a session via the real UI click path rather than the raw API, and reproducible in complete isolation (ruling out cumulative load). Root cause: the client navigates to `/term/<id>/` before confirming ttyd has finished starting.
- **Affected areas**: `server/session-manager.js`, `docs/ai/mistakes.md`
- **Verification**: The previously 100%-reproducible isolated test (`android-mobile-stress.spec.js:54`) now passes. A manual Playwright script driving the exact same UI click path (`#new-session-btn` → wait for `.xterm-screen` → wait for WS `readyState===1`) against the live `terminal.pz.net` produced a working terminal with a real shell prompt and zero console errors, confirmed visually via screenshot. Full 55-test suite re-run in progress to confirm the fix resolves the entire failure set, not just the one isolated case.
- **Related mistakes**: `docs/ai/mistakes.md` [2026-07-29-023]

### [2026-07-29] Merged all pending branches into main; cut terminal.pz.net over to Session Manager + MCP
- **Timestamp**: 2026-07-29 14:00-15:00 UTC
- **Change**: Merged `feature/agentic-mcp-overhaul` and `claude/nomadtty-playwright-tests-b2q3wo`
  (fast-forward, no conflicts) plus all 4 `dependabot/*` branches (clean 3-way merges) into
  `main`; pushed; deleted all 6 branches from origin. Added `systemd/nomadtty.service` (new
  file, not previously shipped by any branch). On the live host: wrote
  `/etc/nomadtty/nomadtty.env` (SESSION_MANAGER_PORT=4000, TTYD_BASE_PORT=47900,
  MCP_PORT=4200, MCP_HOST=0.0.0.0, generated MCP_AUTH_TOKEN), installed/enabled
  `nomadtty.service`, disabled `ttyd.service`, and rewrote the `location /` block in both
  `/etc/nginx/sites-available/ttyd` and (surgically, only the `terminal.pz.net` block) the
  shared `/etc/nginx/sites-available/tailscale-router` to proxy to `127.0.0.1:4000` instead
  of `ttyd:47821` directly.
- **Rationale**: See `docs/ai/decision-log.md`'s 2026-07-29 "terminal.pz.net cut over"
  entry for the full context and the explicit user decisions behind each choice.
- **Affected areas**: `main` branch history (34 commits merged in), `systemd/nomadtty.service`
  (new), `docs/ai/mistakes.md`, `docs/ai/decision-log.md`, live host config outside this repo
  (`/etc/nginx/sites-available/ttyd`, `/etc/nginx/sites-available/tailscale-router`,
  `/etc/systemd/system/nomadtty.service`, `/etc/nomadtty/nomadtty.env`), `~/INFRA.md`.
- **Verification**: `docker build` succeeded (validates the Ubuntu 24.04→26.04 Dockerfile
  bump — ttyd installs fine via apt on 26.04); `shellcheck install.sh` clean; `nginx -t`
  passed before each reload; diffed `tailscale-router` before/after to confirm only the
  `terminal.pz.net` block changed (support/logs/browser/files/accounts/openclaw blocks
  byte-for-byte identical); `curl` against both the public (:80) and Tailscale (:18790)
  paths confirmed the new Session Manager UI is served; `ss -tlnp` confirmed
  `nomadtty.service`'s two listeners (4000 loopback, 4200 all-interface) are up and the MCP
  boot-security check passed (it logged its normal startup line rather than refusing to
  bind, confirming `MCP_AUTH_TOKEN` was read correctly). Playwright suite run twice
  (34/55 passing after fixing a stale-browser-binary mismatch on the first run) — see
  `docs/ai/mistakes.md` if the remaining 21 failures are later confirmed as a real
  regression rather than load-related timeouts; full end-to-end session-creation and MCP
  auth verification still pending at the time of this entry.
- **Related decisions**: `docs/ai/decision-log.md` [2026-07-29] "terminal.pz.net cut over..."
- **Related mistakes**: `docs/ai/mistakes.md` [2026-07-29-022] (old `ttyd.service`'s `main`
  tmux session destroyed when the unit was stopped, not just made unreachable)

### [2026-07-29] Footer changed from sticky-after-content to a true fixed, always-visible bottom bar
- **Timestamp**: 2026-07-29 13:15 UTC
- **Change**: User reported "the footer got overwritten when the sessions overflowed" and, after clarification via `AskUserQuestion`, confirmed the actual requirement was that the footer be *persistently* visible at the bottom of the screen (never requiring a scroll to see it) -- not the flex/`margin-top:auto` sticky-footer behavior shipped in the two prior commits, which only appeared after scrolling to the end of a list long enough to fill the viewport. Changed `#sm-footer` to `position:fixed;left:0;right:0;bottom:0` (the same pattern already used by `src/kb.js`'s `#kb` toolbar and `#back-btn`), added its own background + `border-top` for visual separation from the scrolling content, and reserved `padding-bottom:calc(50px + env(safe-area-inset-bottom))` on `#sm-root` so the session list can fully scroll clear of the footer's footprint rather than being covered by it. Removed the now-unnecessary `min-height:100dvh`/flex-column/`margin-top:auto` machinery from `#sm-root`.
- **Rationale**: See `docs/ai/mistakes.md` [2026-07-29-021] -- this app already has an established fixed-overlay-with-reserved-footprint pattern for exactly this kind of persistent chrome element; the footer should have used it from the start instead of a generic sticky-footer recipe.
- **Affected areas**: `public/session-manager.html`, `docs/assets/screenshot-session-manager-mobile.png` (regenerated again, now showing the fixed footer with the original 3 realistic session labels)
- **Verification**: Live server boot; a Playwright sweep from 1 to 20 sessions (Pixel 7 viewport) checked two things at every count: (1) the footer is fully within the initial viewport with zero scrolling (`true` at every count, 1-20), and (2) after scrolling to the true bottom of the list, the gap between the last session row and the footer never goes negative (steady 24px clearance from count 10 onward, where the list first exceeds the viewport). Full Playwright suite re-run twice: one isolated failure (`android-mobile-stress.spec.js`'s Fn-row-toggle test, unrelated to this change) passed cleanly on immediate re-run and the full suite passed 55/55 on both full runs -- consistent with the documented flake class, not a regression. Screenshots taken of both the unscrolled and fully-scrolled states for visual confirmation. Temporary verification specs and test sessions deleted afterward; not committed.
- **Related mistakes**: `docs/ai/mistakes.md` [2026-07-29-021]

### [2026-07-29] Copyright footer added to the Session Manager screen
- **Timestamp**: 2026-07-29 12:05 UTC
- **Change**: Added `#sm-footer` (`&copy; 2026 shifulegend — NomadTTY`) to the bottom of
  `public/session-manager.html`'s `#sm-root`, reusing the exact copyright holder already
  established in `LICENSE`/`NOTICE` rather than inventing new attribution text.
- **Rationale**: User asked whether a copyright notice can be shown without registering
  it anywhere -- yes: copyright protection and the right to display a notice both arise
  automatically upon creation of an original work (Berne Convention); registration is
  optional and only needed for certain enhanced remedies (e.g. US statutory damages),
  never for the notice itself.
- **Affected areas**: `public/session-manager.html`, `docs/assets/screenshot-session-manager-mobile.png`
  (regenerated to reflect the new footer)
- **Verification**: Live server boot + curl confirmed the footer markup renders; a
  Playwright screenshot at the Pixel 7 mobile viewport confirmed zero horizontal
  overflow and correct centered placement below `#empty-state`, not overlapping any
  other element. Temporary verification spec deleted afterward; not committed.
- **Related decisions**: none new -- reuses the existing `LICENSE`/`NOTICE` copyright holder.

### [2026-07-29] Footer pinned to true screen bottom; NomadTTY icon+wordmark banner added
- **Timestamp**: 2026-07-29 12:20 UTC
- **Change**: Follow-up to the copyright footer entry above. User reported the footer
  sat mid-screen (right after `#empty-state`, with a large gap of unstyled black space
  below it) rather than at the actual bottom of the viewport. Fixed by making `#sm-root`
  a `display:flex;flex-direction:column` container with `min-height:100dvh` (with a
  `100vh` fallback declared first for older browsers) and giving `#sm-footer`
  `margin-top:auto` so it's pushed to the true bottom of the screen when content is
  short, while still flowing naturally right after the last session row when the list
  is long enough to fill/exceed the viewport (verified with 8 sessions -- footer
  appears after the last row, does not overlap or get clipped). `padding-bottom` on
  `#sm-root` now also accounts for `env(safe-area-inset-bottom)`, matching the existing
  `safe-area-inset-top` handling already used for the top padding. Also added a small
  `#sm-brand` row (`/favicon.svg` at 20x20 + "NomadTTY" in the app's blue accent,
  13px monospace, no bold/letter-spacing) above the `<h1>Session Manager</h1>` heading,
  answering the user's question about why no NomadTTY banner existed on the page --
  previously the app name appeared only in `<title>`/OG tags, never visibly on-page.
- **Rationale**: A sticky-footer pattern is the standard fix for "footer floats in the
  middle when content is short." The banner request was evaluated against `DESIGN.md`:
  its "avoid full-width banners" rule is scoped explicitly to the terminal grid/canvas,
  not the separate full-screen Session Manager modal state, so a small brand row here
  does not violate that constraint; kept to DESIGN.md's typographic rules (monospace,
  single blue accent, no bold/letter-spacing tricks, small utilitarian sizing).
- **Affected areas**: `public/session-manager.html`,
  `docs/assets/screenshot-session-manager-mobile.png` (regenerated again)
- **Verification**: Live server boot; Playwright screenshots at the Pixel 7 mobile
  viewport for both the empty-list state (footer flush with viewport bottom, ~20px
  gap matching the safe-area padding) and an 8-session list (footer flows after the
  last row, no overlap, zero horizontal overflow in both cases). Full Playwright suite
  re-run twice: one run showed a single isolated failure
  (`android-mobile-ux.spec.js`'s Back-button-overlap test) that passed cleanly on
  immediate re-run alone and again on a full second full-suite run (55/55 both times)
  -- consistent with the documented PTY-redraw-timing flake class in
  `tests/README.md`, not a regression from this change (which touches only
  `public/session-manager.html`, never the terminal/Back-button code path). **Follow-up
  re-verification** (user correctly pointed out the 8-session case never actually
  exceeded the viewport, so it hadn't really exercised the overlap scenario -- see
  `docs/ai/mistakes.md` [2026-07-29-020]): re-ran with 13 sessions, confirmed real
  overflow via `document.body.scrollHeight` (1085px) vs. the 839px viewport (`body`,
  not `documentElement`, is the actual `overflow-y:auto` scroll container here),
  scrolled `document.body.scrollTop` to the true bottom, and confirmed an 8px gap
  between the last visible session row and the footer with zero overlap. Temporary
  verification specs deleted afterward; not committed.
- **Related decisions**: none new.

### [2026-07-29] README's Session Manager screenshot restored to realistic session data
- **Timestamp**: 2026-07-29 12:55 UTC
- **Change**: While re-verifying the footer/overlap fix above, noticed
  `docs/assets/screenshot-session-manager-mobile.png` had been regenerated as an
  **empty-list** screenshot during the copyright-footer and banner work, silently
  regressing it from the original image (3 realistic sessions: `desktop-dpr1`,
  `claude — dotfiles repo`, `build watcher`) despite the README's own alt text still
  reading "showing two running sessions". Recreated the same three session labels and
  retook the screenshot, so it now shows the new banner/footer *and* matches its own
  alt text with realistic-looking content again.
- **Rationale**: A doc image should demonstrate the feature with realistic data, not
  the empty state, and must not silently drift out of sync with its own caption.
- **Affected areas**: `docs/assets/screenshot-session-manager-mobile.png`
- **Verification**: Playwright screenshot at the Pixel 7 viewport confirmed zero
  horizontal overflow with the three sessions present, banner visible at top, footer
  pinned at bottom. Sessions and temporary spec deleted afterward; not committed.
- **Related mistakes**: this was itself an undocumented regression introduced
  incidentally by the two commits above -- not significant enough on its own to
  warrant a dedicated `mistakes.md` entry, but recorded here per change-trace discipline.

### [2026-07-29] Comprehensive branding, SEO metadata, and favicon/manifest assets added
- **Timestamp**: 2026-07-29 11:39 UTC
- **Change**: Added page titles/meta description/theme-color/robots/Open Graph/Twitter
  Card tags and favicon/apple-touch-icon/manifest links to `public/session-manager.html`
  (static) and to `server/session-manager.js`'s `injectToolbar()` (now per-session
  dynamic, driven by `entry.label` and a server-computed `pageUrl`, with ttyd's own
  default `<title>`/favicon `<link>` stripped first via regex to avoid duplicates).
  Added `scripts/generate-icons.mjs` (pure Node core, no new dependency) generating
  `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icon-192.png`,
  `public/icon-512.png` -- a ">_" terminal-prompt glyph on the app's `#0052cc` accent
  blue. Added `public/manifest.webmanifest` and `public/robots.txt`
  (`noindex, nofollow` + `Disallow: /`, deliberate for a private auth'd tool). Extended
  `server/session-manager.js`'s `MIME` map and added a `BRANDING_ASSETS` static route
  list so these new files are served with correct `Content-Type`. Added an
  `escapeHtml()` helper so the user-supplied session `label` is safely interpolated
  into injected HTML (title, og:title).
- **Rationale**: Explicit task requirement for a holistic branding/SEO update across
  all routes, mobile-first, without disturbing the existing terminal DOM/layout.
- **Affected areas**: `public/session-manager.html`, `server/session-manager.js`,
  `scripts/generate-icons.mjs` (new), `public/favicon.svg` (new),
  `public/apple-touch-icon.png` (new), `public/icon-192.png` (new),
  `public/icon-512.png` (new), `public/manifest.webmanifest` (new),
  `public/robots.txt` (new)
- **Verification**: `node -c server/session-manager.js` syntax check; live server
  boot; curl checks of all 6 new static routes (200 + correct Content-Type); a live
  test session's `/term/<id>/` HTML inspected to confirm the injected title/meta/OG
  tags, escaped label, dynamic `og:url`, and removal of ttyd's own default
  title/favicon, then the test session deleted. Full Playwright suite
  (`cd tests && npx playwright test`) re-run: 55/55 passing, no regressions. Ad hoc
  Playwright screenshots taken at Pixel-7 (mobile) and 1440x900 (desktop) viewports
  of both `public/session-manager.html` and a live `/term/<id>/` page; each measured
  `document.documentElement.scrollWidth - clientWidth === 0` (zero horizontal
  overflow) and was visually inspected -- toolbar, Back button, and terminal
  alignment all unaffected by the new head-only tags. Temporary verification spec
  files and test-results were deleted afterward; not committed.
- **Related commit**: "feat: implement comprehensive branding, SEO metadata, and responsive layout updates"
- **Related decisions**: [2026-07-29] Branding/SEO overhaul targets the Session Manager
  model, not the legacy nginx sub_filter model

### [2026-07-29] Adapter sync for branding/SEO change
- **Timestamp**: 2026-07-29 11:45 UTC
- **Change**: Added the two new files (`scripts/generate-icons.mjs`,
  `public/*.{svg,png,webmanifest}` + `robots.txt`) to `CLAUDE.md`'s and
  `gemini/GEMINI.md`'s "Key files" tables. Added a "Branding & SEO metadata" bullet
  to `README.md`'s Session Manager features section.
- **Rationale**: Per `docs/ai/tool-sync-policy.md`, adapter files must not drift from
  canonical docs/new durable files. `.github/copilot-instructions.md` and `AGENTS.md`
  were left as-is: neither has a file-level table, and both already predate the
  Session Manager model entirely (a pre-existing gap, not introduced by this change) —
  reconciling that is a larger, separate effort out of scope here.
- **Affected areas**: `CLAUDE.md`, `gemini/GEMINI.md`, `README.md`
- **Related commit**: "feat: implement comprehensive branding, SEO metadata, and responsive layout updates"

### [2026-07-29] Added the dedicated on-screen-keyboard-toggle-during-generation test block requested but not fully covered by the prior stress-testing pass
- **Timestamp**: 2026-07-29 07:45 UTC
- **Change**: Added 6 new tests to `tests/specs/android-mobile-stress.spec.js`, each pairing an on-screen
  keyboard open/close reflow with a distinct concurrent condition during an active stream: (1) rapid
  repeated open/close cycles, (2) typing landing correctly mid-transition as the keyboard opens, (3)
  keyboard + Fn row open simultaneously, (4) keyboard + zoom simultaneously, (5) keyboard open + an
  aggressive scroll gesture, (6) tapping Back while the keyboard is open then re-Joining. Test 6 initially
  asserted `window.innerHeight` reset to full size after navigating away, which failed — Playwright's
  `setViewportSize` is sticky across navigation (unlike a real device's `visualViewport`, which reverts when
  the keyboard actually closes) — fixed by asserting the Session Manager renders usably at the still-reduced
  height instead, then explicitly restoring full height before re-Joining, matching what a real device does
  when the app backgrounds/navigates.
- **Rationale**: The prior stress-testing pass (previous change-trace entry) only exercised the on-screen
  keyboard in a single test combined with device rotation, and covered "exhaustive keyboard toggle" only
  *without* an active stream (in `android-mobile-ux.spec.js`). The original task explicitly asked for
  "at least 5 to 6 additional complex test scenarios involving the on-screen keyboard toggle during active
  model generation" as its own requirement — a gap flagged directly by the user after reviewing the first
  pass's summary, not caught during that pass itself.
- **Affected areas**: `tests/specs/android-mobile-stress.spec.js`, `.claude/rules/tests.md`,
  `tests/README.md`, `README.md`
- **Related commit**: (pending — follow-up to "test: implement rigorous android simulator testing and
  capture mobile screenshots")
- **Related decisions**: none new
- **Related mistakes**: none new (no additional bugs found by these 6 tests; they confirm the existing
  `updateLayout()` reflow mechanism and the already-fixed touch-scroll/toolbar-drag bugs hold up under
  keyboard-toggle-specific compound stress)

### [2026-07-29] Concurrent-interaction stress testing found and fixed a real screen-distortion bug and a real accidental-button-press bug
- **Timestamp**: 2026-07-29 07:20 UTC
- **Change**:
  - `src/kb.js`: disabled the terminal's touch-scroll wheel dispatch entirely (`initTouchScroll` now only
    calls `preventDefault()` on touchmove for iOS bounce suppression) — it always leaked Up/Down-arrow key
    escape sequences into the PTY as real input, since tmux never populates xterm.js's own client-side
    scrollback (every session runs inside tmux, a hard invariant). Added a capture-phase touch-drag guard
    on `#kb` so toolbar buttons no longer fire when a touch drags 150px+ across them (only a genuine,
    near-stationary tap registers) — a swipe used to scroll the toolbar row could otherwise trigger
    whatever button the finger started or passed over.
  - Added `scripts/simulate-model-stream.mjs` — a deterministic word-by-word streaming-text generator used
    by the new stress suite in place of a real downloaded local model (see decision-log.md).
  - Added `tests/helpers/stress.js` (`startStream`, `touchScrollTerminal`, `toggleOnScreenKeyboard`,
    `rotateDevice`, `collectPageErrors`) and `tests/specs/android-mobile-stress.spec.js` (8 tests):
    scrolling/typing during an active stream, device rotation with the on-screen keyboard simulated open,
    rapid Fn-row/zoom toggling during a stream, CTRL+C interrupting a stream via the toolbar, and tapping
    Back mid-stream then re-Joining. Added 2 more tests to `tests/specs/android-mobile-ux.spec.js`: a
    touch-drag-vs-tap regression test, and an exhaustive on-screen-keyboard-toggle reflow test.
  - `tests/helpers/ws-capture.js`: `waitForOutputLine()` now strips ANSI/VT escape sequences (and converts
    tmux's `ESC[<N>S` Scroll-Up sequences into real newlines first) before matching, since tmux can express
    a line landing at the bottom of the pane purely via cursor repositioning/scrolling with no literal
    `\r\n` byte anywhere in the stream — the old strict-newline check produced false-timeout failures on
    otherwise-correct output under this suite's heavier bottom-of-pane scroll load.
  - Captured new documentation screenshots (`docs/assets/screenshot-android-stress-*.png`) via
    `scripts/capture-android-stress-screenshots.mjs`, including a before/after pair showing the touch-scroll
    distortion and its fix.
- **Rationale**: Asked to rigorously stress-test mobile rendering under realistic concurrent-interaction
  conditions (typing/scrolling/rotating/toggling the keyboard while an AI-CLI-style stream is active) and to
  specifically verify no screen text distortion occurs and no accidental button presses occur from
  drag/scroll gestures. Both explicit asks turned up real, previously-undiscovered, always-reproducible bugs
  (not edge cases) — see mistakes.md 2026-07-29-018 and 2026-07-29-019 for full root-cause detail.
- **Affected areas**: `src/kb.js`, `scripts/simulate-model-stream.mjs` (new), `scripts/capture-android-stress-screenshots.mjs`
  (new), `tests/helpers/stress.js` (new), `tests/specs/android-mobile-stress.spec.js` (new),
  `tests/specs/android-mobile-ux.spec.js`, `tests/helpers/ws-capture.js`, `tests/README.md`,
  `.claude/rules/tests.md`, `CLAUDE.md`, `docs/ai/mistakes.md`, `docs/ai/decision-log.md`
- **Related commit**: "test: implement rigorous android simulator testing and capture mobile screenshots"
- **Related decisions**: 2026-07-29 "Touch-scroll-into-history is disabled...", 2026-07-29 "Mobile stress
  tests use a deterministic word-stream script instead of a downloaded local LLM"
- **Related mistakes**: 2026-07-29-018, 2026-07-29-019

### [2026-07-29] Rigorous mobile UX validation via Playwright device emulation; two real mobile bugs found and fixed
- **Timestamp**: 2026-07-29 06:40 UTC
- **Change**:
  - `server/session-manager.js`: default `TTYD_RENDERER_TYPE` changed from `canvas` to `dom` — the canvas
    renderer was found to draw glyphs at the wrong size specifically at real mobile `devicePixelRatio`
    values (e.g. Pixel 7's 2.625), a regression from the earlier webgl→canvas fix that had only been
    verified at desktop DPR=1.
  - `tests/helpers/session-manager.js`: `waitForTerminalReady()`'s selector changed from
    `.xterm-screen canvas` to `.xterm-screen` (renderer-agnostic — the `dom` renderer creates no
    `<canvas>` element). Stale "renders via WebGL/canvas" comments updated in `tests/README.md`,
    `tests/specs/terminal-interaction.spec.js`, `tests/helpers/ws-capture.js`.
  - `src/kb.js`: added `ev.stopPropagation()` to the CTRL/SHFT/ALT modifier-key intercept, fixing a
    double-send bug (the intercepted control byte AND the raw unmodified key both reached the PTY).
    Added `padding-right:48px` to `.kr` (the scrollable toolbar row) so scrolling it fully right no
    longer places the "A+" button directly under the fixed `#back-btn` circle, which fully covered and
    blocked it.
  - Added `tests/specs/android-mobile-ux.spec.js` — 4 new tests using Playwright's `devices['Pixel 7']`
    emulation: mobile Session Manager layout, Join→terminal-ready with a Back-button/terminal-canvas
    overlap geometry assertion, full Join→type→tap-Back→re-Join scrollback-preservation navigation, and
    the mobile-specific toolbar interactions (CTRL-toggle + key, Fn row, zoom) — the latter two tests are
    what caught the kb.js bugs above.
  - Documented all of the above in `docs/ai/mistakes.md` (2026-07-29-014 through -017) and
    `docs/ai/decision-log.md` (dom-renderer decision, Playwright-emulation-over-AVD decision).
- **Rationale**: Asked to rigorously validate mobile rendering/UX using device simulation. An Android AVD
  was ruled out (no `/dev/kvm`, no hardware virtualization in this environment — see decision-log) in
  favor of Playwright's device emulation, which still exercises the real variables that matter (viewport,
  DPR, touch) without the crash-prone software-emulation fallback the task's constraint explicitly warned
  against. Writing tests for the *specific* mobile interaction patterns (tap-to-toggle-then-type, swipe a
  scrollable toolbar to its end) — rather than just taking a screenshot and eyeballing it — is what
  surfaced both new kb.js bugs; neither is reachable through the existing desktop-DPR=1 suite's assertions.
- **Affected areas**: `server/session-manager.js`, `src/kb.js`, `tests/helpers/session-manager.js`,
  `tests/helpers/ws-capture.js`, `tests/specs/terminal-interaction.spec.js`, `tests/README.md`,
  `tests/specs/android-mobile-ux.spec.js` (new), `.claude/rules/tests.md`, `docs/ai/mistakes.md`,
  `docs/ai/decision-log.md`
- **Related commit**: "test: implement rigorous android simulator testing and capture mobile screenshots"
- **Related decisions**: 2026-07-29 "Session Manager's ttyd processes default to the dom renderer",
  2026-07-29 "Mobile UX validation uses Playwright device emulation, not a full Android emulator (AVD)"
- **Related mistakes**: 2026-07-29-014, 2026-07-29-015, 2026-07-29-016, 2026-07-29-017

### [2026-07-29] Automated test coverage for all 7 MCP tools; strengthened the "last joined" assertion
- **Timestamp**: 2026-07-29 05:15 UTC
- **Change**:
  - Added `tests/specs/mcp-tools.spec.js` — 24 tests covering all 7 MCP tools over real HTTP (Playwright's
    `request` fixture, no browser): protocol basics (`tools/list` shape, auth accept/reject),
    `get_screenshot` (plain + ansi + unknown-id error), `read_terminal_contents` (`head`/`tail`/`full`/
    `follow` SSE streaming), `scroll_buffer` (up/down/clamped-at-top), `type_command` (`submit:false` +
    denylist), `send_keystroke` (named Ctrl+C interrupt, hex-mode submit, validation errors),
    `get_process_status`, and `list_active_ports`.
  - Added `tests/helpers/mcp-client.js` (JSON-RPC/SSE request helper, `pollUntil`, `outputHasOwnLine`) and
    `apiCreateSession()` in `tests/helpers/session-manager.js`.
  - Changed `tests/playwright.config.js`'s `webServer` to boot `server/main.js` (Session Manager + MCP)
    instead of `server/session-manager.js` alone, with test-only MCP port/host/token/follow-timeout env
    vars in `tests/helpers/env.js`.
  - Fixed a real gap in `tests/specs/session-persistence.spec.js`: the "last joined" test asserted only
    `not.toContainText('never joined')`, which would still pass even if the timestamp rendered as
    something broken (empty string, `NaN:NaN:NaN`, etc.) — now asserts the positive shape, a real
    `H:MM:SS` clock-time pattern.
  - Along the way, repeated (and fixed) the exact "matched the input echo, not real output" bug already
    documented for the browser suite (`docs/ai/mistakes.md` 2026-07-29-009), this time in the new
    HTTP-based tests — see 2026-07-29-013.
  - Re-verified: 35/35 passing across many repeated full-suite runs (one isolated, unreproduced flake in
    roughly a dozen runs — consistent with the known PTY-redraw flakiness class, not a new regression).
- **Rationale**: User asked to test all MCP tools and specifically questioned whether the "last joined"
  text was tested correctly — it wasn't, rigorously; both gaps are now closed.
- **Affected areas**: `tests/specs/mcp-tools.spec.js` (new), `tests/helpers/mcp-client.js` (new),
  `tests/helpers/session-manager.js`, `tests/helpers/env.js`, `tests/playwright.config.js`,
  `tests/specs/session-persistence.spec.js`
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-013 (references 2026-07-29-009)

### [2026-07-29] Session Manager & Back button screenshots; fixed a layout recursion + a rendering bug
- **Timestamp**: 2026-07-29 04:50 UTC
- **Change**:
  - Added `scripts/capture-session-manager-screenshots.mjs` and captured
    `docs/assets/screenshot-session-manager-mobile.png` (Session Manager list, iPhone 14 viewport) and
    `docs/assets/screenshot-back-button-mobile.png` (terminal view with the Back button, iPhone 14 viewport).
  - Fixed `updateLayout()` in `src/kb.js`: added a re-entrancy guard to stop it from infinitely recursing
    via its own dispatched `resize` event (mistakes.md 2026-07-29-011).
  - Fixed `spawnSession()` in `server/session-manager.js`: ttyd now defaults to `rendererType=canvas`
    instead of WebGL, which was compositing incorrectly under headless/software-GPU rendering
    (mistakes.md 2026-07-29-012; decision-log.md same date).
  - Added `playwright` as a root devDependency so `scripts/*.mjs` capture tools are runnable via
    `npm install` (previously undeclared — a pre-existing gap in `scripts/capture-demo*.mjs` too).
  - Re-verified the Playwright suite (11/11) and `scripts/verify-mcp-agent.mjs` after both fixes.
- **Rationale**: Actually taking and looking at the requested screenshots surfaced two real bugs that no
  prior automated verification (which asserts on the WebSocket byte stream, not rendered pixels) had ever
  caught.
- **Affected areas**: `scripts/capture-session-manager-screenshots.mjs` (new), `docs/assets/*.png` (new),
  `src/kb.js`, `server/session-manager.js`, `package.json`
- **Related commit**: pending
- **Related decisions**: `docs/ai/decision-log.md` 2026-07-29 "canvas renderer" entry
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-011, 2026-07-29-012

### [2026-07-29] Independent MCP verification agent; fixed a get_screenshot/scroll_buffer bug it found
- **Timestamp**: 2026-07-29 04:40 UTC
- **Change**:
  - Added `scripts/verify-mcp-agent.mjs` — a standalone Node script (raw `fetch` + hand-rolled JSON-RPC/SSE
    parsing, no `@modelcontextprotocol/sdk`, no test framework) that creates a real session, authenticates
    to the MCP server, and sequences `type_command` → `get_screenshot` to prove the Streamable HTTP
    transport works end-to-end from a genuinely independent client implementation.
  - Running it against a freshly created session surfaced a real bug: fixed `captureViewport` in
    `server/mcp/tmux.js` to anchor on `#{cursor_y}` instead of tmux row 0, mirroring the `captureTail` fix
    from earlier the same day (mistakes.md 2026-07-29-008) that had not been applied to this sibling
    function. Re-verified both the fresh-session case (previously broken) and the full-pane
    `scroll_buffer` case (previously passing) after the fix.
- **Rationale**: A from-scratch client, run against a real fresh session rather than an artificially
  pre-filled one, caught a bug that manual testing with a full pane had coincidentally masked.
- **Affected areas**: `scripts/verify-mcp-agent.mjs` (new), `server/mcp/tmux.js`
- **Related commit**: pending
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-010

### [2026-07-29] MCP server: expose terminal sessions to local AI agents
- **Timestamp**: 2026-07-29 04:00 UTC
- **Change**:
  - Added `server/mcp/**` — an MCP "Streamable HTTP" (JSON-RPC + SSE) server built on
    `@modelcontextprotocol/sdk`, registering 7 tools: `get_screenshot`, `scroll_buffer`,
    `type_command`, `send_keystroke`, `read_terminal_contents` (with a `follow` mode that
    streams live output via MCP progress notifications over SSE), `get_process_status`,
    `list_active_ports`.
  - Added `server/main.js` as a composition root running the Session Manager and MCP
    server together in one process, sharing the same in-memory `sessions` registry.
  - Refactored `server/session-manager.js` to be requirable as a module (exports
    `sessions`/`spawnSession`/`closeSession`/`listSessions`/`shutdownAllSessions`/`start`)
    while remaining fully backward-compatible standalone (`node server/session-manager.js`
    behaves identically, including for `tests/playwright.config.js`'s webServer).
  - Changed `spawnSession()` to create the tmux session eagerly (`tmux new-session -d`)
    instead of relying on ttyd's lazy spawn-on-first-connect, so MCP tools work on a
    session immediately, with no browser ever attached.
  - Added root `package.json`/`package-lock.json` (`@modelcontextprotocol/sdk`, `zod`) —
    the first production npm dependency in this repo. Updated root `.gitignore`
    accordingly (it previously blanket-ignored `package.json`/`package-lock.json`).
  - 11/11 existing Playwright tests re-verified passing after every change in this set.
- **Rationale**: Let local AI agents drive NomadTTY terminals (screenshot/scroll/type/
  keystroke/read/process-status/port-list) over a standard, LAN-reachable protocol.
- **Affected areas**: `server/mcp/**` (new), `server/main.js` (new), `server/session-manager.js`,
  `package.json`/`package-lock.json` (new), `.gitignore`
- **Related commit**: pending
- **Related decisions**: see `docs/ai/decision-log.md` 2026-07-29 entries (four total: eager
  tmux creation, MCP as a second listener, bearer-token auth model, screenshot-as-text,
  first npm dependency)
- **Related mistakes**: `docs/ai/mistakes.md` 2026-07-29-007 (tmux `-F` tab sanitization),
  2026-07-29-008 (tail capture must anchor on `cursor_y`, not `pane_height`)

### [2026-06-25] Real-device screenshots — iPhone 15 Pro Max (OCR-masked)
- **Timestamp**: 2026-06-25 14:00 UTC
- **Change**: Added 4 real-device screenshots to `docs/assets/`:
  - `real-device-01-toolbar-claude-help.png` — full terminal view, toolbar and Claude Code `/help`
  - `real-device-02-keyboard-open.png` — iOS software keyboard open, terminal above it
  - `real-device-03-keyboard-appearing.png` — keyboard slide-in frame, toolbar fixed at top
  - `real-device-04-claude-ai-output.png` — Claude Code AI response streamed in terminal
  - All sensitive fields (session UUID, server IP/hostname, private URL, git branch name) redacted
    using Tesseract 5 OCR-derived bounding boxes; zero-leakage verified with a second OCR pass.
  - README.md: added "Real device — iPhone 15 Pro Max" section with 2×2 screenshot grid.
- **Rationale**: Playwright device emulation shows viewport layout but not real iOS rendering.
  Real-device shots prove the keyboard resize, toolbar, and layout behaviour on actual hardware.
- **Affected areas**: `docs/assets/` (4 new PNGs), `README.md`
- **Related commit**: pending
- **Related decisions**: none new

### [2026-06-25] install.sh — hostname validation + health check + uninstall instructions
- **Timestamp**: 2026-06-25 12:10 UTC
- **Change**:
  - Added `NOMADTTY_HOST` regex validation (hostname chars only) before sed injection
    — resolves the TODO in `.claude/rules/config.md`.
  - Added post-install health check: `curl` hits `http://127.0.0.1/` and prints
    `HTTP 200 OK` or a warning with log pointers.
  - Added step-by-step echo progress (`==> Installing...`, `==> Configuring...`).
  - Added inline uninstall instructions in the success output.
  - README install section expanded: config options table, env var examples, uninstall
    commands, troubleshoot commands, what the installer does step-by-step.
- **Rationale**: Users reported confusion about what the installer does and how to
  reconfigure after initial install. "1-step for anyone" requires clear feedback.
- **Affected areas**: `install.sh`, `README.md`
- **Related commit**: pending
- **Related decisions**: none new

### [2026-06-25] Demo assets — Playwright screenshots and GIFs
- **Timestamp**: 2026-06-25 12:05 UTC
- **Change**: Added 6 visual assets to `docs/assets/`:
  - `demo-mobile.gif` (441 KB) — iPhone 14 viewport, shows CTRL + Fn row
  - `demo-desktop.gif` (4.9 MB, 960px) — desktop 11s walkthrough
  - `screenshot-desktop.png`, `screenshot-iphone14.png`, `screenshot-pixel7.png`
  - `screenshot-toolbar-fn.png` — CTRL (blue) + F1-F12 row expanded
  - Capture scripts in `scripts/capture-demo.mjs` and `capture-demo2.mjs`
  - README.md: added Demo section with GIF + side-by-side device table
- **Rationale**: README needed visual proof of the mobile-first UX for new visitors.
- **Affected areas**: `docs/assets/`, `scripts/`, `README.md`, `.gitignore`
- **Related commit**: 9dd0701

### [2026-06-25] Repository enhancement — Dependabot, CODEOWNERS, README overhaul, SECURITY
- **Timestamp**: 2026-06-25 00:00 UTC
- **Change**:
  - Added `.github/dependabot.yml` — weekly Docker and GitHub Actions CVE scanning.
  - Enhanced `.github/CODEOWNERS` — component-specific ownership routing for nginx,
    systemd, kb.js, Dockerfile, install.sh, SECURITY.md, and docs/ai/.
  - Overhauled `README.md` — Mermaid architecture diagram, VirtualKeyBar section with
    actual JS code snippet from kb.js, Security Posture table, reference-style links,
    expanded Tailscale section, all fenced blocks with language tags.
  - Enhanced `SECURITY.md` — added Dependabot section, expanded hardening table with
    priority ratings and rate-limiting recommendation.
  - Added `docs/ai/decision-log.md` entries for Mermaid diagram and Dependabot decisions.
- **Rationale**: Strategic promotion blueprint analysis identified gaps vs. leading
  terminal repositories: missing automated dependency scanning, weak CODEOWNERS routing,
  no visual architecture diagram, missing VirtualKeyBar documentation, and no security
  posture summary in README.
- **Affected areas**: `.github/dependabot.yml`, `.github/CODEOWNERS`, `README.md`,
  `SECURITY.md`, `docs/ai/decision-log.md`, `docs/ai/change-trace.md`
- **Related commit**: pending
- **Related decisions**: [2026-06-25] Mermaid diagram, [2026-06-25] Dependabot

### [2026-06-20] Fix mobile keyboard overlap — iOS Safari (v2, explicit height)
- **Timestamp**: 2026-06-20 07:05 UTC
- **Change**: Rewrote `updateLayout()` in `src/kb.js`:
  (1) Use `visualViewport.height` for explicit `height` instead of `bottom` — iOS Safari's
  `position:fixed + bottom:X` is unreliable when the keyboard is open.
  (2) Replace `cssText +=` with `cssText =` (full replace) to prevent duplicate property
  accumulation confusing Safari's style engine.
  (3) Add `window.scrollTo(0,0)` in `visualViewport` listener to reset iOS layout-viewport
  scroll that occurs when a textarea is focused even with `overflow:hidden` on body.
- **Rationale**: First fix (bottom calculation) was correct for Android but still broken
  on iOS Safari due to position:fixed/bottom behavior and cssText accumulation.
- **Affected areas**: `src/kb.js`
- **Related decisions**: [2026-06-20] Responsive layout via visualViewport + dvh + touch-action

### [2026-06-20] Fix mobile keyboard overlapping terminal cursor (iOS + all tablets)
- **Timestamp**: 2026-06-20 06:55 UTC
- **Change**: `updateLayout()` in `src/kb.js` now computes keyboard intrusion height via
  `visualViewport` and passes it as `bottom` on `#terminal-container` instead of
  hardcoding `bottom:0`. Added `visualViewport.scroll` listener alongside the existing
  `resize` listener to catch iOS visual-viewport vertical shifts.
- **Rationale**: On iOS/iPad Safari the layout viewport never shrinks when the on-screen
  keyboard opens; only `visualViewport.height` shrinks. Hardcoded `bottom:0` let the
  terminal extend behind the keyboard, hiding the cursor. Android with
  `interactive-widget=resizes-content` already shrinks `window.innerHeight`, so
  `keyboardH` evaluates to 0 there — no double-correction.
- **Affected areas**: `src/kb.js`
- **Related decisions**: [2026-06-20] Responsive layout via visualViewport + dvh + touch-action

### [2026-06-20] ttyd service changed from User=root to User=ubuntu
- **Timestamp**: 2026-06-20 06:33 UTC
- **Change**: `systemd/ttyd.service` `User=root` → `User=ubuntu`; applied to live
  `/etc/systemd/system/ttyd.service`; service restarted.
- **Rationale**: Root's `$PATH` lacks `/home/ubuntu/.local/bin/`, so `claude` was not
  found in NomadTTY sessions. Root also cannot access `/home/ubuntu/.claude/` credentials.
- **Affected areas**: `systemd/ttyd.service`, `.claude/rules/infra.md`,
  `docs/ai/decision-log.md`
- **Related commit**: pending
- **Related decisions**: [2026-06-20] Run ttyd as deploy user (ubuntu), not root

### [2026-06-20] Cross-tool AI development system added
- **Timestamp**: 2026-06-20 06:10 UTC
- **Change**: Added `docs/ai/**` shared canonical docs, `.claude/**` Claude Code adapter,
  `.github/**` Copilot adapter, `gemini/GEMINI.md` + `AGENTS.md` + `.agents/**`
  Antigravity adapter. See `docs/ai/tool-sync-policy.md` for sync rules.
- **Rationale**: Enable any of Claude Code, GitHub Copilot, or Google Antigravity to
  continue development with full project context and consistent engineering rules.
- **Affected areas**: entire repo (new files only; no source changes)
- **Related commit**: "chore: add cross-tool AI development system (docs/ai, CLAUDE.md, Copilot, Antigravity)"

### [2026-06-20] Responsive layout overhaul (visualViewport, dvh, touch-action)
- **Timestamp**: 2026-06-20 05:45 UTC
- **Change**: `src/kb.js` updated with visualViewport resize listener, dvh CSS,
  touch-action: pan-y, overscroll-behavior: none, position:fixed terminal container.
  Viewport meta added to both nginx sub_filter injections.
- **Rationale**: Terminal layout broke when mobile keyboard appeared. Research agent
  confirmed these are 2024–2026 best practices for mobile web terminal responsiveness.
- **Affected areas**: `src/kb.js`, `nginx/ttyd.conf`, `/etc/nginx/sites-available/tailscale-router`
- **Related commit**: "feat(kb.js): responsive layout — visualViewport, dvh, touch-action"
- **Related decisions**: 2026-06-20 Responsive layout decision

### [2026-06-20] Toolbar moved to top; hardcoded Ctrl combos removed; sticky modifiers
- **Timestamp**: 2026-06-20 05:30 UTC
- **Change**: Toolbar repositioned from bottom to top. Removed C-b, C-c, C-d, etc.
  buttons. CTRL/SHFT/ALT are now sticky toggles; keydown interceptor sends modified bytes.
- **Rationale**: User feedback. Top placement matches Termius. Sticky modifiers are the
  best-practice approach for mobile terminal modifier keys.
- **Affected areas**: `src/kb.js`
- **Related decisions**: 2026-06-20 toolbar position, 2026-06-20 sticky modifiers

### [2026-06-20] Initial release — NomadTTY v0.1.0
- **Timestamp**: 2026-06-20 05:00 UTC
- **Change**: Initial repository with `src/kb.js`, `nginx/ttyd.conf`,
  `systemd/ttyd.service`, `Dockerfile`, `docker-compose.yml`, `install.sh`,
  `LICENSE` (MIT), `NOTICE` (third-party attribution), `README.md`.
- **Rationale**: First public release of NomadTTY.
- **Affected areas**: entire repository
- **Related commit**: "Initial release: NomadTTY mobile-friendly web terminal"
