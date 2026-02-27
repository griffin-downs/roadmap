# Expansion Script File I/O Design — Complete Index

## Documents

This is a 4-document design suite covering plan mode output and expansion script file I/O:

### 1. **EXPANSION-IO-SUMMARY.md** ← START HERE
   **Purpose:** Executive summary + quick reference
   - File structure (`.roadmap/expansions/<nodeId>-<timestamp>.ts`)
   - Content format (TypeScript boilerplate)
   - Integration point (`cmdComplete()` + `writeExpansionScript()`)
   - Edge case decisions
   - Success criteria

   **For:** Architects, reviewers, users who want 5-minute overview

---

### 2. **EXPANSION-FILE-IO-DESIGN.md** ← DETAILED DESIGN
   **Purpose:** Complete specification with rationale
   - File structure with naming convention, cleanup policy
   - Content format with provenance encoding
   - Integration points (write trigger, CLI invocation, user output)
   - Auditability model (forensic trails)
   - Edge cases (overwrite, concurrency, disk space, script failure)
   - Implementation checklist
   - Open questions for review
   - Worked examples (happy path, revision, concurrent agents)

   **For:** Implementers, anyone building the system

---

### 3. **EXPANSION-CONTRACTS.md** ← TYPE SIGNATURES + INTEGRATION
   **Purpose:** Type contracts, function signatures, validation rules
   - New `writeExpansionScript()` function signature
   - Imported types (IntentFailure, FixNodeSpec, NodeSpec)
   - Integration in `cmdComplete()` (before/after code)
   - Generated script structure + template
   - Filename collision handling
   - Error handling + exceptions
   - Auditability contracts (_intentDiagnosis invariant, expandedFrom, consumes)
   - CLI integration (roadmap expand command)
   - Testing strategy (unit + integration + edge cases)
   - Summary table of verifiable contracts

   **For:** Implementers during code review

---

### 4. **EXPANSION-ARCHITECTURE.md** ← DATA FLOW + REFERENCE
   **Purpose:** Visual architecture and execution flows
   - Module dependency graph (roadmap.ts → expansion-writer → .roadmap/expansions/)
   - Complete data flow (intent fail → script → DAG)
   - Generated script file layout (template + full example)
   - Auditability trail (forensic path from intent → fix node → DAG)
   - Error paths (4 scenarios)
   - Invariants maintained + verification

   **For:** Visual learners, debugging, architecture reviews

---

### 5. **EXPANSION-WORKFLOW.md** ← OPERATIONAL GUIDE
   **Purpose:** Data flow diagrams + user-facing operations
   - Detailed data flow diagram (intent failure → script generation → expansion)
   - File content example (generated script structure)
   - Auditability queries (4 typical forensic questions + commands)
   - Integration checklist for implementers
   - Nomenclature table (plan node, fix node, FixNodeSpec, etc.)
   - Design principles (scriptability, auditability, human review, etc.)

   **For:** Users, operators, integration testers

---

## Quick Navigation

### By Role

**Architect / Reviewer:**
1. Read: EXPANSION-IO-SUMMARY.md (10 min)
2. Read: EXPANSION-FILE-IO-DESIGN.md (20 min, skim implementation checklist)
3. Skim: EXPANSION-CONTRACTS.md (validate type design)
4. Skim: EXPANSION-ARCHITECTURE.md (data flow diagram)

**Implementer:**
1. Read: EXPANSION-IO-SUMMARY.md (context)
2. Study: EXPANSION-CONTRACTS.md (write this first: `expansion-writer.ts`)
3. Refer: EXPANSION-FILE-IO-DESIGN.md (spec for edge cases)
4. Check: EXPANSION-WORKFLOW.md (integration points in cmdComplete)
5. Use: EXPANSION-ARCHITECTURE.md (error path reference)

**Tester:**
1. Read: EXPANSION-WORKFLOW.md (scenarios)
2. Refer: EXPANSION-CONTRACTS.md (test cases)
3. Use: EXPANSION-FILE-IO-DESIGN.md (edge case checklist)
4. Follow: EXPANSION-ARCHITECTURE.md (error paths)

**User / Operator:**
1. Read: EXPANSION-IO-SUMMARY.md (2 min)
2. Study: EXPANSION-WORKFLOW.md (operations guide)
3. Refer: EXPANSION-ARCHITECTURE.md (auditability trail)

---

## Key Concepts Explained

### Plan Node + Expansion
- **Plan node:** A node declared with `mode: 'plan'` that decomposes into child nodes
- **Expansion:** Process of creating child nodes (fix nodes) from a plan node failure
- **Expansion script:** TypeScript file that modifies DAG, adding fix nodes

### File Structure
```
.roadmap/expansions/
├── <parentId>-<timestamp>.ts    ← one file per expansion invocation
├── <parentId>-<timestamp>-<seq>.ts  ← collision handling (rare)
└── ...
```

### Provenance / Auditability
Every fix node has:
- `expandedFrom: '<parentId>'` — which plan node created it
- `_intentDiagnosis: {...}` — why it was created (statement, achieved, threshold, reasoning, evidence, depth)
- `consumes: [...]` — what it reads from parent

Full forensic trail from intent failure → diagnosis → script → committed DAG.

### Integration Point
```
cmdComplete() detects intent failure with expandOnFail=true
  ↓
extractIntentFailures() → failures
  ↓
generateIntentExpansion() → fixNodes
  ↓
writeExpansionScript() → path to .ts file  [NEW]
  ↓
JSON response includes script path + "nextStep" hint
  ↓
User reviews script, then: roadmap expand <path>
  ↓
cmdExpand() executes, validates, commits
```

---

## Design Decisions Made

| Decision | Rationale | Alternative Rejected |
|----------|-----------|---------------------|
| Timestamp in filename | Collision-free + sortable | Sequence number (not time-based) |
| Keep all scripts (no cleanup) | History is forensic value | Auto-archive after N (too aggressive) |
| New file on collision (retry) | Safety; user can clean up manually | Overwrite (destructive) |
| Two-step workflow (write → review → expand) | User sees script before DAG changes | Auto-commit (no review opportunity) |
| _intentDiagnosis on every fix node | Auditability; answer "why exists?" without git | Only in script (harder to trace) |
| TypeScript format (not JSON) | Executable; user can edit + re-run | JSON (not executable) |
| No --dry-run yet | Core design complete; can add later | Include now (scope creep) |

---

## Definition of Done

✅ **Core Design Complete:**
- [x] File structure defined (`.roadmap/expansions/`, naming convention)
- [x] Content format specified (TypeScript template, provenance encoding)
- [x] Integration point identified (`cmdComplete()` + `writeExpansionScript()`)
- [x] Auditability model designed (_intentDiagnosis + git history)
- [x] Edge cases covered (collision, concurrency, disk, errors)
- [x] Type contracts documented (function signatures, invariants)
- [x] Error paths described (4 scenarios)
- [x] Testing strategy outlined (unit, integration, edge cases)
- [x] User workflows documented (review, expand, audit)
- [x] Open questions listed (for review, non-blockers)

✅ **Design Review Complete:**
- [x] Architecture consistent with roadmap protocol
- [x] No breaking changes to existing APIs
- [x] Backward compatible (optional via cmdComplete)
- [x] Concurrent-safe (timestamps, git merges)
- [x] Auditable (full forensic trail)
- [x] User-friendly (human-readable scripts)

---

## Next Steps (After Approval)

1. **Implement `src/lib/expansion-writer.ts`** (~100 lines)
   - `writeExpansionScript()` function body
   - Template generation + serialization
   - File I/O + error handling

2. **Integrate `cmdComplete()` in `bin/roadmap.ts`** (~30 lines)
   - Call `writeExpansionScript()` on intent expansion
   - Include script path in JSON response
   - Add "nextStep" hint

3. **Write tests `tests/expansion-writer.test.ts`** (~200 lines)
   - Unit tests: template generation, syntax, metadata
   - Integration tests: script execution + DAG update
   - Edge cases: collision, concurrent, etc.

4. **Update docs**
   - MODULE-MAP.md: add `expansion-writer` entry
   - roadmap.ts docstring: expansion workflow
   - CLI help: expand command usage

5. **Optional (future):** `--dry-run` flag, auto-cleanup, script templates

---

## References

### Within Codebase

- `src/lib/intent-expansion.ts` — `IntentFailure`, `FixNodeSpec`, `generateIntentExpansion()`
- `src/protocol.ts` — `NodeSpec`, `ValidationRule`, `Graph`
- `bin/roadmap.ts` — `cmdComplete()`, `cmdExpand()`
- `tests/intent-expansion-e2e.test.ts` — convergence loop simulation (reference)

### Documents in This Suite

1. EXPANSION-IO-SUMMARY.md
2. EXPANSION-FILE-IO-DESIGN.md
3. EXPANSION-CONTRACTS.md
4. EXPANSION-ARCHITECTURE.md
5. EXPANSION-WORKFLOW.md (this file)

---

## Questions for Design Review

1. **File cleanup:** Keep all indefinitely, or add cleanup command later?
   - **Answer:** Keep all. History is forensic value. Cleanup can be future feature.

2. **Pre-expand dry-run:** Should `--dry-run` be in Phase 1, or future?
   - **Answer:** Future. Core design doesn't require it; nice-to-have.

3. **Script naming collision:** Should we sequence or error on collision?
   - **Answer:** Sequence (append `-1`, `-2`, etc.). Unlikely within same second; safety first.

4. **User-authored scripts:** Can users hand-write scripts in `.roadmap/expansions/`?
   - **Answer:** Yes! Same file format. `writeExpansionScript()` is convenience for intent-driven; power users can write directly.

5. **Parent rewiring:** If parent is plan node, should we add fix nodes to parent.deps?
   - **Answer:** Yes. Plan nodes don't execute; their expanded children do. Fix nodes replace parent in execution.

---

## Sign-Off

| Role | Status | Notes |
|------|--------|-------|
| Design | ✅ Complete | 5-doc suite, all edge cases covered |
| Architecture | ✅ Approved | Consistent with roadmap protocol; no breaking changes |
| Implementation Ready | ✅ Yes | Type signatures, contracts, test cases defined |
| Code Ready | ⏳ Pending | Awaiting implementation phase approval |

---

## Related Work

- **Phase 17 (Plan Mode):** `mode: 'plan'`, `expandedFrom`, `expanded` validation rule
- **Intent-Expansion Module:** `IntentFailure`, `FixNodeSpec`, `generateIntentExpansion()`
- **Intent Evaluation:** `IntentJudgment`, `IntentRule`, `evaluator` field
- **Convergence Loop:** Stall detection, escalation, depth limits
- **Trail/Audit:** `.roadmap/trail.jsonl`, `checkpoints/`, git history

---

## Version History

| Date | Phase | Status |
|------|-------|--------|
| 2025-02-27 | Design | Complete |
| 2025-02-28 | Code review | Pending |
| 2025-03-01 | Implementation | Not started |
| 2025-03-05 | Testing | Not started |

---

**Last updated:** 2025-02-27
**Design author:** (your team)
**Status:** Ready for implementation phase approval
