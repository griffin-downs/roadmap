# roadmap

[![test](https://github.com/Ocean-Synaptics/roadmap/actions/workflows/test.yml/badge.svg)](https://github.com/Ocean-Synaptics/roadmap/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DAG-governed development protocol. Define a typed graph of work — nodes produce artifacts, edges encode dependencies. The system validates structure, tracks position from filesystem state, and enforces completion via runtime gates.

## Install

```bash
pnpm add @ocean-synaptics/roadmap
```

Or clone and link for development:

```bash
git clone https://github.com/Ocean-Synaptics/roadmap
cd roadmap && pnpm install && pnpm run build && pnpm link --global
```

For a guided setup that adapts to your environment (package manager, monorepo conventions, agent stack), run `roadmap init` — it prints LLM-runnable prose you can paste into Claude Code or any agent. See [docs/SETUP.md](docs/SETUP.md).

## Quick start

```bash
# 1. author a spec
cat > my-spec.json <<'EOF'
{
  "schema_version": 1,
  "engine": { "name": "spec-kit", "version": "1.0.0", "config_hash": null },
  "dag_id": "hello",
  "dag_desc": "first DAG",
  "tasks": [
    { "id": "init", "desc": "start", "produces": [], "consumes": [], "deps": [], "validate": [] },
    { "id": "build", "desc": "produce hello.txt", "produces": ["hello.txt"], "consumes": [], "deps": ["init"],
      "validate": [{ "type": "artifact-exists", "target": "hello.txt" }] },
    { "id": "term", "desc": "done", "produces": [], "consumes": ["hello.txt"], "deps": ["build"], "validate": [] }
  ]
}
EOF

# 2. compile spec to DAG
roadmap make my-spec.json --note "first DAG"

# 3. find current position
roadmap orient --note "begin"
# → position: ["build"]

# 4. produce the artifact and advance
echo "hello" > hello.txt
roadmap advance build --note "wrote hello"

# 5. continue until terminal
```

## Concepts

Each node declares:

| Field | Meaning |
|-------|---------|
| `produces` | files this node creates |
| `consumes` | files this node reads — must be produced by a predecessor |
| `deps` | predecessor node IDs |
| `validate` | rules that must pass for completion (shell commands, artifact checks, schema validation) |

Position is computed from filesystem state — which artifacts actually exist determines where you are. The graph is validated at TypeScript compile time, at import time via `define`, and at runtime via `orient` / `advance`.

## CLI

```
roadmap make <spec>  --note "..."   Create DAG from spec
roadmap orient       --note "..."   Current position + produces/consumes
roadmap advance [id] --note "..."   Complete node (run validators) or advance batch

roadmap dag insert   --note "..."   Insert node
roadmap dag remove   --note "..."   Remove node (--cascade)
roadmap dag modify   --note "..."   Modify node fields
roadmap dag log                     Mutation history

roadmap init                        Print setup instructions for your environment
roadmap viewer                      Start the DAG viewer dev server
roadmap api [<cmd>]                 JSON Schema for any command
roadmap help                        Usage
```

All commands except `help`, `orient`, and `api` require `--note "reason"`. Output is JSON. Every invocation records to `.roadmap/trail.jsonl`.

## Library API

```typescript
import { define, verify, orient } from '@ocean-synaptics/roadmap';

const g = define({
  id: 'auth-system', init: 'start', term: 'deployed',
  nodes: {
    start:    { id: 'start',    produces: ['schema.sql'],   consumes: [],            deps: [],        validate: [], idempotent: true },
    api:      { id: 'api',      produces: ['src/api.ts'],   consumes: ['schema.sql'], deps: ['start'], validate: [{ type: 'shell', command: 'npx tsc --noEmit' }], idempotent: true },
    deployed: { id: 'deployed', produces: ['deploy.json'],  consumes: ['src/api.ts'], deps: ['api'],   validate: [{ type: 'artifact-exists', target: 'deploy.json' }], idempotent: false },
  }
});

verify(g);  // all consumes satisfied by predecessor produces?
```

| Function | Purpose |
|----------|---------|
| `define(g)` | Validate structure — cycles, init/term, id consistency |
| `verify(g)` | Contract check — every consumed artifact produced by a predecessor |
| `orient(g, completion)` | Batch position from completion state |
| `advanceBatch(g, completion)` | Validate current batch done, return next |
| `parallelOrder(g)` | Topological sort into concurrent batches |

## Validation stack

| Layer | Catches | When |
|-------|---------|------|
| `tsc --noEmit` | Invalid dep refs, missing nodes | Compile time |
| `define(g)` | Cycles, missing init/term | Import time |
| `verify(g)` | Consumed artifact not produced upstream | On demand |
| `orient(g, completion)` | Batch position from filesystem | Session start |
| `advanceBatch(g, completion)` | All artifacts materialized + validators pass | Batch transition |

## Origins

Developed by Ocean Synaptics for managing complex agent-driven workflows. Presented as a poster at **ML Prague 2026** — see [Compiling Agent State](docs/Downs-CompilingAgentState-MLPrague2026.pdf) for the conceptual underpinning (the graph as compiled execution state; the process is ephemeral, the graph is permanent).

## License

[MIT](LICENSE)
