# Expansion Script File I/O — Design Summary

## Quick Reference

### File Structure
```
.roadmap/expansions/
├── <nodeId>-1709078400.ts     # Unix timestamp = sortable, collision-free
├── <nodeId>-1709078401.ts     # One per invocation (retry = new file)
└── ...
```

### Content
- Valid, executable TypeScript
- Imports: `fs`, `path`, type imports from roadmap
- Loads `head.json`, modifies `dag.nodes`, writes back
- Each fix node gets `_intentDiagnosis` metadata
- Header comment: node ID, timestamp, parent, diagnosis summary

### Integration Point
**When:** `cmdComplete()` detects intent failure with `expandOnFail=true`
**Action:** Call `writeExpansionScript()` → returns path
**Output:** Include script path in JSON response + "nextStep" hint

### User Workflow
1. `roadmap complete <node>` → expansion script written + JSON output
2. User reviews: `cat .roadmap/expansions/<nodeId>-<timestamp>.ts`
3. User runs: `roadmap expand .roadmap/expansions/<nodeId>-<timestamp>.ts`
4. DAG updated + committed with single commit

---

## Provenance (Auditability)

Every fix node carries a **full chain of causation**:

```typescript
{
  id: 'plan-auth-fix-0',           // What was created
  expandedFrom: 'plan-auth',       // Why (parent plan node)
  _intentDiagnosis: {              // Why it exists
    statement: 'JWT module...',    // What failed
    achieved: 0.42,                // Actual confidence
    threshold: 0.90,               // Required confidence
    reasoning: 'Tokens rotate...', // Analysis from evaluator
    evidence: ['src/auth.ts:45'],  // Concrete references
    expansionDepth: 1,             // How many expansions in
  }
}
```

Plus: git history, trail entries, script history in `.roadmap/expansions/`

---

## Edge Cases (Decisions Made)

| Scenario | Decision | Rationale |
|----------|----------|-----------|
| Same node, second attempt | New file (new timestamp) | Keeps history; manual cleanup if needed |
| Concurrent agents | Timestamp ensures no collision | Unlikely to hit same second anyway |
| Script error | User edits + re-runs `roadmap expand` | Scripts are user-editable; recovery is graceful |
| Disk space | Keep all (no auto-cleanup) | Scripts ~5 KB each; history is forensic value |
| Overwrite existing | Error (refuse) | Safety first; user deletes if unwanted |

---

## Implementation (New Code)

**File:** `src/lib/expansion-writer.ts` (~100 lines)

```typescript
export function writeExpansionScript(
  parentId: string,
  parentNode: NodeSpec<any>,
  failures: IntentFailure[],
  fixNodes: FixNodeSpec[],
  reason: 'intent-expansion' | 'runtime-explore' | 'escalation-recovery',
  repoRoot: string,
): string {
  // 1. Create .roadmap/expansions/ if missing
  // 2. Generate filename: <nodeId>-<timestamp>.ts
  // 3. Build TypeScript file:
  //    - Header: // Expansion script for: ...
  //    - Imports: fs, path, types
  //    - Load head.json
  //    - for-loop: add each fix node with _intentDiagnosis
  //    - Parent rewire (if plan node)
  //    - writeFileSync + console.log
  // 4. Return absolute path
}
```

**Integration:** `bin/roadmap.ts` in `cmdComplete()`
```typescript
if (result.expansionStatus === 'expanding') {
  const scriptPath = writeExpansionScript(
    nodeId, node, result.failingIntents, fixNodes, 'intent-expansion', repoRoot
  );
  // Include in JSON response: script, nextStep
}
```

**Tests:** `tests/expansion-writer.test.ts` (10+ scenarios)

---

## Success Criteria

- [x] Scripts are human-readable (no binary, no minification)
- [x] Scripts are deterministic (same input = same file content)
- [x] Scripts are discoverable (`.roadmap/expansions/`, timestamped, sorted)
- [x] Scripts are auditable (full _intentDiagnosis chain)
- [x] Scripts prevent accidental overwrites (collision handling)
- [x] Scripts are concurrent-safe (timestamps, git merges)
- [x] Scripts are self-contained (no side effects, idempotent)
- [x] User can review before `roadmap expand` (two-step workflow)

---

## Nomenclature (For Reference)

- **Plan node** — `mode: 'plan'`, to be decomposed
- **Fix node** — Child created by expansion; `expandedFrom: parentId`
- **Expansion script** — The `.ts` file written to disk
- **IntentFailure** — One failing intent + diagnosis
- **FixNodeSpec** — Node definition ready to add to DAG
- **_intentDiagnosis** — Provenance metadata on fix node
- **expandedFrom** — Backpointer: `fix.expandedFrom = parent.id`

---

## Related Files

- `src/lib/intent-expansion.ts` — generates FixNodeSpec[] from failures
- `src/lib/expansion-writer.ts` — **NEW** — writes scripts to disk
- `bin/roadmap.ts` — `cmdComplete()` + `cmdExpand()` commands
- `docs/EXPANSION-FILE-IO-DESIGN.md` — full design (this summary's parent)
- `docs/EXPANSION-WORKFLOW.md` — data flow diagrams + examples

---

## Backward Compatibility

No breaking changes:
- Scripts are new files (don't touch existing DAG/protocol)
- `writeExpansionScript()` is opt-in via `cmdComplete()`
- Existing expansions in `scripts/` directory (manual/structural) unaffected
- `roadmap expand` command unchanged; scripts are drop-in

---

## Future Extensions (Not in Scope)

- `roadmap expand --dry-run` (validate without commit)
- `roadmap cleanup --expansions` (archive old scripts)
- Script templates (user-facing library of expansion patterns)
- LLM-generated expansions (given failures, generate script)

These can be added without changing this design.
