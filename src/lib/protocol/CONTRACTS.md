# Roadmap Protocol: Implicit Contracts & Preconditions

**Document comprehensive contract specification for roadmap execution. This establishes the ground truth for enforcement.**

---

## Core Contracts

### Contract 1: Graph Validity
**What:** A valid Graph must have init, term nodes and no cycles.
**Precondition:** Before `define(g)`, caller must ensure structure is sound.
**Enforcement:** `define()` validates and throws on violation.
**Test:** `tests/protocol.test.ts — define: structural validation`

---

### Contract 2: Consume-Produce Alignment
**What:** Every consumed artifact must be produced by a predecessor.
**Precondition:** All consuming nodes must have dependencies that produce what they need.
**Enforcement:** `verify(g)` catalogs misaligned consumes.
**Test:** `tests/protocol.test.ts — verify: contract validation`
**Implicit assumption:** Produces are cumulative (once produced, remain available downstream).

---

### Contract 3: Batch Contiguity
**What:** A batch is a set of nodes with no gaps in topological order.
**Precondition:** Batch position must be contiguous — no node in position can have unfinished dependencies outside the batch.
**Enforcement:** `assertContiguousBatch()` in batch-invariants.ts
**Test:** `tests/batch-invariants.test.ts`
**Implicit assumption:** Topological sort is stable across runs.

---

### Contract 4: Claimability
**What:** A node is claimable if all its dependencies are completed.
**Precondition:** Before claiming a node, completion records must show all deps done.
**Enforcement:** `assertClaimability()` in batch-invariants.ts
**Test:** `tests/batch-invariants.test.ts`
**Implicit assumption:** Completion records are authoritative (files may disappear, but completion record is truth).

---

### Contract 5: Completion-Produces Sync
**What:** If produces files exist, completion record should too. If completion record shows passing, produces should exist.
**Precondition:** After node execution, both artifacts and records must be written atomically.
**Enforcement:** `syncCompletionWithProduces()` in completion-enforcer.ts
**Test:** `tests/completion-enforcer.test.ts`
**Implicit assumption:** Git commits are atomic (if commit succeeds, all produces + record exist).

---

### Contract 6: Orient Position Stability
**What:** `orient()` returns the same position if filesystem state hasn't changed.
**Precondition:** No concurrent modifications to completion records while orient runs.
**Enforcement:** Orient reads are snapshot-consistent.
**Test:** `tests/protocol.test.ts — orient: filesystem-state position`
**Implicit assumption:** Filesystem is quiescent during orient (single-threaded model).

---

### Contract 7: Brief Isolation
**What:** Agent brief contains ONLY: nodeId, produces, consumes, description, pattern, handoffs. NO DAG introspection.
**Precondition:** Brief generator must filter DAG context before passing to agent.
**Enforcement:** `brief-validator.ts` schema check at agent spawn.
**Test:** `tests/brief-validator.test.ts`
**Implicit assumption:** Agent cannot access parent context (process isolation).

---

### Contract 8: Handoff Completeness
**What:** Agent handoff must include enough state for next agent to continue: completion record, interim checkpoints, key decisions.
**Precondition:** First agent must write structured handoff before releasing.
**Enforcement:** `handoff-journal.ts` validates handoff schema.
**Test:** `tests/handoff-journal.test.ts`
**Implicit assumption:** Handoff file exists before next agent reads it (serialized agent spawning).

---

### Contract 9: Retirement Immutability
**What:** Retired nodes never reappear in positions. Once retired, always skipped.
**Precondition:** Retirement must be recorded persistently (not in-memory).
**Enforcement:** `assertRetirementConsistency()` in batch-invariants.ts
**Test:** `tests/batch-invariants.test.ts`
**Implicit assumption:** Retirement state is stored in head.json (recoverable after restart).

---

### Contract 10: Validator Preconditions
**What:** Each validation rule has preconditions; violation = silent failure unless guarded.

| Rule | Precondition | Guard Status |
|------|---|---|
| `shell` | Command is safe to re-run | ❌ UNGUARDED — assumes idempotence |
| `build-produces` | Build is deterministic, outputs idempotent | ❌ UNGUARDED — assumes reproducibility |
| `launch-check` | Process doesn't leak, cleanup is reliable | ❌ UNGUARDED — assumes hygiene |
| `artifact-exists` | File path is valid, readable | ✅ SAFE — simple file check |
| `spec-conformance` | Spec file exists and is valid YAML | ⚠️ PARTIAL — spec validation exists |
| `artifact-schema` | Schema file exists (implementation pending) | ❌ UNIMPLEMENTED |
| `intent` | Confidence field is 0-1, evaluator is valid | ❌ UNIMPLEMENTED (handler missing) |

---

## Preconditions by Execution Phase

### Phase 1: DAG Loading
- `head.json` exists and is valid JSON
- All node IDs are unique
- Init and term nodes are defined

### Phase 2: Orientation
- Filesystem is quiescent (no concurrent writes)
- Completion records are consistent with git history
- No orphaned nodes (unreachable from init or term)

### Phase 3: Batch Advancement
- Current batch is fully complete (all nodes have passing validation)
- No nodes are claimed by other workers
- Git working tree is clean (ready for commit)

### Phase 4: Agent Execution
- Brief is valid (passes schema validation)
- Produces paths are writable
- Completion record template is prepared
- Parent process is ready to receive handoff

### Phase 5: Completion
- Artifacts match produces paths in node spec
- Validation rules are executable (shell commands exist, etc.)
- Completion record is signed with current git SHA
- No race condition with other nodes

---

## Enforcement Status

| Contract | Enforced | Test | Severity |
|----------|----------|------|----------|
| Graph validity | ✅ define() | 7 cases | CRITICAL |
| Consume-produce | ✅ verify() | 6 cases | CRITICAL |
| Batch contiguity | ✅ assertContiguousBatch() | 3 cases | HIGH |
| Claimability | ✅ assertClaimability() | 4 cases | HIGH |
| Completion-produces sync | ✅ syncCompletionWithProduces() | 6 cases | HIGH |
| Orient stability | ✅ snapshot semantics | 8 cases | MEDIUM |
| Brief isolation | ⚠️ documented, validator TBD | pending | HIGH |
| Handoff completeness | ⚠️ schema design, tests TBD | pending | MEDIUM |
| Retirement immutability | ⚠️ design exists, tests TBD | pending | HIGH |
| Validator preconditions | ❌ unguarded | none | MEDIUM |

---

## Next Steps

1. Implement `brief-validator.ts` to enforce Contract 7
2. Add guards to shell/build-produces rules (Contracts 10)
3. Implement artifact-schema and intent rule handlers
4. Add precondition checks to phase 3-5 (git status, retry logic)
5. Document in agent execution manifest
