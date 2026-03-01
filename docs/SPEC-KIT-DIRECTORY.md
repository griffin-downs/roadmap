# Spec-Kit Directory Structure

## Location

`.roadmap/spec/` — workspace for spec-kit artifacts within any roadmap-governed repository.

## File Naming

All files are scoped by DAG ID:

| File | Purpose |
|------|---------|
| `<dag-id>-pre-spec.md` | Raw requirements, user intent, constraints |
| `<dag-id>-spec.md` | Structured specification (scenarios, acceptance criteria) |
| `<dag-id>-plan.md` | Decomposition plan (phases, node sketches) |
| `<dag-id>-tasks.md` | Importable task list (`roadmap import --from speckit`) |
| `<dag-id>-constitution.md` | Project constitution (optional, for complex projects) |

## Example Layout

```
.roadmap/
  head.json              # active DAG
  completed.json         # completion state
  trail.jsonl            # invocation trail
  spec/
    fr-auth-001-pre-spec.md
    fr-auth-001-spec.md
    fr-auth-001-plan.md
    fr-auth-001-tasks.md
    fr-billing-002-pre-spec.md
    fr-billing-002-spec.md
```

## Pipeline

The spec-kit pipeline flows left to right:

```
constitution → specify → plan → tasks → roadmap import --from speckit <dag-id>-tasks.md --id <dag-id>
```

Each stage reads the previous stage's output. `tasks.md` is the terminal artifact consumed by `roadmap import`.

## Migration from `.specify/`

Repositories previously using `.specify/` as the spec workspace should migrate to `.roadmap/spec/`:

1. Move files: `mv .specify/* .roadmap/spec/`
2. Rename to match `<dag-id>-` prefix convention if needed
3. Update any hardcoded `.specify/` references in scripts or CLAUDE.md
4. Remove `.specify/` once migration is confirmed

The roadmap CLI will check `.roadmap/spec/` first, falling back to `.specify/` for backward compatibility during the transition period.

## Conventions

- One DAG ID = one set of spec files. No shared spec files across DAGs.
- `pre-spec.md` is authoritative for requirements — downstream files derive from it.
- `tasks.md` must be parseable by `roadmap import`. Follow the format documented in spec-kit.
- Intermediate files (`spec.md`, `plan.md`) are working artifacts — commit them for traceability but the DAG is the source of truth once imported.
