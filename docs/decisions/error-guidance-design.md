# Error Guidance Design — Compilation Errors as Teaching

**Status**: Specification (phase 9, node 2/5)
**Date**: 2026-02-25
**Related**: agent-bootstrap-design.md, SPEC.md

---

## Problem

When new projects integrate the roadmap library, they face three levels of uncertainty:

1. **Structural** — "What is a Graph? How do I define nodes?"
2. **Semantic** — "What should produces/consumes contain? What's idempotent?"
3. **Execution** — "I have a roadmap, now what? How do agents work?"

Current: consumer reads SKILL.md (60 lines), README.md, example files. High friction.

Better: **Each mistake is a teaching moment**. Errors guide the consumer through the planning process.

---

## Design

### Layer 1: No roadmap.ts yet

**Error**: Can't import roadmap types
```
Error: Cannot find module 'roadmap' or its corresponding type declarations.
  Did you mean to install it? → npm install roadmap
  Next: define your roadmap. See: https://[roadmap-guide]/#bootstrap

  Quick start:
  ```typescript
  import { define, graph } from 'roadmap';

  export default define(graph({
    id: 'my-project',
    desc: 'Project goal',
    init: 'start',
    term: 'done',
    nodes: {
      start: {id, desc, produces: [], consumes: [], deps: []},
      done: {id, desc, produces: [], consumes: [], deps: []},
    },
  }));
  ```
```

Error message teaches schema at the moment of need.

### Layer 2: roadmap.ts exists but DAG invalid

**Error**: `define()` detects cycle or missing init/term
```
Error: DAG validation failed
  Reason: Cycle detected (node A → B → C → A)
  Fix: Review your deps. Roadmaps must be acyclic.

  Node A deps: [B]
  Node B deps: [C]
  Node C deps: [A]  ← This creates the cycle

  To resolve: Remove one edge. Example:
    - Remove C→A dependency, or
    - Merge A and C into one node

  More info: https://[roadmap-guide]/#cycles
```

Teaches acyclicity constraint at the moment of violation.

### Layer 3: roadmap.ts valid but incomplete

**Error**: `check()` returns orphans
```
Error: DAG not fully connected
  Position: orient() found disconnected subgraph

  Connected to INIT:
    init → spec → impl → done

  Orphans (unreachable from INIT):
    - test (nothing leads to it)
    - docs (nothing produces input it needs)

  To fix:
    1. Expand backward from TERM: what must exist before TERM?
    2. Expand forward from INIT: what can we build first?
    3. Reconcile: where does INIT's output meet TERM's needs?

  Example: If test consumes impl's output, add edge: impl → test

  Run 'roadmap plan' to see recommended expansions.
```

Teaches gap analysis at the moment of incompleteness.

### Layer 4: roadmap.ts valid but contracts broken

**Error**: `verify()` detects unsatisfied consumes
```
Error: Contract violation
  Node: impl
  Problem: consumes 'spec.md' but no predecessor produces it

  Known producers of 'spec.md':
    - spec (id: spec, produces: [...])

  Known consumers of 'spec.md':
    - impl (id: impl, consumes: [...])

  To fix:
    1. Add edge: spec → impl (make spec a dependency)
    2. Or: Remove 'spec.md' from impl's consumes if not needed
    3. Or: Add another node that produces 'spec.md'

  Run 'roadmap verify' for all contract violations.
```

Teaches contracts when they're violated.

### Layer 5: Agent can't understand brief

**Error**: `getBrief()` returns pattern = "???" (pattern inference failed)
```
Warning: Pattern inference failed for node: custom-work
  Node pattern: (unknown pattern matching: "custom-work")

  Pattern is: How agents should approach building produces.
  Example patterns (by node type):
    - *-spec nodes: Write design doc with examples
    - *-impl nodes: Implement from spec, keep minimal
    - *-test nodes: Write tests proving spec properties
    - *-doc nodes: Write narrative docs from code

  Best practice: Include pattern hint in node.desc
  Example desc: "Spec (design doc): git-state.json schema..."

  Agent will still work, but will use generic pattern.
```

Warns when pattern can't be inferred, teaches pattern concept.

### Layer 6: Agent hits handoff blocker

**Error**: `advance()` rejects incomplete handoff
```
Error: Cannot advance node: git-state-spec
  Reason: Handoff validation failed

  Required fields:
    ✓ summary (provided)
    ✓ keyDecisions (provided)
    ✗ gotchas (empty)
    ✗ nextNodeEntry.ready (not set)

  Why these matter:
    - gotchas: tells next agent what you discovered
    - ready: tells system if next node is unblocked

  Before advancing:
    1. What did you learn that next agent should know? → gotchas
    2. Are all your produces complete? → ready: true
    3. Will next agent have blockers? → nextNodeEntry.blockers

  Example:
    gotchas: [
      "null comparisons needed for lastCheckpoint",
      "readonly prevents mutation",
    ],
    nextNodeEntry: {
      consumes: ["src/git-state.schema.ts"],
      ready: true,
    }
```

Teaches handoff semantics at validation failure.

---

## Implementation Strategy

Each error message is a **mini tutorial**:
1. **Diagnosis** — What went wrong?
2. **Why it matters** — Why this constraint exists?
3. **How to fix** — Concrete next steps
4. **Example** — Show the pattern
5. **Learn more** — Link to detailed docs

### Error Codes

Standardize error messages by type:

| Code | Trigger | Teaches |
|------|---------|---------|
| `DAG-CYCLE` | define() detects cycle | Acyclicity requirement |
| `DAG-MISSING-INIT` | define() missing init node | INIT node required |
| `DAG-MISSING-TERM` | define() missing term node | TERM node required |
| `DAG-ORPHAN` | check() finds unreachable nodes | Gap analysis (expand/reconcile) |
| `CONTRACT-UNSATISFIED` | verify() finds missing produces | Reconcile() function |
| `BRIEF-PATTERN-UNKNOWN` | getBrief() can't infer pattern | Pattern types by node |
| `HANDOFF-INCOMPLETE` | advance() rejects handoff | Handoff required fields |
| `POSITION-MISMATCH` | advance() called on wrong node | Position verification |
| `BOOTSTRAP-TAMPERED` | verifyBootstrapSignature() fails | DAG integrity check |

Each code links to a specific section of SPEC.md or this document.

### Error Message Template

```
Error: [CODE] {One-liner describing what went wrong}

  Details:
    {Specific thing that failed}
    {Where it was detected}
    {What caused it}

  Why this matters:
    {Why roadmap needs this property}
    {Impact of violation}

  How to fix:
    1. {Action 1}
    2. {Action 2}
    3. {Verify}

  Example:
    {Show good code}

  Learn more:
    → SPEC.md section: [Topic]
    → Documentation: [Link]
    → Similar errors: DAG-ORPHAN, CONTRACT-UNSATISFIED
```

---

## Benefits

| Stage | Before | After |
|-------|--------|-------|
| First-time setup | Read 3 docs + examples | Get helpful error, fix issue |
| DAG validation | "Fix the error" (vague) | "Cycle in A→B→C, remove one edge" |
| Contract debugging | Hunt for missing files | "Nobody produces spec.md, add spec→impl" |
| Agent confusion | "What do I build?" | Pattern tells agent exactly what to do |
| Handoff validation | "What's required?" | Validation error lists missing fields |

---

## Gotchas

- **Error message length** — Keep errors scannable, link to docs for depth
- **Overwhelming help** — Too many suggestions = paralysis. Be specific.
- **Changing signatures** — If protocol changes, error messages must update too
- **Localization** — Errors should be tool-readable (return structured JSON too)

---

## Open Questions

- Should errors suggest AI-powered fixes? ("Run 'roadmap fix' to auto-repair")
- Should we track which errors consumed users most time?
- Should error messages include links to video tutorials?
