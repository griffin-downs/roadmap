# Intake Enforcement

DAG creation is gated through the spec pipeline. Manual DAG construction via raw JSON is rejected at the CLI level.

## Why

Raw DAGs bypass provenance tracking, validation, and the spec-conformance chain. Every DAG must originate from a spec so that:

- **Provenance** is recorded (spec-origin.json tracks engine, hashes, import time)
- **Validation** runs at creation time (define, verify, check)
- **Conformance** can be verified against source scenarios
- **Audit** trail connects DAG nodes back to requirements

## Proper Workflow

```
spec source (requirements.md, plan, tasks)
  |
  v
roadmap spec plan --from <requirements.md>     # compile to spec IR
  |
  v
roadmap make spec.json --note "create DAG"      # create DAG from spec
  |
  v
roadmap orient --note "check position"          # inspect position
roadmap show <node-id>                          # inspect node
```

## What Gets Rejected

### Raw DAG JSON

```json
{ "id": "my-dag", "init": "start", "term": "end", "nodes": { ... } }
```

Error:
```
Invalid spec: raw DAG detected. Use the spec pipeline to create a spec first.

Cannot create DAG from raw JSON.
roadmap make expects a spec, not a DAG definition.

Proper workflow:
  1. roadmap spec plan --from <requirements.md> --output spec.json
  2. roadmap make spec.json
  3. roadmap show <node-id> to inspect
```

### Missing required fields

Spec must have: `schema_version`, `tasks` (array), `metadata` (object with `generated`, `compile_hash`).

Missing `tasks`:
```
Invalid spec: missing "tasks" array
```

Missing `metadata`:
```
Invalid spec: missing "metadata" object
```

## Valid Spec Format (SpecIR)

```json
{
  "schema_version": 1,
  "engine": { "name": "spec-kit", "version": "0.1.0", "config_hash": null },
  "dag_id": "my-project",
  "dag_desc": "Project roadmap",
  "inputs": [
    { "path": "requirements.md", "sha256": "abc123...", "role": "spec" }
  ],
  "tasks": [
    {
      "id": "setup",
      "desc": "Initialize project",
      "priority": 0,
      "depends": [],
      "produces": ["package.json"],
      "consumes": [],
      "mode": "execute",
      "validate": [{ "type": "artifact-exists" }]
    }
  ],
  "metadata": {
    "generated": "2026-03-03T00:00:00Z",
    "compile_hash": "def456..."
  }
}
```

## Consolidation

Auto-discovery consolidation is disabled. Multiple DAGs must be merged explicitly:

```bash
roadmap consolidate --specs spec-a.json,spec-b.json --note "merge phases"
```

Each spec must have a valid `spec-origin.json` (created automatically by `roadmap make`).

## Migration: "I have a manual DAG"

If you have an existing `head.json` created manually:

1. Extract your node definitions into a SpecIR-compatible `tasks` array
2. Add required fields: `schema_version`, `metadata`, `engine`
3. Save as `spec.json`
4. Run `roadmap make spec.json --note "migrate manual DAG"`

The spec pipeline will validate structure, write provenance, and create the DAG properly.

## On Success

When `roadmap make` succeeds, it writes:

- `.roadmap/head.json` — the DAG
- `.roadmap/spec-origin.json` — provenance receipt (engine, hashes, timestamp)

Both are committed together in a single git commit.
