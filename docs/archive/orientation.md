# orientation.md — Phase 1 complete (adversarial hardening)

## Position
**Current**: `term` (phase complete). Next phase: protocol expansion + advanced features.

## Done
- `init`: core protocol (6 functions, type inference), seed tests, self-ref roadmap, SKILL
- `adv-reconcile`: gap semantics spec (surplus produces excluded) — **FIXED**
- `adv-orient`: empty-produces stall spec (gates trivially done) — **FIXED**
- `reorient`: session entry gate, boot receipt
- `adv-property`: property-based consistency (order/orient, check/verify independence)
- `fix-reconcile`: decision doc + protocol.ts line 171 fix
- `fix-orient`: decision doc + protocol.ts line 228 + 238 fixes
- `adv-types`: type invariants I1/I2/I3 (validated tsc --noEmit)
- `consumer-integration`: smoke tests (package API, self-ref import, orient)

## Critical constraints (do NOT violate)
1. **Type safety is mandatory**: all node refs, ids, produces/consumes checked by tsc
2. **DAG must remain acyclic**: define() validates this. No circular dependencies.
3. **Partition invariant in orient()**: done ++ [position] ++ remaining = order(g) — exact union, no duplicates
4. **Contracts verifiable**: verify() identifies all unsatisfied consumes. No false negatives.
5. **Position is actionable**: orient() returns first node where actual work needed. No stalling.

## Deliverables
- **src/protocol.ts**: 243 lines, 6 functions, 3 types, 5 helpers. APIs stable for next phase.
- **tests/**: 76/76 passing. Core contract tests fail on old impl, pass after fix. Guards + smoke tests.
- **docs/decisions/**: 2 records explaining bugs, fixes, semantics.
- **Validation**: tsc clean, all tests pass, roadmap self-checks pass.

## Bugs resolved
| Bug | Fix | Evidence |
|-----|-----|----------|
| reconcile() surplus produces | Line 171: filter to unmet consumes only | adv-reconcile: 5 core contract tests |
| orient() empty-produces stall | Line 228: `!produces.length \|\| every(exists)` | adv-orient: 5 core contract tests |
| orient() partition break | Line 238: filter g.term from done | adv-property: P1 partition invariant |

## Next steps
- **Continue expansion**: see reorientation.md (phase 2 skeleton, gaps analysis)
- **Ship**: finalize SKILL.md, tag v0.1.0, npm publish
- **Debug**: `npm test` (suite errors), `npm run check` (types), `npm run seed` (validation)

## Capabilities — DELIVERED
| What | How | Phase |
|------|-----|-------|
| Type-safe construction | graph() + define() + tsc | Core |
| Cycle detection | Kahn's algorithm | Core |
| Reachability | BFS from init/term | Core |
| Contracts | Transitive closure over predecessors | Core |
| Topo sort | Kahn's deterministic | Core |
| Position finding | Partition invariant preserved | Core |
| Gap analysis | Unmet consumes only (no surplus) | Core |
| Property correctness | order/orient consistency, check/verify independence | Hardening |
| Type enforcement | Node ids/keys/deps validated by tsc | Hardening |
| Consumer API | Package import, orient(), end-to-end | Hardening |
