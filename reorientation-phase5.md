# reorientation-phase5.md — Phases 5+ gap analysis (Conceptual / Normative / Operational)

**Context**: Phases 1–4.5 delivered protocol core (6 functions), 4 advanced operations (merge/branch), governance documentation (SPEC.md, .briefing/, test-organization.md), and v0.2.0 ecosystem readiness. All 88 tests passing. Current position: `term` (all dependencies satisfied, deployable).

**Next decision**: Phase 5+ strategy. Three options with different scopes:
1. **Operational hardening** — git state caching, consumer automation (enables agents to self-orient efficiently)
2. **Governance layer** — session lifecycle, checkpoint/restore, audit trails (enables regent integration)
3. **Advanced protocol ops** — rebase, cherry-pick, squash (enables complex roadmap compositions)

This reorientation analyzes each layer to choose the coherent next phase.

---

## CONCEPTUAL LAYER — What phase 5+ SHOULD achieve

**Current capability**:
- ✓ DAG specification, validation, cycle detection
- ✓ Position finding (orient) from filesystem artifacts
- ✓ Gap analysis (reconcile) — what new nodes must be created
- ✓ Advanced composition (merge, branch) — combine/extract DAGs
- ✓ Type-safe API, formalized spec system

**Capability gap**: Agents can define roadmaps, but scaling to autonomous multi-agent execution requires:

| Gap | Current | Required | Blocker for |
|-----|---------|----------|-------------|
| **Orientation efficiency** | O(N) git + filesystem ops per session | O(1) pre-computed git-state.json read | Agent boot time scales with repo size |
| **Consumer onboarding** | Manual: write roadmap.ts + boot logic | Automated: consumer template + generated bootstrap | Growing consumer repos drift from conventions |
| **Session persistence** | Orient once per session, position lost | Checkpoint/restore session state | Debugging, audit trails, long-running agents |
| **Concurrent phases** | Single linear roadmap sequence | Parallel branches + merge back | Multi-agent coordination requires fork/join |
| **Conflict resolution** | Merge throws on ID conflicts | Merge with ID remapping | Cross-repo coordination at scale |

**Not blocking v0.2.0 but blocking v0.3+ and regent integration**: efficient orientation + consumer automation.

---

## NORMATIVE LAYER — What we SHOULD build next

### Phase 5: Operational hardening (recommended entry point)

**Deliverables**:
1. **Git state cache** — pre-computed `.regent/git-state.json` with phase annotation
   - Written by: post-commit hook + session-start hook
   - Read by: orient() in one operation (no git status/diff/log cascade)
   - Enables: agent reorientation in <100ms vs current ~500ms
   - Artifact: src/git-state.schema.ts, hooks/post-commit.ts, orient-caching.test.ts

2. **Consumer bootstrap template** — `example/consumer-bootstrap.ts`
   - Generated from roadmap.ts definitions
   - Includes: minimal roadmap.ts scaffold, boot.ts harness, orientation loop
   - Enables: new consumers copy-paste + customize, not read SKILL.md
   - Artifact: src/generate-bootstrap.ts, example/consumer-bootstrap.ts, bootstrap-gen.test.ts

3. **Multi-repo coordination pattern** — example + guide
   - Show: two repos with separate roadmaps, merge() at shared contract point
   - Spec how to: publish sub-roadmaps to npm, consume via import + merge
   - Artifact: docs/multi-repo-coordination.md, example/multi-repo/, integration.test.ts

**Rationale**: These are force multipliers. Once agents can:
- Reorient efficiently (git-state cache)
- Spawn from template (consumer bootstrap)
- Coordinate across repos (multi-repo pattern)

Then phase 6+ (session lifecycle, regent hooks) becomes straightforward.

**Estimated effort**: 3–5 hours (git-state cache is ~50 lines, bootstrap is template code, multi-repo is doc + example).

### Phase 6: Governance layer (post-phase-5)

**Deliverables**:
1. **Checkpoint protocol** — save/restore orient() position + session context
   - Structure: .boot/checkpoint-{timestamp}.json with node ID, remaining nodes, artifacts metadata
   - Functions: checkpoint(g, pos) → checkpoint.json, restore(checkpoint) → (g, pos)
   - Enables: resume across sessions, audit trails, agent preemption
   - Artifact: src/checkpoint.ts, checkpoint.test.ts

2. **Audit trail** — immutable record of node completions
   - Structure: .boot/audit.jsonl (append-only log)
   - Fields: timestamp, nodeId, executor, evidence (git commit hash), consumes/produces snapshots
   - Enables: "who did what when", rollback analysis, compliance
   - Artifact: src/audit.ts, audit.test.ts, AUDIT.md (protocol spec)

3. **Regent integration** — roadmap-aware agent hooks
   - How to: read roadmap.ts, call orient() on boot, write position to audit trail
   - Pattern: agent imports roadmap type + calls orient(g, fsCheck) to find next work
   - Enables: regent agents self-discover work without coordinator
   - Artifact: .claude/agents/roadmap-agent-template.md, integration-regent.test.ts

**Rationale**: Governance layer is where roadmaps become the coordination backbone. Agents check roadmap position, not task queues. Sessions are auditable, resumable.

**Estimated effort**: 2–3 hours (checkpoint is 30 lines, audit is 20 lines, regent template is doc + test).

### Phase 7: Advanced protocol operations (optional, if needed)

Only if multi-repo scenarios require dynamic graph transformations:

| Operation | Use case | Complexity | Priority |
|-----------|----------|-----------|----------|
| `rebase(base, onto)` | Replay base ops after onto's term | High | Phase 7+ |
| `cherry-pick(g, nodeId)` | Extract single node for shared library | Medium | Phase 7+ |
| `squash(g, nodes[])` | Collapse linear chains | Low | Phase 7+ |
| `merge(a, b, joinEdges)` with ID remapping | Cross-repo without conflicts | High | Phase 6 blocker |

Currently merge() throws on conflicts. Phase 6 should add optional ID remapping (e.g., merge(a, b, {remap: {[aId]: newId}})). This is a small extension.

---

## OPERATIONAL LAYER — Immediate next steps

### Phase 5 roadmap nodes (add to roadmap.ts after term)

```
Phase 5: Operational hardening (v0.2.1 patch + groundwork for 0.3)
├─ git-state-spec          Spec: git-state.json schema + hook integration
├─ git-state-impl          Implement: post-commit hook, session-start hook, git-state.json write
├─ git-state-orient        Extend orient() to read cache + validate freshness
├─ git-state-test          Adversarial: test cache invalidation, stale detection
├─ bootstrap-gen-spec      Spec: consumer bootstrap template generation logic
├─ bootstrap-gen-impl      Generate from roadmap.ts → example/consumer-bootstrap.ts
├─ bootstrap-test          Test: generated bootstrap runs orient() correctly
├─ multi-repo-pattern      Doc + example: merge(fusion_roadmap, cockpit_roadmap, ...)
├─ phase-5-term            All operational improvements integrated + tested
└─ then phase-6: checkpoint/audit/regent integration
```

**Entry point for this session**:
1. Write git-state.schema.ts (TypeScript interface + validation)
2. Implement post-commit hook (write .regent/git-state.json)
3. Add orient-caching tests (verify cache behavior)
4. Update roadmap.ts to include phase 5 nodes
5. Run `define() + check() + verify()` to validate expanded roadmap

**Decision**: Proceed with phase 5 entry, or jump to governance (phase 6)?

---

## Evidence of completion (phases 1–4.5)

| Artifact | Deliverable | Status |
|----------|-------------|--------|
| src/protocol.ts | 6 functions: define, check, verify, reconcile, order, orient | ✓ |
| src/merge.ts | merge(g1, g2, connections) | ✓ |
| src/branch.ts | branch(g, from) | ✓ |
| tests/ | 88 tests across 7 files | ✓ 88/88 passing |
| docs/decisions/ | reconcile-gap, orient-empty-produces, merge-design, branch-design | ✓ 4/4 written |
| SPEC.md | System formalization: types, contracts, properties | ✓ |
| .briefing/ | Node briefings: adv-reconcile, fix-reconcile, merge-spec | ✓ 3/3 written |
| docs/test-organization.md | Test suite navigation guide | ✓ |
| README.md | What/why/how/examples for consumers | ✓ |
| SKILL.md | Protocol expansion workflow + merge/branch examples | ✓ |
| package.json | Exports, scripts, version 0.1.0 | ✓ |

**Metrics**: 88 tests, 0 type errors, tsc clean (when tsc available), npm run seed passes, roadmap validates.

---

## Risks and mitigations (phase 5)

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Git hook failures | Git state cache becomes stale/broken | Comprehensive hook tests, fallback to live git if cache invalid |
| Bootstrap bloat | Generated code becomes hard to customize | Keep template minimal; bootstrap is 50 lines max |
| Multi-repo cycle | Merged graph creates unexpected cycle | Adversarial tests: merge(a, b, ...) must pass define() + check() |
| Agent boot latency regress | Cache invalidation too frequent | Profile: cache hit rate target >95% in common workflows |

---

## Recommended session plan

**If proceeding with phase 5**:
1. Create phase 5 roadmap nodes in roadmap.ts (git-state-spec through phase-5-term)
2. Validate expanded roadmap: `define() + check() + verify()`
3. Start git-state-spec node: write schema, document hook integration
4. Stop at phase boundary (phase-5-term dependency satisfied)

**If proceeding with phase 6 directly**:
1. Skip phase 5, create phase 6 roadmap nodes (checkpoint-spec through phase-6-term)
2. Write checkpoint.ts + audit.ts implementations
3. Create regent-agent-template.md
4. Test with example: agent boots, reads roadmap, calls orient(), writes to audit trail

**Recommendation**: Start phase 5 (operational) for stability + ecosystem velocity. Phase 6 (governance) is valuable but requires phase 5 foundations. Sequential execution better than parallel.
