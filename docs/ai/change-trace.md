# NomadTTY — Change Trace
<!-- canonical source of truth | newest entries first -->
<!-- last updated: 2026-06-20 -->
<!-- add an entry for every notable change: what, why, affected areas, commit -->

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
