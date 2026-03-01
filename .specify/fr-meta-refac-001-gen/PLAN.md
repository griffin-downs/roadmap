# Execution Plan

## Strategy: cluster-first (high-value changes first)

### Phases
1. Consolidate schema (score: 50)
2. Wrap CLI commands (score: 35)
3. Split slow tests (score: 30)
4. Move IO ops (score: 28)
5. Wrap expand CLI (score: 22)

### Dependencies
- Consolidation unblocks CLI wraps
- Test splits can run in parallel
- All changes precede perf validation

### Parallelism Windows
- Phases 3-5 can run in parallel after phase 2
- Perf validation final gate
