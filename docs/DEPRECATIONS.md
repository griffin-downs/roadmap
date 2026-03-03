# Deprecations

## CLI Consolidation (v0.3.0+)

Consolidated 41 commands → 6 core + 4 groups.

**Old commands removed.** Use new surface:

### Core (6 commands)
- `orient`, `advance`, `show`, `complete`, `chart`, `validate`

### Groups (4 commands)
- `dag {diff,expand,propagate,retire,optimize,switch,spawn}`
- `team {claim,dispatch,strategy,assign}`
- `spec {plan,import,intake,compile,init}`
- `util {trail,checkpoint,install,federation}`

No backward compatibility. Migration required.
