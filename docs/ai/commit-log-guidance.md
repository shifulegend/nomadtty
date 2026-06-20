# NomadTTY — Commit Log Guidance
<!-- canonical source of truth | last updated: 2026-06-20 -->

## Commit message format
```
<type>(<scope>): <imperative short summary, ≤ 72 chars>

<body: what changed and why — not how; reference mistakes/decisions if applicable>

<footer: breaking changes, related issues, co-authors>
```

## Types
| Type | When to use |
|------|------------|
| `feat` | New feature added to toolbar, installer, or Docker image |
| `fix` | Bug fix — reference the mistake log entry if one exists |
| `chore` | Docs, config, dependency updates, repo scaffolding |
| `refactor` | Code restructured without behaviour change |
| `test` | Test files added or updated |
| `infra` | Dockerfile, nginx config, systemd, install.sh changes |
| `ci` | GitHub Actions, CI/CD pipeline changes |

## Scopes (use the most specific)
- `kb.js` — toolbar script
- `nginx` — nginx config changes
- `systemd` — service file
- `docker` — Dockerfile or docker-compose
- `install` — install.sh
- `docs` — documentation only
- `rules` — engineering rules, AI docs

## Granularity rules
- **One logical change per commit.** Do not bundle a feature with a style fix.
- **Smallest reviewable coherent unit.** If you can meaningfully revert part of
  a commit independently, it should be a separate commit.
- **Verify before committing.** Run the relevant verification steps from
  `engineering-rules.md` before `git commit`.

## Examples

```
feat(kb.js): add F1–F12 via Fn toggle row

Adds a hidden fn-row div revealed by the Fn button.
FK[] table maps F1–F12 to standard xterm sequences.
Modifier combinations (Ctrl+Fn, etc.) use FK_CODES[] for CSI form.
```

```
fix(nginx): rewrite sub_filter to avoid sed corruption

sed s/// conflicts with / and & in the JS WS hook string.
Replace with tee+heredoc for safe multi-char injection.
See mistakes.md [2026-06-20-006].
```

```
infra(docker): pin ubuntu:24.04 base image digest

Prevents silent base image updates from breaking the build.
Related decision: 2026-06-20 Docker base image choice.
```

```
chore(rules): add cross-tool AI development system

docs/ai/** canonical shared memory.
CLAUDE.md + .claude/rules/** for Claude Code.
.github/copilot-instructions.md + instructions/** for Copilot.
gemini/GEMINI.md + AGENTS.md + .agents/** for Antigravity.
See docs/ai/tool-sync-policy.md for sync rules.
```

## Do not do
- `fix: various fixes` — too vague
- `update files` — says nothing
- Committing with a failing `nginx -t` or broken Docker build
- Including unrelated file changes in the same commit
