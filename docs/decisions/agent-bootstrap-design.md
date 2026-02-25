# Agent Bootstrap Design — Regent Executor Pattern

**Status**: Specification (phase 9, node 1/6)
**Date**: 2026-02-25
**Related**: SPEC.md, sealed APIs (brief.ts, handoff.ts)

---

## Problem

Regent agents need to:
1. Boot and understand their position in a roadmap
2. Know what to build (produces) and what's available (consumes)
3. Checkpoint progress without manual context management
4. Advance to next node after completion
5. Leave knowledge for subsequent agents

Current: agents read full DAG, guess structure, waste tokens on orientation.

---

## Design

### Agent Lifecycle

```
┌─ Boot ──────────────────┐
│ agent boots in a repo   │
└──┬──────────────────────┘
   │
   ├─ Call getBrief()
   │  └─ returns {position, produces, consumes, pattern, handoff, journal}
   │
   ├─ Understand next step from brief
   │  └─ pattern: 1–2 sentences on how to build
   │  └─ handoff: previous agent's learnings
   │  └─ journal: timeline of discoveries
   │
   ├─ Work (multiple checkpoints possible)
   │  └─ checkpoint(progress, discovered, blockers)
   │     └─ writes interim handoff to work journal
   │
   └─ Complete and advance
      └─ advance(nodeId, {summary, decisions, gotchas, ready})
         └─ validates handoff, moves position
         └─ next agent reads brief and sees journal
```

### API Signatures

```typescript
// Agent calls this once at boot
const brief = await getBrief();
// Returns: {position, produces, consumes, description, pattern,
//           handoff: {summary, decisions, gotchas},
//           handoffJournal: [{timestamp, progress, discovered, blockers}...]}

// Agent checkpoints during work (0..N times)
await checkpoint({
  progress: 0.5,  // 0.0–1.0
  discovered: ["pattern works", "gotcha found"],
  blockers: ["null-safety edge case"],
  currentFile: "schema.ts",
});

// Agent completes work and advances
await advance(nodeId, {
  summary: "Schema complete with validation",  // ≤100 chars
  keyDecisions: ["readonly fields", "validation fn"],
  gotchas: ["handle null cases"],
  nextNodeEntry: {
    consumes: [list of actual artifacts produced],
    ready: true,  // is next node unblocked?
    blockers: [],  // issues next agent will hit
  },
});
```

### Bootstrap Constraints

**Sealed APIs**: Agent cannot:
- Read `.roadmap/head.json` (blocked by Regent hooks)
- Access `dag.nodes` directly
- Introspect structure (can't see if they could skip to term)
- Forge position or checkpoint data

**Tight Briefs**: Agent cannot:
- Read long prose (description ≤150 chars)
- Make extra tool calls (all context in getBrief response)
- Ignore handoff journal (it's right there, scannable)

**Immutable Journal**: Agent cannot:
- Erase prior work (interim handoffs are append-only)
- Modify previous discoveries
- Hide blockers they hit

Result: agents **cannot get clever**. They work forward from brief, checkpoint incrementally, advance with complete handoff.

---

## Example: git-state-spec Agent

```typescript
// 1. Boot
const brief = await getBrief();
// {
//   position: "git-state-spec",
//   produces: ["src/git-state.schema.ts", "docs/decisions/git-state-spec.md"],
//   consumes: ["src/protocol.ts"],
//   description: "Spec: git-state.json schema — phase annotation...",
//   pattern: "Write TypeScript interface + validation. Immutable fields.",
//   handoff: undefined,  // first node, no prior work
//   handoffJournal: [],
// }

// 2. Work (multiple iterations)
await checkpoint({
  progress: 0.3,
  discovered: ["readonly makes sense", "phase field crucial"],
  blockers: [],
  currentFile: "src/git-state.schema.ts",
});

// ...time passes, more work...

await checkpoint({
  progress: 0.7,
  discovered: ["validation patterns", "import pattern works"],
  blockers: ["edge case: null lastCheckpoint"],
  currentFile: "src/git-state.schema.ts",
});

// 3. Complete
await advance("git-state-spec", {
  summary: "Schema + validation complete",
  keyDecisions: [
    "GitState uses readonly for immutability",
    "validateGitState checks type structure",
    "isFresh() checks cache age",
  ],
  gotchas: ["lastCheckpoint must handle null", "dirty[] can be undefined"],
  nextNodeEntry: {
    consumes: ["src/git-state.schema.ts"],
    ready: true,
  },
});

// 4. Next agent (git-state-impl) boots and sees
const nextBrief = await getBrief();
// {
//   position: "git-state-impl",
//   produces: ["hooks/post-commit.ts", "hooks/session-start.ts"],
//   consumes: ["src/git-state.schema.ts"],
//   description: "Implement: post-commit hook + session-start hook...",
//   pattern: "Hook writes .regent/git-state.json after git ops.",
//   handoff: {
//     summary: "Schema + validation complete",
//     keyDecisions: [
//       "GitState uses readonly for immutability",
//       "validateGitState checks type structure",
//       "isFresh() checks cache age",
//     ],
//     gotchas: ["lastCheckpoint must handle null", "dirty[] can be undefined"],
//   },
//   handoffJournal: [
//     {timestamp: "2026-02-25T10:15Z", progress: 0.3, discovered: [...], blockers: []},
//     {timestamp: "2026-02-25T10:22Z", progress: 0.7, discovered: [...], blockers: [...]},
//     {timestamp: "2026-02-25T10:35Z", progress: 1.0, summary: "...", ready: true},
//   ],
// }

// Next agent immediately knows: "they discovered readonly is key, hit null edge case"
// No re-reading schema, no reverse-engineering, just execution.
```

---

## Implementation Path

1. **Agent Template** (`.claude/agents/roadmap-executor-template.md`):
   - Boilerplate prompt
   - getBrief() → understand position
   - Work pattern
   - checkpoint() → save progress
   - advance() → complete and move on

2. **Executor Agent** (`agent-executor-impl` node):
   - TypeScript implementation of template
   - Tests: boot, call getBrief, checkpoint, advance, verify handoff

3. **Real Project Tests** (`fusion-integration`, `cockpit-integration`):
   - Run executor on real roadmaps (fusion, cockpit)
   - Validate work journal, checkpoint data, phase advancement
   - Prove multi-project pattern works

---

## Benefits

| Concern | Before | After |
|---------|--------|-------|
| Agent orientation time | 500ms (git ops) | <100ms (JSON read) |
| Context understanding | Agent reads DAG, guesses | Agent reads 4-line brief |
| Work continuity | Interrupted work lost | Journal preserves discoveries |
| Next agent cold start | Re-reads prior node | Reads journal, starts warm |
| Agent cleverness | Could skip nodes | Can't: opaque API |
| Token waste | Analyzing structure | Minimal (tight briefs) |

---

## Open Questions

- Should `checkpoint()` be blocking (agent must call before advance)?
- Should handoff journal be kept indefinitely or archived after N days?
- Should bootstrap signature prevent modification of current position file?
