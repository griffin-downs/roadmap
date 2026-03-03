# Roadmap Architecture: The make→validate→brief→execute→term Pattern

## Overview

Roadmap enforces a mandatory execution pattern for every DAG (at every recursion level):

```
make → validate → brief → execute → term
```

Each phase is essential and gates the next. This ensures deterministic execution, sealed agent contexts, and recursive enforcement throughout the hierarchy.

---

## Phase 1: Make

**What:** Create ideal DAG from specification.

**Input:** JSON spec or SpecIR (tasks array with scenario coverage)

**Process:**
- Parse spec → DAG nodes
- Run `define()` — structural validation (cycles, init↔term)
- Run `verify()` — contractual validation (consumes satisfied by predecessors)
- Run `check()` — termination validation (all nodes reachable from init→term)

**Output:** Valid `.roadmap/head.json`

**Why essential:**
- **Deterministic**: Spec determines structure; no hand-assembly
- **Validated**: Cycles, missing nodes, broken contracts caught before execution
- **Auditable**: Spec origin recorded; DAG fully traced to source

**Rejection:** If validation fails → fix spec → retry make

---

## Phase 2: Validate

**What:** Run acceptance validation rules against current batch position.

**Rules:**
- `artifact-exists` — Physical artifact present in repo
- `artifact-schema` — Schema conformance (JSON, YAML, etc.)
- `spec-conformance` — Scenarios (Given/When/Then) covered by nodes
- `function` — Custom validation script (TS/JS)
- `manual-approval` — Human sign-off required

**Process:**
- For each node in current batch: run all `validate[]` rules
- Collect failures + successes
- Block advancement if any rule fails

**Why essential:**
- **Quality gates**: Ensures work meets acceptance criteria before moving on
- **Spec coverage**: Every scenario explicitly mapped to executing node
- **Recursive**: Applies at every DAG level (macro plans validate same as micro tasks)

**Rejection:** If validation fails → understand rule → fix artifact → retry complete

---

## Phase 3: Brief

**What:** Seal agent context — make what agents can/cannot see deterministic.

**What agents see:**
- Node ID, description, pattern (why this exists)
- `produces[]` — what to create
- `consumes[]` — what inputs to read
- `mode` — 'execute' or 'plan'
- Handoff docs from predecessors (decisions, gotchas)

**What agents cannot see:**
- Full DAG structure (other branches, downstream deps)
- Completion status of other nodes
- Validation rules (only their own node's rules apply)
- Retirement status or special cases

**Format:** `.roadmap/brief-<node-id>.json` (deterministic, read-only)

**Why essential:**
- **Context bounds**: Agents focus on their output, not the whole graph
- **Deterministic**: Same DAG state → same brief (reproducible execution)
- **Recursive**: Each expanded plan node receives sealed briefs for its children
- **Isolation**: Agents cannot introspect decisions made elsewhere

**Example brief for execute node:**
```json
{
  "nodeId": "auth-service",
  "mode": "execute",
  "description": "Implement JWT service with refresh token rotation",
  "pattern": "Microservice, stateless, 99.9% uptime SLA",
  "produces": ["src/services/auth.ts", "tests/auth.test.ts"],
  "consumes": ["src/types/token.ts", "docs/auth-spec.md"],
  "validates": [
    { "type": "artifact-exists", "paths": ["src/services/auth.ts"] },
    { "type": "spec-conformance", "spec": "docs/auth-spec.md", "scenario": "token-refresh" }
  ]
}
```

---

## Phase 4: Execute

**What:** Implement produces[] based on consumes[] + pattern.

**Constraints:**
- Read *only* files in `consumes[]` (contract boundary)
- Write *only* files in `produces[]`
- Commit message: `<node-id>: <what>`
- No access to full DAG, other nodes' status, or downstream context

**Checkpoints:**
- Save work to `.roadmap/checkpoints/<node-id>/` periodically
- Write decisions to `.roadmap/handoff-<node-id>.json` (for downstream nodes)

**Completion:**
- `roadmap complete <node-id>` triggers validation
- If all rules pass → node marked done
- If any rule fails → write error message, node stays incomplete

**Why essential:**
- **Focused work**: Agent doesn't need to understand whole system
- **Reversibility**: All work in produces[] can be audited or rolled back
- **Linearity**: Produces become next batch's consumes (data flow determines order)
- **Recursive**: Execute phase applies same discipline at every DAG level

---

## Phase 5: Term

**What:** Verify all work complete, DAG terminated.

**Process:**
- `roadmap advance` from final batch
- Check: `position.length === 0` (no remaining nodes)
- Emit: `{ done: true, level: N+1 }`

**Output:**
- Trail entry: final state marker
- Optional: Archive summary (nodes completed, time, artifacts)

**Why essential:**
- **Closure**: Clear signal that all work is done
- **Audit trail**: When and how the DAG completed
- **Recursive termination**: Parent DAGs wait for child DAGs to term before advancing

---

## Recursive Pattern Enforcement

The make→validate→brief→execute→term pattern applies **at every DAG level**.

### Flat DAG
```
init → task-1 → task-2 → task-3 → term
```
Single-level execution: make spec → execute tasks → term.

### Recursive (Plan-Mode) DAG
```
init → plan-auth (mode: 'plan') → term
       ↓
       [expanded children]
       init → auth-service → auth-tests → term
```

**Level 1 (macro):**
1. make: auth-spec.json
2. validate: plan node (checks expandedFrom children exist)
3. brief: agent receives sealed plan brief
4. execute: agent decomposes plan into child tasks (writes .roadmap/auth-plan.json)
5. term: plan node marked complete when expanded children validated

**Level 2 (micro, after expansion):**
1. make: auth-plan.json (emitted from level 1 execution)
2. validate: service + tests nodes pass artifact rules
3. brief: agents receive sealed execution briefs
4. execute: agents write source code
5. term: all children complete

**Validation gate:** Parent DAG cannot advance past plan node until child DAG is complete.

---

## Why Each Phase is Essential

| Phase | Problem Without It |
|-------|-------------------|
| **Make** | Specs vague, DAGs hand-assembled, cycles not caught, trust issues |
| **Validate** | Code doesn't match spec, scenarios get skipped, bad quality shipped |
| **Brief** | Agents see too much context, make decisions based on incomplete info, coordination overhead |
| **Execute** | Work sprawls, hard to audit, agent behavior non-deterministic |
| **Term** | No clear completion signal, unclear which work remains, parent DAGs hang |

---

## Concrete Example: Auth Module

**Spec (spec.json):**
```json
{
  "id": "auth-phase",
  "tasks": [
    { "id": "auth-service", "title": "JWT service + refresh rotation", "effort": 3 },
    { "id": "auth-tests", "title": "Service tests + edge cases", "effort": 2 }
  ]
}
```

**Make:**
```bash
roadmap make spec.json --note "auth phase — JWT service"
```
→ Creates head.json with 2 nodes + validation rules

**Validate:**
```bash
roadmap validate --note "check current batch"
```
→ Checks: test files exist, spec scenarios covered

**Brief (agent sees):**
```json
{
  "nodeId": "auth-service",
  "produces": ["src/services/auth.ts"],
  "pattern": "JWT with refresh rotation, 99.9% uptime"
}
```
Agent doesn't see: other nodes, overall strategy, retry logic.

**Execute:**
```bash
# Agent reads consumes[], writes produces[]
# Commits: git commit -m "auth-service: JWT service + refresh rotation"
roadmap complete auth-service --note "JWT implemented"
```

**Advance:**
```bash
roadmap advance --note "auth batch complete"
```
→ Next batch: auth-tests. Same cycle.

**Term:**
```bash
roadmap advance --note "all auth tests passing"
# Emits: { done: true, level: 2 }
```

---

## Constraints & Guarantees

**Constraints (what the system enforces):**
- 🔒 DAGs must be valid (make phase)
- 🔒 Briefs must be deterministic (same DAG state → same brief)
- 🔒 Agents cannot modify head.json directly
- 🔒 Agents cannot see full DAG or other nodes
- 🔒 Work must match produces[] (git hooks enforce)

**Guarantees (what you get):**
- ✅ Every scenario explicitly implemented (spec-conformance validator)
- ✅ No orphaned work (check() catches unreachable nodes)
- ✅ Deterministic execution (briefs sealed from DAG state)
- ✅ Auditable history (all state mutations in trail)
- ✅ Recursive discipline (pattern enforced at every level)

---

## See Also

- `bin/roadmap.ts` — CLI implementation of make/orient/advance
- `.claude/CLAUDE.md` — Session protocol + 3-command mainline
- `docs/CLI-REFERENCE.md` — Command reference and examples
- `src/protocol.ts` — define(), verify(), check() implementation
