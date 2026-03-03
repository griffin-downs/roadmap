# Migration Guide: 41 → 10 Commands

## Command Mapping

### Core Mainline (6)
| Old | New |
|-----|-----|
| `orient` | `orient` |
| `advance` | `advance` |
| `show` | `show` |
| `complete` | `complete` |
| `chart` | `chart` |
| `validate` | `validate` |

### DAG Group (9)
`diff`, `expand`, `propagate`, `retire`, `optimize`, `switch`, `spawn`, `accept`, `reject`
→ `dag {subcommand}`

### Team Group (4)
`claim`, `dispatch`, `strategy`, `assign`
→ `team {subcommand}`

### Spec Group
`plan`, `import`, `intake`, `compile`, `init`, `auto`, `propose`, `select`, `status`, `clear`, `absorb`
→ `spec {subcommand}`

### Util Group
`trail`, `checkpoint`, `install`, `federation`, `explore`, `health`
→ `util {subcommand}`

## Summary
- **6 core**: mainline execution loop
- **4 groups**: operational tasks
- **<40 lines help**: minimal surface
- **No backward compat**: clean break
