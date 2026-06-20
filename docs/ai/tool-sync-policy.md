# NomadTTY — Tool Sync Policy
<!-- canonical source of truth | last updated: 2026-06-20 -->

## Canonicality rule
`docs/ai/**` is the **primary source of truth** for all durable project knowledge.
Tool-specific files are **adapters** — they summarise and reference the shared docs.

If a conflict appears between a tool-specific file and `docs/ai/**`:
1. Update `docs/ai/**` first.
2. Propagate the corrected content to the adapter files.
3. Record the update in `docs/ai/change-trace.md`.
4. Propose a commit.

Do not let durable knowledge live only inside one tool's native files.

---

## File classification

### Canonical (source of truth)
| File | Content |
|------|---------|
| `docs/ai/project-overview.md` | Architecture, stack, terminology, integrations |
| `docs/ai/engineering-rules.md` | Modularity, configurability, verification, DoD |
| `docs/ai/mistakes.md` | All known mistakes; newest first |
| `docs/ai/decision-log.md` | All architectural and process decisions |
| `docs/ai/change-trace.md` | Notable changes with rationale and commit refs |
| `docs/ai/session-start-checklist.md` | Mandatory session startup ritual |
| `docs/ai/commit-log-guidance.md` | Commit message format and granularity rules |
| `docs/ai/tool-sync-policy.md` | This file — sync rules |

### Adapter files (must not drift from canonical)
| File | Tool | Update trigger |
|------|------|---------------|
| `CLAUDE.md` | Claude Code | Any change to architecture, rules, or workflows |
| `.claude/rules/core.md` | Claude Code | Changes to engineering-rules.md core section |
| `.claude/rules/docs.md` | Claude Code | Changes to documentation rules |
| `.claude/rules/tests.md` | Claude Code | Any test infrastructure added |
| `.claude/rules/config.md` | Claude Code | Changes to env vars, config files |
| `.claude/rules/infra.md` | Claude Code | Changes to Dockerfile, nginx, systemd, install.sh |
| `.claude/skills/**` | Claude Code | New repeated workflows discovered |
| `.github/copilot-instructions.md` | Copilot | Any change to architecture or repo-wide rules |
| `.github/instructions/*.instructions.md` | Copilot | Scoped rule changes |
| `.github/prompts/*.prompt.md` | Copilot | Workflow changes |
| `gemini/GEMINI.md` | Antigravity | Any change to architecture or repo-wide rules |
| `AGENTS.md` | Antigravity/portability | Keep in sync with GEMINI.md durable rules |
| `.agents/rules/*.md` | Antigravity | Scoped rule changes |
| `.agents/workflows/*.md` | Antigravity | Workflow changes |

---

## When to update adapter files

### After planning (before coding)
- Update `docs/ai/project-overview.md` if scope or architecture understanding changed.
- Update `docs/ai/decision-log.md` if the plan involves a new architectural decision.

### After each implementation sub-step
- Update `docs/ai/mistakes.md` immediately if a mistake was found.
- Update `docs/ai/decision-log.md` if a new decision was made.
- Update `docs/ai/change-trace.md` with what changed.
- Update scoped rule files if a recurring scoped lesson appeared.

### Before each commit
- Ensure code and markdown files are synchronised.
- Ensure any newly discovered durable rule is in the right canonical doc.

### At task completion — full sync
1. Update `docs/ai/**` canonical docs first.
2. Then synchronise in this order:
   a. `CLAUDE.md` + `.claude/rules/**`
   b. `.github/copilot-instructions.md` + `.github/instructions/**`
   c. `gemini/GEMINI.md` + `AGENTS.md` + `.agents/rules/**`
3. Update agents, skills, and workflows only if a repeated workflow or role actually changed.
4. Record the sync in `docs/ai/change-trace.md`.
5. Propose the commit.

---

## Sync checklist (run at end of every session)
- [ ] `docs/ai/project-overview.md` reflects current architecture
- [ ] `docs/ai/engineering-rules.md` has all active constraints
- [ ] `docs/ai/mistakes.md` has all mistakes found this session
- [ ] `docs/ai/decision-log.md` has all decisions made this session
- [ ] `docs/ai/change-trace.md` has an entry for every notable change
- [ ] `CLAUDE.md` is current
- [ ] `.github/copilot-instructions.md` is current
- [ ] `gemini/GEMINI.md` and `AGENTS.md` are current and in sync with each other
- [ ] All scoped rule files in `.claude/rules/`, `.github/instructions/`, `.agents/rules/` are current
- [ ] A commit checkpoint is proposed or executed
