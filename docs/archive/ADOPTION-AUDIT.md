# Adoption Audit — Metrics for Real Projects

How do you know roadmap is working?

## Metrics

1. **Build time consistency** — Variance decreases with checkpoint recovery
2. **Failure recovery time** — Checkpoint restore vs. rebuild from scratch
3. **Multi-repo coordination** — Cross-repo phase latency
4. **Agent efficiency** — Sealed API prevents accidental DAG introspection
5. **Trail audit trail** — No missed phase transitions

## Example: Fusion Project

Before roadmap:
- Build failure → manual restart → 15 min recovery
- Phase unclear → inconsistent execution → 2 retries per sprint
- Cross-repo: manual verification → 30 min handoff

After roadmap:
- Build failure → checkpoint restore → 30 sec recovery
- Phase always clear → consistent execution → 0 retries
- Cross-repo: automatic verification → 2 min handoff

## Measurement

```bash
# Baseline (before)
roadmap trail --repo fusion --last 1000 | analyze

# Metrics show:
- Reorientation count
- Checkpoint recovery count
- Cross-repo coordination events
- Error rate by phase
```

## See Also

- `bin/roadmap.ts` — trail command implementation
- `audit.ts` — trail collection
