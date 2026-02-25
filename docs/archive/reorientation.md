# reorientation.md — Post-phase 2 gap analysis (Conceptual / Normative / Operational)

After phases 1–2, the core protocol is proven correct and merge operations enable DAG composition. This reorientation identifies gaps before phase 3+ expansion.

## CONCEPTUAL LAYER — What the protocol SHOULD do

**Goal**: Minimal sufficient spec for autonomous agent execution using DAGs as governance.

**Achieved**:
- ✓ Type-safe node construction, artifact specs, dependency tracking
- ✓ Cycle detection, reachability validation, contract satisfaction checking
- ✓ Position finding (orient) with actionable semantics — "what work is blocked"
- ✓ Gap analysis (reconcile) — "what new nodes must be created to close the gap"
- ✓ Topological ordering, consistent with orient (order/orient consistency proven)
- ✓ DAG composition via merge — enables recursive expansion and multi-repo coordination

**Open questions** (not blocking execution, but design considerations):
1. **Branching strategy**: fork a DAG at a node, develop two parallel branches, merge back?
   - Use case: A/B testing roadmap designs, feature flags, conditional execution paths
   - Design blocker: How to represent "either/or" in a DAG? (currently strictly ordered)
2. **Checkpointing**: Can we save/restore orient() position + session state persistently?
   - Use case: Resume execution across sessions, audit trails, snapshot-based governance
   - Implementation: .boot/session-receipt.json (partially done, needs design)
3. **Recursion depth**: How deep can RECURSE go? (expand a node into a sub-roadmap, then expand sub-nodes?)
   - Use case: Fractal roadmaps (project → sprint → day → task)
   - Current: No depth limit in type system, but orient() complexity grows recursively

**Not in scope (yet)**: Conditional nodes (if/then), dynamic node generation, concurrent execution.

## NORMATIVE LAYER — What we SHOULD build next

**Priority 1 — Ecosystem readiness** (v0.2.0):
- [ ] npm package: finalize exports, versions, CHANGELOG, semantic versioning
- [ ] Documentation: API docs (jsdoc), SKILL.md protocol spec, README with examples
- [ ] Real consumer project: a small app that uses roadmap.ts (e.g., a CLI tool)
- [ ] Integration tests: roadmap.ts on actual filesystem repos (fusion, cockpit examples)

**Priority 2 — Advanced operations** (v0.3.0):
- [ ] branch(g, from) — extract subgraph from node to term, create variant
- [ ] rebase(base, onto) — replay base operations after onto's term
- [ ] cherry-pick(g, nodeId) — extract single node with contract boundaries
- [ ] squash(g, nodes[]) — collapse linear chains, union produces/consumes
- Each operation: define(), verify(), check() validations

**Priority 3 — Governance layer** (v0.4.0):
- [ ] Session lifecycle: boot → execute → checkpoint → shutdown
- [ ] Audit trail: record which nodes completed, when, by whom, with what evidence
- [ ] Concurrent phases: multiple agents working on parallel roadmap branches
- [ ] Rollback: revert a completed node, cascade dependencies, re-execute

## OPERATIONAL LAYER — Immediate next steps

**Phase 3: Advanced DAG operations** (before v0.2.0):
1. Define branch(g, fromNode) — returns subgraph from fromNode to term
2. Adversarial spec: adv-branch.test.ts
3. Implementation + decision doc
4. Consumer test for branch/merge workflow

**Phase 4: Documentation + ecosystem** (before v0.2.0 release):
1. Finalize SKILL.md with merge/branch examples
2. Write README.md (what, why, how, examples)
3. Create real consumer example: `example/simple-project-roadmap.ts`
4. Add CHANGELOG, bump to v0.2.0, publish to npm

**Phase 5: Integration examples** (post-v0.2.0):
1. Integrate with fusion roadmap (consumer of roadmap/protocol)
2. Integrate with cockpit (governance layer using roadmaps)
3. Cross-repo roadmap coordination demo

**Metrics for "done"**:
- 100+ tests, 100% passing, tsc clean
- npm package: published, installable as `npm install roadmap`
- README with 3+ end-to-end examples
- 2+ real consumer projects using the library

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Scope creep (too many features) | Delays MVP release | Use "Operational" priorities; mark future work as "not in scope v0.2" |
| Merge edge cases (ID conflicts, cycles) | Silent failures | Comprehensive adv-merge tests (done), merge() throws on conflicts (done) |
| Consumer integration delay | Library seems theoretical | Start simple: 1-file consumer example before v0.2 |
| Performance (large DAGs) | orient() O(n log n) | Acceptable for typical roadmaps (100s of nodes). Optimize if >1000 nodes. |

## Next executor entry points

**If continuing phase 3**: branch(g, fromNode) spec + impl. Estimated 1–2 hours.

**If releasing v0.2.0 first**: Documentation polish + example + npm publish. Estimated 1–3 hours.

**If jumping to governance**: Skip branch, start phase 5 (session lifecycle + audit). Estimated 4+ hours.

Recommend: **Phase 3 (branch) + Phase 4 (docs) before v0.2.0 release** for clean handoff to consumers.
