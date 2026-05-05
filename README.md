# roadmap

[![test](https://github.com/Ocean-Synaptics/roadmap/actions/workflows/test.yml/badge.svg)](https://github.com/Ocean-Synaptics/roadmap/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Hi, I've worked on this tool, roadmap, entirely solo. I don't think it's the holy grail for anything and I hope at some point it will be obviated. But in the meantime, it's a useful tool for myself for orchestrating agent swarms while keeping my main context clean and its auditable trail gives me a sort of replacement for MEMORY.md.
>
> I hope that readers and trial users can take from this project the general set of techniques and philosophy which is this: a context window is a working cache over durable state, agents can write more complete specifications than humans, and if we subject these specifications to formal validation / static analysis afforded by compiler theory, we can make work durable and retrievable via LLM-friendly API calls.
>
> *Let structure carry knowledge, let intelligence live in the spec.*
>
> Enjoy 😎 --Griffin

> **Status:** Released for ML Prague 2026 (May 2026). The repository is public; **issues are open**; **external PRs are deferred until ~2026-05-15** while the maintainer is at the conference. See [docs/ROLLOUT.md](docs/ROLLOUT.md) for the contribution timeline.

Long agent runs leave a wake of half-finished commits, stale branches, and transcripts no one re-reads. `roadmap` declares the work itself as a typed DAG: each node names what it `produces`, what it `consumes`, and how to `validate`. Ordering falls out of the data flow; position is computed from filesystem state; completion is falsifiable via shell-command validators against real artifacts.

The graph survives sessions. A new agent — or the same one tomorrow — runs `roadmap orient` and inherits exactly the position the previous run left. Output is JSON; every advance is a receipt; the trail is append-only. The thesis: **the process is ephemeral, the graph is permanent.**

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

In a fresh repo, run a worked example:

```bash
git init -q
roadmap make examples/hello.spec.json --note try --skip-input-verification
roadmap orient --note try                # → position: [init]
echo '{}' > .roadmap/init.json
roadmap advance init --note "ratify"     # validators run, advance recorded
roadmap orient --note try                # → position: [build]
```

The DAG advances from `init` (writes a ratification receipt) through `build` (consumes the receipt, produces `hello.txt`) to `term`. Two specs ship in [examples/](examples/) — `hello` (linear, 3 nodes) and `parallel-build` (diamond, demonstrates parallel batches).

Read `roadmap api make` for the full SpecIR schema.

## Concepts

Each node is a seven-field `NodeSpec` (`schema_version: 2`):

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | yes | unique node identifier within the DAG |
| `desc` | yes | human-readable purpose |
| `produces` | yes | files this node creates |
| `consumes` | yes | files this node reads — must be produced by a predecessor (this is also the edge: ordering is expressed entirely via `consumes` ↔ `produces`, no separate `deps` field) |
| `validate` | yes | rules that must pass for completion (shell commands, artifact checks, schema validation) |
| `mode` | optional | `execute` (default) or `plan` |
| `sidecar` | optional | additional metadata carried alongside the node |

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
    start:    { id: 'start',    desc: 'create schema',   produces: ['schema.sql'],  consumes: [],             validate: [] },
    api:      { id: 'api',      desc: 'build api layer', produces: ['src/api.ts'],  consumes: ['schema.sql'], validate: [{ type: 'shell', command: 'npx tsc --noEmit' }] },
    deployed: { id: 'deployed', desc: 'deploy api',      produces: ['deploy.json'], consumes: ['src/api.ts'], validate: [{ type: 'shell', command: 'curl --fail $DEPLOY_URL/health' }] },
  }
});

verify(g);  // every consumed artifact produced by a predecessor?
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
| `tsc --noEmit` | Invalid consumes refs, missing nodes | Compile time |
| `define(g)` | Cycles, missing init/term | Import time |
| `verify(g)` | Consumed artifact not produced upstream | On demand |
| `orient(g, completion)` | Batch position from filesystem | Session start |
| `advanceBatch(g, completion)` | All artifacts materialized + validators pass | Batch transition |

## Origins

Developed by Ocean Synaptics for managing complex agent-driven workflows. Presented as a poster at **ML Prague 2026** under the title *Compiling Agent State* — see the proposal at [docs/Downs-CompilingAgentState-MLPrague2026.pdf](docs/Downs-CompilingAgentState-MLPrague2026.pdf). The conceptual underpinning: the graph is compiled execution state — the process is ephemeral, the graph is permanent.

## License

[MIT](LICENSE)
