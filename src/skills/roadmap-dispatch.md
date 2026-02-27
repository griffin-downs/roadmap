<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-dispatch

Allocate nodes to agents for parallel execution. Run this before spawning swarm workers.

## Arguments
- `intent` (required): What the swarm is accomplishing. Becomes the orient --note.
- `owners` (optional): Comma-separated agent names for assignment. If omitted, --assign auto-allocates.

## Steps
1. Run: `$ROADMAP_BIN orient --assign --note "$intent"` (append `--owners $owners` if provided).
2. Parse the assignment output: agent-to-node mapping, conflict resolution results.
3. Run: `$ROADMAP_BIN orient --next` — identify the next batch for pre-warming.
4. For each assignment, return: `{ nodeId, owner, produces[], consumes[] }`.
5. Orchestrator spawns agents with their assigned node IDs. Each agent runs the swarm worker preamble:
   - `$ROADMAP_BIN orient --note "<node-id> — <what>"`
   - `$ROADMAP_BIN claim <node-id> --owner <agent-id>`
   - Work via `/roadmap-work` + `/roadmap-done`
6. Spawn the `--next` batch agents immediately for pre-warming while the current batch runs.

**Future: compile-prompts integration.** When `compile-prompts` ships (FR-COMPILE-PROMPTS), step 2 gains prompt compilation:
- Run: `$ROADMAP_BIN compile-prompts --env environment.md --batch current`
- Each assignment includes `{ nodeId, owner, promptPath }` — agents spawn with pre-compiled prompts.

## Contract
- **Do not hand-assign nodes.** `--assign` resolves conflicts. It clusters by data flow and respects exclusive ownership.
- **Never spawn coordination agents.** The DAG coordinates. One layer of agents max.
- **Pre-warm the next batch.** Spawn `--next` agents immediately so they load context while the current batch executes.
- **Spawn when:** 3+ independent units, zero shared context, each described by consumes/produces, parallelism gain > coordination cost.
- **Don't spawn when:** single-agent with full context is better than 5 with partial. Default is single-agent.
