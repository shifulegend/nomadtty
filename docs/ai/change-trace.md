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
