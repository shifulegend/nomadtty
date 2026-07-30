# NomadTTY — Decision Log
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-07-30 -->

## Entry Template
```
### [YYYY-MM-DD] <decision title>
- **Context**: why a decision was needed
- **Decision**: what was chosen
- **Alternatives considered**: what else was evaluated
- **Rationale**: why this was chosen
- **Consequences**: what this means going forward
- **Owner**: who made or approved the decision
```

---

### [2026-07-30] Docker base image switched from ubuntu:26.04 to alpine:3.20 (~4x smaller); CI gained nginx-config and Playwright jobs
- **Context**: The competitive-analysis backlog's item 20 asked to re-evaluate a smaller
  base image "now that ttyd's apt availability is confirmed" — but that framing itself
  assumed apt (Ubuntu/Debian) was the only viable path, per the original 2026-06-20
  decision's claim that Alpine lacks a ttyd package. Re-checking that claim directly
  (rather than trusting it) found it was simply wrong: `ttyd` has been in Alpine's
  `community` repo since 2024-04-02, alongside `nodejs`/`npm`/`nginx`/`tmux` — see
  `docs/ai/mistakes.md` 2026-07-30-004.
- **Decision**: `Dockerfile`'s base image is now `alpine:3.20`. `docker-entrypoint.sh`'s
  `NOMADTTY_HOST` substitution now targets Alpine's nginx vhost path
  (`/etc/nginx/http.d/nomadtty.conf`) instead of Debian/Ubuntu's `sites-available`/
  `sites-enabled` (which `install.sh`'s separate bare-metal path still uses, unaffected).
  Also wired two previously-TODO CI jobs into `.github/workflows/ci.yml`: `nginx-config`
  (installs nginx, drops in `nginx/ttyd.conf` exactly like `install.sh` does, runs
  `nginx -t`) and `playwright` (full 63-test suite: `npm ci` at root and in `tests/`,
  install ttyd/tmux, install Playwright browsers, run the suite, upload the HTML report
  as an artifact on failure) — previously only `shellcheck` and `docker-build` ran in CI,
  meaning the project's primary verification mechanism (the Playwright suite) had never
  actually been checked by CI at all.
- **Alternatives considered**: `debian:bookworm-slim` — checked directly (`apt-cache
  policy ttyd` on a real `debian:bookworm-slim` container) and confirmed Debian's
  official archive does **not** package `ttyd` at all (candidate: none), ruling it out
  immediately, unlike Alpine. Hard-pinning exact package versions in either package
  manager (`ttyd=1.7.7-r0`, etc.) for reproducibility — rejected: both Alpine's and
  Debian/Ubuntu's official archives generally retain only the current version of a
  package, so a hard pin would eventually break the build outright once the archive
  rotates past that exact version, trading reproducibility for a worse failure mode.
  Actual versions are recorded in `docs/ai/project-overview.md`'s Stack table instead,
  for audit purposes without the brittleness.
- **Rationale**: A ~4.2x image-size reduction (163MB vs. 686MB for an otherwise-identical
  image, both freshly built for direct comparison) with zero functional regression is a
  clear, low-risk win once the underlying assumption blocking it turned out to be false.
- **Consequences**: `install.sh`'s bare-metal (Debian/Ubuntu apt-based) path is completely
  unaffected — this is a Docker-only change. Multi-arch (`linux/arm64`) support for the
  new Alpine-based image was not independently verified in this session (no arm64
  hardware/emulation available) — flagged as a residual gap in
  `docs/ai/project-overview.md`'s TODO list, not assumed to work. Verified end-to-end:
  real `docker build` + `docker run` of the exact committed `Dockerfile`/
  `docker-entrypoint.sh` (via a temporary, sandbox-only build-context workaround for this
  environment's TLS-intercepting proxy — never present in the shipped files), HTTP 200,
  a real session created via the API spawning genuine `ttyd`/`tmux` processes, the
  resulting `/term/<id>/` page correctly toolbar-injected, MCP server correctly enforcing
  auth (401 without a token), and `NOMADTTY_HOST` substitution correctly rewriting the
  Alpine-path nginx config.
- **Owner**: claude (session doing a "no compromise" pass on the competitive-analysis
  backlog, per explicit user direction).

---

### [2026-07-30] install.sh persists its own settings in /etc/nomadtty/nomadtty.env, not just MCP_AUTH_TOKEN
- **Context**: The competitive-analysis backlog's item 12 flagged NomadTTY's two
  historically-disjoint config surfaces. Investigating what "unify" should concretely mean
  now that there's one deployment model (see the entry above this one's sibling from
  earlier today), the real remaining gap was operational, not architectural: `install.sh`
  already persisted `MCP_AUTH_TOKEN` across re-runs, but every *other* setting
  (`NOMADTTY_HOST`, `NOMADTTY_USER`, `NOMADTTY_TLS`, `NOMADTTY_TLS_EMAIL`,
  `NOMADTTY_BASIC_AUTH`) silently reset to its default the moment an operator ran
  `sudo bash install.sh` again without re-supplying the exact same env vars — e.g. a bare
  upgrade re-run could silently disable a previously-configured Basic Auth layer.
- **Decision**: `install.sh` now reads `/etc/nomadtty/nomadtty.env` at the very top (via a
  small `_stored()` helper) and uses any previously-written value for those five settings
  as the fallback default — an explicitly-passed env var this run still takes priority.
  All five are now also written into `nomadtty.env` on every run (previously only
  `MCP_AUTH_TOKEN`/`MCP_PORT`/`MCP_HOST`/`SESSION_MANAGER_PORT` were).
- **Alternatives considered**: A second, separate "install state" file distinct from the
  `server/**`-runtime env file — rejected as unnecessary complexity; `nomadtty.env` is
  already install.sh's own generated, `chmod 600` artifact, and Node simply ignores the
  extra keys it doesn't read, so one file serving both purposes is simpler to reason about
  than two files that must stay in sync.
- **Rationale**: A real config-file model's defining property is that it's the durable
  record an operator doesn't have to keep re-supplying — this makes `install.sh` behave
  that way in practice, not just on paper.
- **Consequences**: Re-running `install.sh` with no env vars now repeats the previous
  install exactly, including Basic Auth/TLS/host settings — verified in a disposable
  container (custom `NOMADTTY_HOST`+`NOMADTTY_BASIC_AUTH` set on run 1, zero settings
  passed on run 2, nginx config regenerated identically both times). Discovered and fixed
  a real, previously-latent bug during this verification: the health check's own
  `curl`-into-`set -e` pattern could silently abort the script before printing its own
  diagnostic output — see `docs/ai/mistakes.md` 2026-07-30-003 (this predates today's other
  changes; it was only surfaced now because verifying idempotency required running the
  script against a container with no backend actually listening yet).
- **Owner**: claude (session doing a "no compromise" pass on the competitive-analysis
  backlog, per explicit user direction).

---

### [2026-07-30] install.sh gets opt-in TLS (Certbot) and Basic Auth; default rate limiting moves into nginx/ttyd.conf itself
- **Context**: The competitive-analysis backlog (`docs/competitive-analysis.md`) flagged
  several SECURITY.md-recommended hardening items ("Enable HTTPS", "Add nginx auth_basic
  or OAuth2 proxy", "Rate-limit nginx connections") as documented recommendations only,
  never actually implemented or offered as a supported option.
- **Decision**: `install.sh` gained `NOMADTTY_TLS=certbot` (+ `NOMADTTY_TLS_EMAIL`), which
  runs `certbot --nginx --non-interactive --agree-tos -m ... -d ... --redirect` after
  nginx is already live serving the domain over HTTP (required for the ACME HTTP-01
  challenge); failure is caught and reported without aborting the install, since HTTP
  already works at that point. `install.sh` also gained `NOMADTTY_BASIC_AUTH=user:pass`,
  which generates an htpasswd file (`chown root:www-data`, `chmod 640` — see
  `docs/ai/mistakes.md` 2026-07-30-002 for why the ownership matters) and injects
  `auth_basic`/`auth_basic_user_file` into the `location /` block; unsetting it on a
  re-run cleanly removes both. `nginx/ttyd.conf` itself (shared by Docker and
  `install.sh`) gained a default `limit_req_zone`/`limit_req` (10r/s, burst 20) — on by
  default rather than left as a recommendation, since it's a config-only change with no
  operator action required.
- **Alternatives considered**: A full OAuth2 reverse-proxy integration (e.g.
  oauth2-proxy) instead of/alongside `auth_basic` — rejected as disproportionate scope
  for this pass; `auth_basic` is a real, immediately-useful hardening layer that doesn't
  require standing up a second service, and SECURITY.md's own recommendation already
  treats `auth_basic` and an OAuth2 proxy as equivalent-tier options, not sequential
  requirements. Defaulting `NOMADTTY_TLS` to `certbot` — rejected: most of this project's
  documented audience deploys behind Tailscale (which already gets HTTPS via `tailscale
  serve`), and forcing a public-DNS assumption (Certbot needs a real domain + reachable
  port 80) onto every install would break the common Tailscale-only case; kept opt-in.
  A `Content-Security-Policy` header — deferred, not implemented in this pass (see
  `docs/ai/project-overview.md`'s TODO list): needs compatibility testing against kb.js's
  inline WebSocket hook and ttyd's bundled xterm.js first, and shipping an untested CSP
  header risks silently breaking the toolbar rather than hardening anything.
- **Rationale**: These are the concrete, lowest-risk-per-value items from SECURITY.md's
  own hardening table that could be turned from "documented recommendation" into "a real,
  tested, one-flag option" without requiring a new standing service or an unverified
  browser-security header change.
- **Consequences**: New `install.sh` env vars documented in `.claude/rules/config.md` and
  README.md. Certbot's actual cert issuance could not be verified end-to-end in this
  session's sandbox (no real public DNS record can point at an ephemeral container) —
  verified instead: the dependency installs correctly, validation fast-fails correctly
  when `NOMADTTY_HOST`/`NOMADTTY_TLS_EMAIL` are missing, and a real (expected) certbot
  failure against an unresolvable test domain does not abort the rest of the install.
  Basic Auth was verified fully end-to-end (401/401/200 for no-creds/wrong-creds/
  correct-creds) after fixing the ownership bug found during that verification.
- **Owner**: claude (session doing a "no compromise" pass on the competitive-analysis
  backlog, per explicit user direction).

---
```
### [YYYY-MM-DD] <decision title>
- **Context**: why a decision was needed
- **Decision**: what was chosen
- **Alternatives considered**: what else was evaluated
- **Rationale**: why this was chosen
- **Consequences**: what this means going forward
- **Owner**: who made or approved the decision
```

---

### [2026-07-30] Docker/install.sh now run the Session Manager + MCP backend, not raw ttyd (unifies the two deployment models)
- **Context**: A closed-source-style competitive analysis (`docs/competitive-analysis.md`)
  flagged the two-deployment-model split as NomadTTY's biggest structural gap. While
  scoping the fix, actually building and running the shipped `Dockerfile` surfaced a
  live, severe bug (not just a gap): `docker run -d -p 80:80 nomadtty` — the README's own
  documented quickstart — returned `502 Bad Gateway` on every request. See
  `docs/ai/mistakes.md` 2026-07-30-001 for the full root cause: `nginx/ttyd.conf` was
  rewritten in commit `55a5208` to proxy to the Node Session Manager (`127.0.0.1:4000`),
  but `Dockerfile`/`docker-entrypoint.sh`/`install.sh`/`systemd/ttyd.service` were never
  updated to actually run it — they still installed and exec'd raw `ttyd` on `:47821`
  directly, which nginx no longer talks to.
- **Decision**: `Dockerfile` and `docker-entrypoint.sh` now install Node.js/npm alongside
  ttyd/tmux/nginx, `npm ci --omit=dev` the backend, and exec `node server/main.js`
  (Session Manager + MCP, the architecture that already runs production
  `terminal.pz.net`) as the foreground process, with nginx started in the background
  proxying to it — exactly matching what `nginx/ttyd.conf` already expects. ttyd is no
  longer run standalone by Docker/install.sh; it's spawned per-session by
  `server/session-manager.js`, same as every other deployment of this architecture.
  `docker-entrypoint.sh` auto-generates `MCP_AUTH_TOKEN` via `openssl rand -hex 32` when
  the operator doesn't supply one via `-e`, and prints it once to `docker logs` — mirrors
  Portainer's setup-token-in-logs pattern (researched in the competitive analysis) rather
  than requiring the operator to invent a secret by hand.
- **Alternatives considered**: Building an entirely separate installer/Dockerfile
  specifically for the Session Manager + MCP model, leaving the legacy raw-ttyd path
  as-is — rejected once the raw-ttyd path was confirmed actively broken (not just an
  older, still-functional alternative); there is no working "legacy model" left to
  preserve as a separate option, since its own nginx config was already pointed at the
  new backend. Reverting `nginx/ttyd.conf` back to proxying raw ttyd directly instead —
  rejected: the Session Manager (multi-session UI, MCP tools) is strictly more capable
  and is what production already runs; reverting would be a regression, not a fix.
- **Rationale**: The fix for the critical bug and the "unify the two deployment models"
  backlog item are the same change — nginx already committed to the Session Manager
  architecture; the correct fix makes the process behind it match, not the reverse.
- **Consequences**: `EXPOSE`s port `4200` (MCP) in addition to `80`; operators must
  `docker run -p 4200:4200` (and ideally `-e MCP_AUTH_TOKEN=...` of their own) to reach
  the MCP server from outside the container — matches this project's existing
  loopback-vs-LAN security posture (`docs/ai/decision-log.md`'s "MCP auth is a mandatory
  bearer token" entry), just now reachable via Docker's own port-publishing model instead
  of a bare-metal LAN bind. `docker-compose.yml`, `install.sh`, and
  `systemd/nomadtty.service` needed the equivalent fix — tracked as the same change,
  applied next in this session. Verified end-to-end: rebuilt image, real `docker run`,
  `curl` returning the Session Manager UI (HTTP 200, not 502), a session created via the
  real HTTP API spawning genuine `ttyd`+`tmux` processes inside the container, and the
  resulting `/term/<id>/` page confirmed serving `kb.js`/`window._S`/xterm markers.
- **Owner**: claude (session doing a "no compromise" pass on the competitive-analysis
  backlog, per explicit user direction to prioritize every action item and fix them).

---

### [2026-07-29] Mobile touch-scroll re-enabled by driving real tmux copy-mode, with a mandatory MCP self-heal (supersedes "disabled" below)
- **Context**: A user reported being unable to scroll a session with long
  output on mobile Safari. Root cause: touch-scroll had been intentionally
  disabled (see the entry directly below and mistakes.md 2026-07-29-018)
  after it was found to leak arrow-key escape sequences into the PTY. That
  fix's own follow-up note suggested driving tmux's copy-mode/history
  instead of xterm.js's client buffer, but left it unimplemented. The user
  explicitly required the fix not interfere with the MCP server, which acts
  on the exact same tmux panes concurrently.
- **Decision**: `src/kb.js` gained a sticky "Hist" toolbar toggle. While
  on, a swipe on the terminal POSTs `enter`/`scroll` actions to a new
  `POST /api/sessions/:id/copy-scroll` endpoint (`server/session-manager.js`),
  which runs `tmux copy-mode` / `tmux send-keys -X scroll-up|scroll-down`
  against the pane (new primitives in `server/mcp/tmux.js`: `isInCopyMode`,
  `enterCopyMode`, `exitCopyModeIfActive`, `scrollCopyMode`, all via a
  timeout-bounded `execFileSync` call, `COPY_MODE_TIMEOUT_MS=2000`). Because
  ttyd is already an attached tmux client for that pane, tmux's own
  multi-client redraw mechanism pushes the scrolled view into the browser's
  existing WebSocket automatically -- no separate fetch/render path needed
  client-side, and this gesture never calls `window._S.send()`, so it
  cannot resurrect the original arrow-key-leak bug even in principle.
  Critically: every MCP "send" tool (`sendLiteral`/`sendEnter`/
  `sendNamedKeys`/`sendHexKeys` in `server/mcp/tmux.js`) now calls
  `exitCopyModeIfActive()` FIRST, unconditionally -- an agent's command
  always forces the pane back to live before it's sent, so a human mid-scroll
  can never break a concurrent MCP call. `kb.js` also force-exits copy-mode
  once on every fresh page load, so a tab closed/backgrounded mid-scroll
  can't leave a session permanently stuck for the next viewer.
- **Alternatives considered**: A read-only capture-pane snapshot rendered
  into a separate client-side overlay (no pane-mode mutation at all, so
  structurally zero MCP interference) -- initially proposed and rejected by
  the user in favor of a more native-feeling live-scrolling experience.
  Driving copy-mode via literal prefix-key bytes through the PTY (mimicking
  a real user's keychord) -- rejected: fragile against a user's configured
  tmux prefix key, and still goes through the exact `tmux send-keys`
  literal-injection code path found unsafe under copy-mode (see below).
- **Rationale**: Empirical investigation (see mistakes.md's matching entry)
  found `tmux send-keys -l`/a plain named key targeting a pane already in
  copy-mode either fails ("no current client", no client attached) or hangs
  indefinitely (a real pty-backed client attached) -- unacceptable for an
  MCP tool call, since a hang would freeze this whole single-threaded Node
  process. But `tmux copy-mode` / `send-keys -X ...` (copy-mode commands,
  as opposed to literal/named-key input) were fast and safe as a detached,
  no-client script call in every test run. This makes the self-heal
  approach both correctness-preserving (an agent's send always still reaches
  the shell) and low-risk (copy-mode enter/scroll/cancel calls themselves
  don't hit the unsafe code path). The genuinely-attached-client condition
  for the `-X` commands specifically could not be fully reproduced in this
  sandbox (ttyd only registers as a tmux client after its own WS
  subprotocol handshake, not a bare WebSocket upgrade) -- the 2s bounded
  timeout on these new calls exists specifically to cap the blast radius of
  that residual, unconfirmed gap, not because a problem was observed there.
- **Consequences**: `capture-pane`-based MCP reads (`get_screenshot`,
  `read_terminal_contents`, `scroll_buffer`) were already unaffected by
  copy-mode (verified: `#{cursor_y}`, which they anchor on, tracks the live
  shell cursor, not the copy-mode scroll position) -- only the "send" tools
  needed the new guard. New env var `SESSION_MANAGER_SCROLL_LINES_MAX`
  (default 200) bounds a single scroll request's line count -- hygiene, not
  a security boundary, since this endpoint is loopback-only like the rest
  of the Session Manager API. New tests: `tests/specs/android-mobile-ux.spec.js`
  (Hist toggle reveals real scrollback, zero PTY input bytes sent) and
  `tests/specs/mcp-tools.spec.js`'s new "touch-history (copy-mode) / MCP
  interop" describe block (type_command/send_keystroke still land in the
  shell, not copy-mode, while a human is mid-scroll).
- **Owner**: User (explicit direction on the copy-mode-vs-read-only-overlay
  tradeoff via AskUserQuestion), implemented by claude.


### [2026-07-29] New tmux sessions start in the deploy user's home directory, not the repo checkout
- **Context**: User reported every new terminal session opens with cwd
  `/home/ubuntu/nomadtty` (this app's own repo checkout) instead of
  somewhere a user would actually expect a fresh shell to start. Root
  cause: `spawnSession()`'s `tmux new-session -d -s <id>` call never passed
  `-c <dir>`, so tmux silently inherited the CWD of the Session Manager
  process itself (wherever `node server/main.js` was launched from --
  effectively `systemd/nomadtty.service`'s `WorkingDirectory`).
- **Decision**: `spawnSession()` now passes `-c $SESSION_START_DIR`, a new
  module-level constant computed from `SESSION_MANAGER_START_DIR` (env var)
  falling back to `os.homedir()` (the deploy user's home -- matches
  ordinary terminal-emulator convention), with a final fallback to the repo
  root if the configured/resolved directory doesn't actually exist on disk
  (a bad env var must not break session creation entirely).
- **Alternatives considered**: Hardcoding `/root` or `/home/<user>` directly
  -- rejected, violates this project's own no-hardcoding rule and wouldn't
  generalize past this one host/deploy user. Requiring the env var with no
  default -- rejected as unnecessary friction; `os.homedir()` already gives
  the right answer in the common case (this app already runs as the deploy
  user, not root, per the 2026-06-20 "Run ttyd as deploy user" decision).
- **Rationale**: A general-purpose terminal app's fresh sessions should
  start where a user expects (home directory), not incidentally wherever
  the wrapping service's own working directory happens to be -- that was
  never an intentional design choice, just an unset default falling through
  to `tmux new-session`'s own inherited-CWD behavior.
- **Consequences**: Only affects sessions created *after* this change ships
  (existing live tmux sessions are unaffected until closed/recreated, and a
  running session's cwd can still be freely `cd`'d regardless). New env var
  documented in `.claude/rules/config.md`.
- **Owner**: User (explicit request), implemented by claude.

### [2026-07-29] Added session-lifecycle MCP tools (list_sessions/create_session/close_session)
- **Context**: While verifying the terminal.pz.net cutover (see the entry immediately
  below), the user asked whether an AI agent could list, create, or close NomadTTY
  sessions via MCP. It could not: all 7 existing tools require an already-known
  `terminal_id`, and session lifecycle only existed on the Session Manager's own HTTP
  API (`/api/sessions`), which is loopback-only and unreachable from where the MCP
  server is deliberately exposed (LAN + Tailscale, per the same cutover's explicit
  request for cross-device agent access).
- **Decision**: Added 3 tools wired directly to `server/session-manager.js`'s existing
  `spawnSession`/`closeSession`/`listSessions` functions (no new tmux/process logic —
  reused what the HTTP API already uses). Threaded these three functions through
  `server/mcp/index.js` and `server/main.js` the same explicit-dependency-passing way
  `sessions` (the registry Map) already was, rather than having `tools.js` `require()`
  `session-manager.js` directly. Added two new validators to `validation.js`:
  `requireTerminalIdFormat` (format-only, since `close_session` must be able to close a
  session in any status, not just `'running'`) and `requireLabel` (optional-aware, new
  `MCP_MAX_LABEL_BYTES` env var, default 256).
- **Alternatives considered**: Widening the Session Manager's own HTTP API to also bind
  LAN/Tailscale-facing (rejected — its docstring explicitly notes it has no auth of its
  own, and this was the exact thing keeping it and the MCP server on separate listeners
  in the first place). Having `tools.js` `require('../session-manager')` directly
  instead of threading functions through `index.js`/`main.js` (rejected for consistency
  with the existing `sessions` Map's explicit-passing pattern, even though slightly more
  verbose).
- **Rationale**: No new security boundary needed — the MCP bearer-token auth already
  gates the entire `/mcp` endpoint uniformly, and any authenticated caller can already
  run arbitrary shell commands via `type_command`; letting the same caller also
  list/create/close sessions is not a larger blast radius than what's already granted.
- **Consequences**: MCP tool count is now 10 (was 7); test suite grew from 55 to 60
  tests. `create_session` returns while the session's `status` is still `"starting"`
  (matches `spawnSession`'s existing behavior) — callers that immediately act on the new
  session should poll `list_sessions` for `"running"` first, the same race class as
  `docs/ai/mistakes.md` [2026-07-29-023], just in the MCP path instead of the HTTP proxy
  path; the test added for this polls correctly, but this is worth remembering for any
  future MCP client code.
- **Owner**: User (explicit request), implemented via an approved plan.

### [2026-07-29] terminal.pz.net cut over from the legacy single-ttyd model to Session Manager + MCP, live
- **Context**: Repo history had drifted into 6 unmerged remote branches (a full architecture
  rewrite plus 4 dependabot bumps) that were never fetched locally. User asked to merge
  everything into main and deploy it live to `terminal.pz.net`, with the MCP server
  reachable from both LAN and Tailscale for AI-agent use.
- **Decision**: Merged `feature/agentic-mcp-overhaul` and `claude/nomadtty-playwright-tests-b2q3wo`
  (the latter is a superset/descendant of the former) plus all 4 dependabot branches into
  `main` (all fast-forward or conflict-free three-way merges — no manual conflict
  resolution needed). Added the missing `systemd/nomadtty.service` unit (the branches
  shipped the new `server/main.js` architecture but never wired it into deployment — their
  own `.claude/rules/config.md` flagged this as a known gap). Deployed it live: rewrote
  both nginx files that route `terminal.pz.net` (`/etc/nginx/sites-available/ttyd` for the
  public :80 path, and only the `terminal.pz.net` block inside the shared, untracked
  `/etc/nginx/sites-available/tailscale-router` for the Tailscale :18790 path — every other
  block in that file, including `accounts.pz.net`'s financial MCP app, was left untouched)
  to proxy to the new session-manager on :4000 instead of ttyd:47821 directly. Disabled the
  old `ttyd.service`. MCP server deployed bound to `0.0.0.0:4200` with a generated
  `MCP_AUTH_TOKEN` (stored in `/etc/nomadtty/nomadtty.env`, chmod 600) per explicit request
  for LAN+Tailscale AI-agent reachability — not proxied through nginx, so it sits outside
  Tailscale Serve's TLS termination and outside nginx's per-domain dispatch entirely.
- **Alternatives considered**: Merging only the dependabot bumps and leaving the
  architecture rewrite for separate review (rejected — user wanted the newest features
  live now). Keeping the MCP server loopback-only (rejected — user explicitly wants
  cross-device AI-agent access over LAN/Tailscale, and the code's own boot-security check
  already requires a bearer token before it will allow a non-loopback bind, so this isn't
  the code's default-insecure path). Enabling `ufw` on this box as defense-in-depth for the
  MCP port (rejected — `ufw` is currently inactive; turning it on fresh risks breaking every
  other tenant's open port on this shared box and is out of scope for a NomadTTY-focused
  change).
- **Rationale**: User made each call explicitly after being shown the actual risk (shared
  multi-tenant nginx file, MCP bearer-token requirement, blast radius) via clarifying
  questions before any live change was made.
- **Consequences**: `install.sh`/`Dockerfile`/`docker-entrypoint.sh` remain **not** wired to
  this architecture (same known gap the merged branches already had) — only this specific
  host's bare-metal systemd deployment was updated, not the installer/Docker paths. Per-session
  ttyd/tmux processes spawned by the session-manager do **not** survive a `nomadtty.service`
  restart (`shutdownAllSessions()` tears them down deliberately on SIGTERM/SIGINT) — this is
  a different lifecycle model from the old single persistent `main` session and should be
  communicated before any future restart of this service. AWS Security Group exposure of
  port 4200 beyond LAN/Tailscale could not be verified from inside this host (no AWS
  credentials available in this environment) — flagged to the user as a residual item to
  confirm separately. See `~/INFRA.md` for the updated port registry/routing map, and
  `docs/ai/mistakes.md` [2026-07-29-022] for an unrelated but concurrent incident (the old
  `ttyd.service`'s `main` tmux session was destroyed, not just made unreachable, when that
  unit was stopped as part of this cutover).
- **Owner**: User (via explicit AskUserQuestion responses on merge scope, live cutover,
  branch deletion, MCP exposure, and the existing "main" session's fate).

### [2026-07-29] Branding/SEO overhaul targets the Session Manager model, not the legacy nginx sub_filter model
- **Context**: Task required updating page titles, favicons, manifest, meta description,
  theme-color, Open Graph, Twitter Card, and robots directives across all routes. Two
  parallel deployment models exist (per `docs/ai/project-overview.md`): legacy nginx
  `sub_filter` injection into raw ttyd, and `server/session-manager.js`'s own
  `injectToolbar()` head-injection for its per-session ttyd proxies plus a static
  `public/session-manager.html` for the session list UI.
- **Decision**: Implemented all branding/SEO changes against the Session Manager model
  only: `public/session-manager.html` (static head tags) and
  `server/session-manager.js`'s `injectToolbar()` (dynamic per-session head tags,
  now parameterised on `label` and `pageUrl`). Left `nginx/ttyd.conf` and the
  Dockerfile/install.sh legacy path untouched.
- **Alternatives considered**: Updating both deployment models symmetrically. Rejected
  after inspecting `nginx/ttyd.conf` directly and its git history (`55a5208`): it no
  longer does raw sub_filter injection at all -- it now reverse-proxies straight to
  `http://127.0.0.1:4000` (the Session Manager), meaning the "legacy" sub_filter path
  described in CLAUDE.md is already stale/superseded for this vhost, while
  `Dockerfile`/`docker-entrypoint.sh`/`install.sh` still assume raw ttyd on the ttyd
  port directly -- a pre-existing inconsistency between the docs and the Docker/install
  path that predates this task and is out of scope to fix here.
- **Rationale**: The Session Manager model is the one this session's Playwright suite
  (`tests/`) actually boots and verifies (`tests/playwright.config.js`'s `webServer`
  runs `server/main.js`), and the one with a real, currently-functioning HTML
  head-injection point to extend. Symmetrically patching the Docker/install.sh path
  would mean guessing at behavior nothing currently exercises or tests.
- **Consequences**: `Dockerfile`/`install.sh`-based deployments (if run as literally
  shipped) will not receive the new favicon/manifest/OG tags -- they still serve
  raw ttyd's own default title/favicon. This should be revisited once/if the
  Docker/install.sh path is reconciled with the Session Manager model (see
  `.claude/rules/infra.md`'s "Known gap" note, itself pre-existing).
- **Decision**: Chose `noindex, nofollow` + a blanket `Disallow: /` in
  `public/robots.txt`, deliberately, as the correct SEO posture for a private,
  authenticated remote-access tool -- not an oversight. Open Graph/Twitter Card tags
  are still included despite `noindex` because link-preview/unfurling bots (Slack,
  Discord, iMessage, etc.) are a separate consumer from search-engine crawlers and
  are not addressed by `robots`/`robots.txt` at all.
- **Decision**: `og:url` is computed dynamically per-request in
  `server/session-manager.js`'s `proxyHttp()` (from `req.headers.host` +
  `req.socket.encrypted` + `req.url`) for `/term/<id>/` pages, but omitted entirely
  from the static `public/session-manager.html`, which has no single canonical URL
  across deployments (Tailscale hostname, custom domain, localhost, etc.) and cannot
  determine its own runtime hostname without adding server-side templating to a
  currently-static file -- judged disproportionate for one optional OG field.
- **Decision**: Favicon/icon assets (`public/favicon.svg`, `apple-touch-icon.png`,
  `icon-192.png`, `icon-512.png`) were generated by a new pure-Node-core script
  (`scripts/generate-icons.mjs`, `fs`+`zlib` only, hand-rolled minimal PNG encoder) that
  renders a ">_" terminal-prompt glyph on the app's own accent blue (`#0052cc`),
  rather than sourcing/committing a third-party-designed asset -- keeps the icon
  dependency-free and on-brand with zero added tooling. Manifest icons use
  `"purpose": "any"` only (not `"any maskable"`): the icon's rounded corners are
  baked into a transparent-cornered canvas, which does not satisfy the maskable-icon
  safe-zone spec (content must survive an arbitrary OS-applied mask shape).
- **Owner**: claude (branding/SEO overhaul task on `feature/agentic-mcp-overhaul`)

### [2026-07-29] Touch-scroll-into-history is disabled on the terminal, not fixed to detect the scroll boundary
- **Context**: Rigorous mobile stress-testing found kb.js's touch-scroll feature (`initTouchScroll`, translating finger swipes into synthetic `WheelEvent`s) spamming literal Up/Down-arrow key escape sequences into the PTY as real input on every gesture, corrupting visible output when the foreground process doesn't read stdin. See `docs/ai/mistakes.md` 2026-07-29-018 for the full root cause: every session runs inside tmux, which manages pane history entirely server-side and never populates xterm.js's own client-side scrollback buffer, so there is categorically nothing for a wheel event to scroll into -- every dispatch hits xterm.js's "nothing left, forward as arrow keys" fallback.
- **Decision**: Removed the wheel-event dispatch from `initTouchScroll` entirely. The touchmove listener now only calls `preventDefault()` (to keep suppressing iOS's page-bounce overscroll effect) and sends nothing to xterm.js.
- **Alternatives considered**: (a) Detect "at the scroll boundary" via DOM heuristics (`.xterm-viewport`'s `scrollTop`/`scrollHeight`) before dispatching -- rejected after direct testing showed these values are meaningless for this renderer (`scrollTop` stays 0 unconditionally; the DOM-renderer's virtualized rows never produce real CSS overflow). (b) Cap the wheel event's delta magnitude and detect "did the visible content change" after each dispatch -- rejected because xterm.js's rendering is deferred (confirmed empirically: checking `.xterm-rows` synchronously right after `dispatchEvent` always shows stale content), so this would either falsely disable scrolling entirely (checking too early) or still leak a bounded-but-nonzero number of bytes per gesture (checking after a delay). (c) Give xterm.js a real client-side scrollback via `--client-option scrollback=N` -- rejected for now: it did populate `options.scrollback`, but an early A/B test showed an unexplained, unrelated row-count discrepancy alongside it that would need its own independent investigation before shipping, and this task's priority was eliminating the distortion, not building new scrollback UX.
- **Rationale**: The feature provided zero real functionality under this app's actual architecture (tmux-wrapped, always) while causing serious, always-reproducible harm (visible garbage text, potential interference with whatever the foreground process is doing with its input queue). A feature that never worked as intended and always causes damage should be removed, not patched with heuristics that only reduce -- rather than eliminate -- the harm.
- **Consequences**: Mobile users can no longer scroll the terminal's visible history by touch; this was never functional in the first place (silently, before this investigation), so no working behavior regresses. Scrollback remains fully accessible via the MCP `scroll_buffer`/`read_terminal_contents` tools (server/mcp/tmux.js), which already read tmux's own server-side history correctly and are unaffected by this change. A real touch-driven scrollback UI is a legitimate future feature, but must drive tmux's own copy-mode/history mechanism directly rather than xterm.js's client buffer -- tracked as a follow-up, not implemented here.
- **Owner**: claude (session rigorously validating mobile rendering/UX via device simulation and stress testing)

### [2026-07-29] Mobile stress tests use a deterministic word-stream script instead of a downloaded local LLM
- **Context**: Asked to validate mobile UX by "communicating with a local model via an interactive... interface (such as Claude CLI...)" while streaming long replies, under concurrent typing/scrolling/rotation/keyboard-toggle stress -- and specifically not to introduce heavy setup overhead that could crash headless CI.
- **Decision**: `scripts/simulate-model-stream.mjs`, a small deterministic Node script that writes wrapping prose to stdout word-by-word with a configurable per-word delay, stands in for a real model in the automated, repeatable Playwright suite (`tests/specs/android-mobile-stress.spec.js`). Separately, one manual spot-check used the `claude` CLI already installed in this environment (no download needed) to confirm realism.
- **Alternatives considered**: Downloading and running a real local LLM via e.g. `ollama` (rejected -- multi-GB download, real disk/time cost, and non-deterministic latency/output make it unsuitable for a repeatable CI suite; also unnecessary, since what actually stresses the terminal's rendering/layout code is the *traffic pattern* -- small chunks arriving continuously over real wall-clock time -- not the semantic content of the text). Using the installed `claude` CLI directly in the automated suite (rejected after the manual spot-check: `claude -p` took several seconds with **no visible output at all** before dumping its entire response at once -- it doesn't incrementally stream to the terminal in non-interactive mode -- making it both slower and, ironically, a *worse* visual example of "streaming" than the deterministic script, in addition to costing a real API call on every test run).
- **Rationale**: The deterministic script is fast (no network dependency), free (no API cost per CI run), and produces exactly the condition that matters for this testing goal: continuous small writes over real time, at a configurable pace, indistinguishable from a real streaming client's traffic pattern from the terminal's point of view.
- **Consequences**: The automated suite's "AI streaming" scenario doesn't depend on model output quality or availability. If a future defect is suspected to be specific to a *real* AI CLI's actual output shape (e.g. specific escape sequences, unusual Unicode, etc.) rather than generic streaming, that would need a separate, explicitly-flagged manual verification pass, not just this suite passing.
- **Owner**: claude (session rigorously validating mobile rendering/UX via device simulation and stress testing)

### [2026-07-29] Mobile UX validation uses Playwright device emulation, not a full Android emulator (AVD)
- **Context**: Asked to "download and configure an agent-friendly Android simulator" for rigorous mobile
  rendering/UX validation, with an explicit constraint that setup must not introduce heavy GUI overhead
  that crashes headless CI environments.
- **Decision**: Use Playwright's built-in device emulation (`devices['Pixel 7']`, etc.) — real mobile
  viewport dimensions, `deviceScaleFactor` (devicePixelRatio), `hasTouch`, `isMobile`, and user-agent
  metadata applied to the same headless Chromium already used by this suite — instead of a real Android
  Virtual Device (AVD) via the Android SDK emulator.
- **Alternatives considered**: A full AVD (e.g. via `android-emulator-runner` or a manually configured
  Android SDK emulator). Checked directly rather than assumed: `/dev/kvm` does not exist in this
  environment, no VMX/SVM hardware-virtualization CPU flags are exposed, and no Android SDK tooling is
  pre-installed. Without KVM/HVF acceleration, the AVD falls back to QEMU's software TCG emulation, which
  is exactly the slow/crash-prone failure mode GitHub's own `android-emulator-runner` documentation warns
  against on standard (non-`macos`/non-nested-virt) runners — i.e. precisely the "heavy GUI overhead that
  crashes headless CI environments" this task's constraint rules out.
  Real hardware/device farm access was also considered and rejected: no such MCP connector or tool is
  available in this environment.
- **Rationale**: Playwright device emulation reproduces every mobile-rendering variable this task actually
  needed to validate — real touch-target geometry, real DPR (the exact axis on which the canvas-renderer
  bug in 2026-07-29-014 was found — an AVD would not have caught this any more definitively), and real
  mobile viewport dimensions — without booting a second, heavyweight virtualized OS. It is also already
  this project's own established convention (prior documentation screenshot scripts already used Android
  device profiles), so this is a continuation of an existing pattern, not a new one.
- **Consequences**: This does not validate Android-OS-specific or Chrome-for-Android-specific browser
  engine quirks (a real AVD or device farm would be needed for that). For a web app with no
  platform-specific native code, this is an accepted, documented trade-off — flagged here explicitly should
  a future defect ever appear that only reproduces on real Android Chrome.
- **Owner**: claude (session rigorously validating mobile rendering/UX via device simulation)

### [2026-07-29] Session Manager's ttyd processes default to the dom renderer (supersedes the canvas decision below)
- **Context**: The entry directly below this one records switching the default ttyd renderer from `webgl`
  to `canvas` to fix a headless-sandbox rendering bug, verified only at desktop `devicePixelRatio=1`.
  Rigorously re-testing mobile rendering via Playwright's `devices['Pixel 7']` profile
  (`devicePixelRatio=2.625`) surfaced a second, more serious defect in that "fix": the canvas renderer
  draws terminal glyphs roughly DPR-times too large, so only ~20 characters were visible across a
  381px-wide terminal where 48+ should fit — a regression specifically on real mobile hardware, the
  primary target of a mobile-first product. See `docs/ai/mistakes.md` 2026-07-29-014 for full evidence.
- **Decision**: `spawnSession()` in `server/session-manager.js` now passes `--client-option
  rendererType=dom` by default (still overridable via `TTYD_RENDERER_TYPE`), replacing `canvas`.
- **Alternatives considered**: Re-litigating `webgl` (rejected — reproduces the original -012 headless
  breakage, confirmed by direct side-by-side comparison against `dom` on the identical Pixel 7 profile);
  keeping `canvas` for desktop and special-casing mobile (rejected — same reasoning as the canvas-vs-webgl
  decision below: deploying a different configuration than the one being tested/documented is itself a
  risk, and there is no reliable server-side signal to distinguish "desktop browser" from "mobile browser"
  at ttyd process spawn time, before any client has connected).
- **Rationale**: `dom` is the only one of the three xterm.js renderers verified correct in *both* failure
  conditions found so far: headless/no-GPU sandboxes (where `webgl` breaks) and real mobile DPR (where
  `canvas` breaks). It is xterm.js's original, long-standing renderer, not experimental. Re-verified
  end-to-end through the real `spawnSession()` code path at DPR=1 and DPR=2.625: both produced correctly
  fine-grained, nearly-identical tmux grids (49x52 vs 49x51), and the full existing 35-test Playwright
  suite passed unchanged against the new default.
- **Consequences**: Every session-manager-spawned ttyd process now renders via DOM by default. This has no
  known downside for this project's use case (a handful of terminal characters per screen, not a
  high-frequency scrollback-heavy workload) and is consistent with AGENTS.md's Terminal Emulator
  Performance Constraint. Test helper `waitForTerminalReady()` had to change its selector from
  `.xterm-screen canvas` to `.xterm-screen`, since `dom` creates no `<canvas>` element — see
  `docs/ai/mistakes.md` 2026-07-29-015. Deployments that specifically want canvas/webgl (e.g. a
  high-throughput scrollback use case validated on desktop-only clients) can still set
  `TTYD_RENDERER_TYPE=canvas` or `=webgl` explicitly.
- **Owner**: claude (session rigorously validating mobile rendering/UX via device simulation)

### [2026-07-29] Session Manager's ttyd processes default to the canvas renderer, not WebGL
- **Context**: Capturing documentation screenshots of `/term/<id>/` in a headless browser showed a mostly
  blank terminal with a few huge, sparse glyphs, despite correct DOM/CSS sizing and a sane tmux pane
  cols/rows. Traced to ttyd's default WebGL xterm.js renderer compositing incorrectly under Chromium's
  software-WebGL fallback (see `docs/ai/mistakes.md` 2026-07-29-012).
- **Decision**: `spawnSession()` in `server/session-manager.js` now passes `--client-option
  rendererType=canvas` to every ttyd process it spawns, overridable via `TTYD_RENDERER_TYPE`.
- **Alternatives considered**: `--enable-unsafe-swiftshader` on the Chromium side (tested, did not fix the
  WebGL path); leaving WebGL as the default and only using canvas for automated screenshot capture
  (rejected — it would mean the deployed app and the thing being documented/tested aren't the same
  configuration, and WebGL's failure mode isn't provably confined to this one sandbox: any headless CI,
  low-end device, or virtualized/remote-desktop browser without solid GPU acceleration could hit the same
  defect for real users).
- **Rationale**: Canvas is xterm.js's original, long-standing, broadly-compatible renderer — not an
  experimental fallback. It renders identical content correctly everywhere tested, while WebGL's upside
  (better performance under very heavy scroll/redraw load) is not a priority for a mobile-first terminal
  toolbar whose primary constraint (AGENTS.md) is *avoiding* heavy rendering work in the first place.
- **Consequences**: Every session-manager-spawned ttyd process (not the legacy Dockerfile/install.sh path,
  which is unaffected) now renders via 2D canvas by default. Deployments that specifically want WebGL can
  set `TTYD_RENDERER_TYPE=webgl`.
- **Owner**: claude (session verifying/documenting the MCP overhaul release)

### [2026-07-29] MCP tools operate on tmux directly; session creation eagerly creates the tmux session
- **Context**: The Session Manager's `spawnSession()` only started ttyd; ttyd itself lazily execs its wrapped
  `tmux new-session -A -s <id>` command on the *first* WebSocket connection. MCP tools (get_screenshot,
  type_command, etc.) need to act on a session the moment an agent creates it via `/api/sessions`, with no
  browser ever involved — but the tmux session (and therefore anything to operate on) didn't exist yet.
- **Decision**: `spawnSession()` now runs `tmux new-session -d -s <id>` itself, synchronously, before
  spawning ttyd. ttyd's own `-A` flag then just attaches to that already-running session instead of
  creating a second one, so browser-driven behavior is unchanged.
- **Alternatives considered**: Having the MCP server open a throwaway WebSocket to ttyd itself just to force
  the lazy spawn — rejected as fragile and roundabout compared to creating the tmux session directly.
- **Rationale**: MCP tools are meant to let an agent drive a terminal with no human ever opening a browser
  tab. That requires the tmux session to exist immediately on creation, not on first "Join."
- **Consequences**: `spawnSession()` can now throw synchronously (tmux missing/broken) — the `/api/sessions`
  POST handler wraps it in try/catch and returns 500 rather than crashing the process.
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] MCP server is a second HTTP listener, not a route on the Session Manager's server
- **Context**: Needed to expose terminal-control tools over MCP's Streamable HTTP transport, reachable by
  LAN agents. The Session Manager's existing HTTP server binds to 127.0.0.1 only and has no authentication.
- **Decision**: `server/mcp/index.js` runs its own `http.Server` on a separate port (`MCP_PORT`, default
  4200), bound to `MCP_HOST` (default `0.0.0.0`), inside the same Node process as the Session Manager. Both
  share the same in-memory `sessions` Map directly (no network hop) — see `server/main.js`.
- **Alternatives considered**: Adding `/mcp` as a route on the existing Session Manager server and widening
  its bind address to `0.0.0.0` — rejected because that would have silently exposed the unauthenticated
  Session Manager UI/API (create/list/close sessions, full terminal proxy) to the LAN as a side effect of
  making only the MCP endpoint LAN-reachable.
- **Rationale**: Keeping the two listeners separate lets the MCP server (which enforces a bearer token, see
  below) be LAN-facing without changing the Session Manager's existing security posture at all.
- **Consequences**: Two ports to configure/document instead of one. `server/main.js` is the new composition
  root that starts both; `server/session-manager.js` still runs standalone unchanged (required by
  `tests/playwright.config.js`).
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] MCP auth is a mandatory bearer token, not command-content filtering
- **Context**: `type_command`/`send_keystroke` grant the same power as typing at the terminal directly —
  the tool's entire purpose is running arbitrary commands, so content-level sandboxing would defeat the
  tool. Something still has to gate who can call these tools at all, especially once LAN-reachable.
- **Decision**: `server/mcp/auth.js` requires `Authorization: Bearer <MCP_AUTH_TOKEN>` on every `/mcp`
  request (constant-time compare). The server refuses to boot bound to a non-loopback host without
  `MCP_AUTH_TOKEN` set, unless `MCP_ALLOW_INSECURE=1` is explicitly passed. `validation.js` additionally
  applies a best-effort denylist of obviously destructive one-liners (`rm -rf /`, fork bombs, etc.) to
  `type_command` as defense-in-depth — documented as non-bypass-proof, not a sandbox.
- **Alternatives considered**: Filtering/allowlisting command content as the primary defense — rejected as
  both incomplete (trivially bypassable) and self-defeating (a terminal tool that can't run most commands
  isn't useful).
- **Rationale**: The real security boundary for a tool whose job is "run what the agent says" is "who is
  allowed to connect," not "what did they say." This mirrors ttyd/tmux's own trust model (anyone who can
  reach the browser UI already has a full shell) extended to MCP callers.
- **Consequences**: Operators MUST set `MCP_AUTH_TOKEN` to a long random value before exposing `MCP_HOST` to
  the LAN. `MCP_ALLOW_INSECURE=1` exists for local dev convenience and must never be used in production.
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] get_screenshot returns a textual/ANSI snapshot, not a pixel image
- **Context**: The MCP tool spec asked for a `get_screenshot` tool "capturing the current visual state" of
  a terminal.
- **Decision**: `get_screenshot` returns `tmux capture-pane`'s text (optionally with `-e` for ANSI escape
  codes) for the pane's current viewport, not a rendered pixel image.
- **Alternatives considered**: Rendering a real PNG via a headless browser pointed at the ttyd page —
  rejected: it would require adding a permanent Chromium dependency to the production backend (this project
  already avoids that outside the Playwright dev/test suite), pay a browser-launch cost per call, and still
  ultimately just re-render text ttyd already emits as ANSI.
- **Rationale**: NomadTTY's terminals are text-mode (ttyd/tmux); there is no server-side pixel renderer in
  this architecture. A textual/ANSI snapshot is the accurate, honest representation of "current visual
  state" for a text terminal, and is what every other tool in this set already consumes/produces.
- **Consequences**: If true pixel screenshots are wanted later, it's a separate, explicit feature addition
  (headless browser dependency) — not a variant of this tool.
- **Owner**: claude (session implementing the MCP server)

### [2026-07-29] First production npm dependency: @modelcontextprotocol/sdk + zod
- **Context**: Needed a spec-correct MCP "Streamable HTTP" transport (JSON-RPC framing, session lifecycle,
  SSE upgrade, resumability semantics). The backend had been zero-runtime-dependency by design/convention
  (see the 2026-06-20 "No bundler / no build step" entry), though that constraint was specifically about
  `src/kb.js` being injected into a browser page with no bundler available — it does not technically apply
  to a standalone Node backend service.
- **Decision**: Added a root `package.json` with `@modelcontextprotocol/sdk` and `zod` as runtime
  dependencies. Hand-rolling JSON-RPC/SSE session framing instead was considered and rejected.
- **Alternatives considered**: Hand-writing the MCP protocol (JSON-RPC + SSE + session headers) directly on
  the existing zero-dependency `http.createServer` pattern.
- **Rationale**: The official SDK is maintained specifically for this protocol and already correctly
  handles session IDs, resumable SSE streams, and JSON-RPC edge cases; reimplementing it by hand for a
  first-party feature carries much higher bug risk than the (well-justified) dependency.
- **Consequences**: `npm install` at the repo root is now required before running `server/main.js`. The
  root `.gitignore` no longer blanket-ignores `package.json`/`package-lock.json` (it did, as a leftover from
  the zero-dependency era) — both are now tracked, same as `tests/package.json` already was.
- **Owner**: claude (session implementing the MCP server)

### [2026-06-25] Add Mermaid architecture diagram to README
- **Context**: README had an ASCII art architecture diagram. Mermaid is rendered natively
  by GitHub, giving a visually richer diagram with no external tooling.
- **Decision**: Replace ASCII diagram with a Mermaid `graph LR` block. Keep the ASCII
  version in `docs/ai/project-overview.md` as a plain-text fallback.
- **Alternatives considered**: Keep ASCII (universally readable in any tool); Mermaid only.
- **Rationale**: GitHub renders Mermaid inline. The diagram is the most effective way to
  communicate the sub_filter injection chain and WebSocket hook to new contributors.
- **Consequences**: The diagram must be updated in README.md whenever the architecture
  changes (e.g. new proxy, new port). ASCII copy in project-overview.md is the fallback.
- **Owner**: ankit

### [2026-06-25] Add Dependabot for Docker and GitHub Actions
- **Context**: No automated dependency scanning existed. Docker base image and GitHub
  Actions versions could silently drift.
- **Decision**: Add `.github/dependabot.yml` scanning `docker` and `github-actions`
  ecosystems on a weekly schedule.
- **Alternatives considered**: Manual audits; Renovate Bot.
- **Rationale**: Dependabot is zero-config, built into GitHub, and generates PRs
  automatically. Weekly cadence avoids noise while catching security patches promptly.
- **Consequences**: Expect periodic automated PRs for `ubuntu:24.04` base and actions
  pins. Review them; do not auto-merge without checking.
- **Owner**: ankit

### [2026-06-20] Run ttyd as deploy user (ubuntu), not root
- **Context**: ttyd systemd service was set to `User=root`. This caused `claude` (and
  any other user-local CLI tool) to be unavailable in the web terminal because root's
  `$PATH` does not include `/home/ubuntu/.local/bin/`, and credentials live in
  `/home/ubuntu/.claude/` which root cannot access.
- **Decision**: `User=ubuntu` in `systemd/ttyd.service`.
- **Alternatives considered**: Symlinking claude to `/usr/local/bin/` — rejected because
  it still fails on credential lookup (`~/.claude/` resolves to `/root/.claude/`).
- **Rationale**: PTY creation does not require root on Linux. Normal users can open
  `/dev/ptmx`. Running as the deploy user gives the terminal the correct `$PATH` and
  home directory.
- **Consequences**: Deploy instructions must ensure the service `User` matches the user
  who has `claude` (and other tools) installed.
- **Owner**: ankit

### [2026-06-20] Toolbar positioned at top of page, not bottom
- **Context**: Initial toolbar was at the bottom; user feedback requested top placement.
- **Decision**: Toolbar is `position: fixed; top: 0`. Terminal container is pushed down
  with `position: fixed; top: <toolbar_height>px`.
- **Alternatives considered**: Bottom toolbar (initial implementation).
- **Rationale**: Top placement matches Termius, iSH, and other established mobile
  terminal apps. Top placement also avoids conflict with iOS home indicator.
- **Consequences**: `updateLayout()` must be called after DOM settles and after any
  Fn row toggle to recompute the toolbar height and reposition the terminal.

### [2026-06-20] Sticky modifier keys instead of hardcoded Ctrl combos
- **Context**: Initial v1 toolbar had hardcoded Ctrl shortcut buttons (C-b, C-c, C-d,
  C-l, C-r, C-u, C-w, C-z, C-k, C-n, C-p). User requested best-practice approach.
- **Decision**: CTRL, SHFT, ALT are sticky toggles; a `keydown` listener intercepts
  the next physical keypress and sends the modified byte. No hardcoded Ctrl buttons.
- **Alternatives considered**: Keep hardcoded shortcuts; add both sticky + shortcuts.
- **Rationale**: Sticky modifiers match how Termius works. They support arbitrary
  combinations (Ctrl+any letter) vs. a fixed button list. Cleaner toolbar row.
- **Consequences**: Users must tap CTRL then type on the phone keyboard. This requires
  the on-screen keyboard to be open. Tested and confirmed working via CDP keydown events.

### [2026-06-20] Responsive layout via visualViewport + dvh + touch-action
- **Context**: Terminal layout broke on mobile when the on-screen keyboard appeared.
- **Decision**: Three-layer mobile layout strategy:
  1. `interactive-widget=resizes-content` in viewport meta (Android keyboard shrinks layout)
  2. `height: calc(100dvh - toolbar_height)` for modern browsers
  3. `visualViewport` resize listener fires `window.resize` → ttyd fitAddon recalculates
- **Alternatives considered**: Fixed pixel height; `100vh` (broken on iOS); CSS only.
- **Rationale**: Research confirmed this is the current best practice (2024–2026).
  `dvh` supported iOS Safari 16+, Android Chrome 108+. Fallback via visualViewport.
- **Consequences**: Layout adapts automatically. Test on real iOS/Android after any
  toolbar height change.

### [2026-06-20] window.WebSocket hook injected before ttyd's bundle via sub_filter
- **Context**: Needed a way for `kb.js` to send bytes to ttyd's PTY without modifying
  ttyd's source code.
- **Decision**: Override `window.WebSocket` with a wrapper before ttyd's JS bundle runs.
  Store the `/ws` connection in `window._S`. `kb.js` calls `window._S.send('0'+bytes)`.
- **Alternatives considered**: (a) Modify ttyd source and recompile; (b) Postmessage API;
  (c) Intercept fetch/XHR; (d) MutationObserver to find the socket after creation.
- **Rationale**: WS hook is the only approach that works without modifying ttyd and
  without timing races. The hook fires synchronously before any script in `<head>`.
  ttyd's bundle uses `new WebSocket(...)` — the hook captures it at construction time.
- **Consequences**: The inline hook script must stay small (< 300 B) to fit in sub_filter.
  If ttyd ever changes its WebSocket URL from `/ws`, the `indexOf("/ws")` check must be updated.

### [2026-06-20] No bundler / no build step for kb.js
- **Context**: Design choice for toolbar delivery mechanism.
- **Decision**: `src/kb.js` is a vanilla JS IIFE served directly with no transpilation.
- **Alternatives considered**: npm + esbuild bundle; TypeScript; ES modules.
- **Rationale**: Injected scripts cannot use `import`/`export`. Adding a build step
  introduces maintainability overhead inconsistent with the project's zero-dependency
  philosophy. 9 KB unminified is acceptable for a no-cache-controlled single file.
- **Consequences**: No type checking. All code must be self-documenting. No tree-shaking.

### [2026-06-20] ttyd listen port 47821 (non-standard)
- **Context**: Had to choose a port for ttyd's internal listener.
- **Decision**: Port 47821.
- **Rationale**: Avoid common ports (7681 is ttyd's default; 8080, 3000 are frequently
  used by other services). 47821 is arbitrary but distinctive.
- **Consequences**: All references to this port (nginx config, systemd service, install.sh,
  Dockerfile) must stay in sync. Configurable via `TTYD_PORT` env var.

### [2026-06-20] Docker base image: ubuntu:24.04 (not alpine or debian-slim)
- **Context**: Needed a base image for the Docker container.
- **Decision**: `ubuntu:24.04`.
- **Alternatives considered**: `alpine` (no ttyd apt package), `debian:bookworm-slim`.
- **Rationale**: ttyd is available in Ubuntu 24.04's apt repositories. Alpine would require
  compiling ttyd from source. debian-slim is viable but Ubuntu matches the primary
  deployment target (Debian/Ubuntu servers).
- **Consequences**: Image is larger than alpine-based alternatives (~250 MB compressed).
  TODO: evaluate multi-stage build or debian-slim once ttyd version is pinned.

### [2026-06-20] Project name: NomadTTY
- **Context**: Repository needed a unique, memorable, apt name.
- **Decision**: NomadTTY — nomad (access your server from anywhere, mobile) + TTY.
- **Alternatives considered**: ttydeck, taptty, surftty, palmtty.
- **Rationale**: "Nomad" captures the core use case (roaming remote terminal access).
  Memorable, professional, available on GitHub.
- **Consequences**: GitHub repo: `shifulegend/nomadtty`. Docker image tag: `nomadtty`.
