# Phase 5: Reorientation with Audit + Checkpoint

Combining reorientation with safe recovery.

## Pattern

1. **Checkpoint before major work**
2. **Do work**
3. **Reorient to new position**
4. **If blocked/failed: restore from checkpoint**

## Example: Test Phase Failure

```
Position: build (produce dist/)
  ✓ dist/ exists

Phase work: test (produce coverage/)
  ✓ Tests run
  ✗ Test fails after 2 minutes

Reorient: still test (coverage/ doesn't exist)

Options:
  a) Fix test, rerun, reorient again
  b) Restore from checkpoint, try different approach
```

## Audit Trail

Every orientation recorded:
```jsonl
{"ts":"2025-02-26T11:00:00Z","cmd":"orient","note":"session start","position":"build"}
{"ts":"2025-02-26T11:30:00Z","cmd":"orient","note":"compile done","position":"test"}
{"ts":"2025-02-26T12:00:00Z","cmd":"orient","note":"test failed, restored","position":"test"}
{"ts":"2025-02-26T13:00:00Z","cmd":"orient","note":"test fixed","position":"release"}
```

Query: `roadmap trail --repo myproject --last 10`

## Reorientation in Multi-Repo

```
Project A: position build
  → produce dist/A

Project B depends on A:dist/
  → position waiting

A completes, checkpoints
  → Regent orients B
  → B's position advances to build

B completes, checkpoints
  → Regent orients both + C
  → C's position advances
```

## Guidelines

- ✅ Checkpoint after each phase
- ✅ Reorient after every decision point
- ✅ Log your reasoning in --note
- ✓ Audit trail is immutable (append-only)

## See Also

- `AuditTrail` in recovery.ts
- `trail` command in bin/roadmap.ts
