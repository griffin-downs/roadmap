# fix-discovered-iterable — Verified

- `h.discovered ?? []` guard added to execution-miner.ts line 67
- Regression test: handoff with no discovered/blockers arrays → no throw
- 649/649 tests pass, build clean
