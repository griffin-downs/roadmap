# Topology Contract

Agent-facing reference for the two-clone architecture.

## Architecture: `two-clone-minimal`

| Clone | Path | Role | Consumers |
|-------|------|------|-----------|
| **production** | `/home/griffin/src/roadmap` | mirror-only | Yes |
| **development** | `~/src/.dev/roadmap` | work-in-progress | No |

## Special Branches

| Branch | Purpose | Files |
|--------|---------|-------|
| `enceinte` | Full codebase snapshot (immutable baseline) | ~1146 |
| `dormant` | Dead subsystems (preserved for reference) | ~422 |

## Consumer Contract

- Import from: `/home/griffin/src/roadmap#main` only
- Gitsafe enforced: yes
- Denied paths: `~/.dev/roadmap/**`

## Decision Trees

### "I want to work on a feature"
```
roadmap topology enforce --op work --branch feat/my-feature
```
- Production clone: DENIED. Go to `~/src/.dev/roadmap`.
- Development clone: ALLOWED on `feat/*` branch.

### "I want to push changes"
```
roadmap topology enforce --op push --to origin
```
- Production clone: DENIED. Mirror-only.
- Development clone: ALLOWED on `feat/*`, DENIED on `main`.

### "I want to read/import this package"
```
roadmap topology enforce --op read
```
- Production clone: ALLOWED. This is the authoritative source.
- Development clone: ALLOWED but not recommended for consumers.

### "I need recovery/context reference"
```
roadmap topology show | jq '.specialBranches'
```
- `enceinte`: full codebase snapshot for recovery
- `dormant`: dead subsystems for resurrection

## Enforcement

| Gate | Where | What |
|------|-------|------|
| Pre-commit Gate 0 | Both clones | Blocks direct commits to main |
| Pre-commit Gate 1 | Both clones | head.json locked to feat/wip/develop |
| Pre-commit Gate 2 | Both clones | Gitsafe denylist compliance |
| Gitsafe | Production | File access denylist + maxBytes |
| Branch restriction | CLI | Commands require main branch |

## CLI Commands

```bash
roadmap topology show                              # Full architecture JSON
roadmap topology where                             # Current position
roadmap topology validate                          # Verify clone state
roadmap topology enforce --op push --to origin     # Check operation
roadmap topology enforce --op work --branch feat/x # Check operation
roadmap topology help                              # Usage
```

No `--note` required. All output is JSON.
