# Release Roadmap (v0.3.0 → v0.4.0)

## Current State (v0.3.0)
- **Phases 1–9**: Complete ✓
- **Phase 10**: Reordered (API optimization before regent executor)
- **Tests**: 161 passing
- **Status**: Ready for adoption validation before release

## What's Complete (Phases 1–10)

### Phase 1: Core + Adversarial Hardening
- ✓ Protocol functions (define, check, verify, order, orient, reconcile)
- ✓ Cycle detection, reachability, contract validation
- ✓ 83 tests covering edge cases

### Phase 2: DAG Merge Operations
- ✓ `merge(g1, g2, connections)` for multi-repo roadmaps
- ✓ Tested with real multi-phase scenarios

### Phase 3: Branch Operations
- ✓ `branch(g, from)` for variant DAGs and parallel development

### Phase 4–4.5: Documentation & Governance
- ✓ SKILL.md (protocol + expansion workflow)
- ✓ README.md (examples, API reference)
- ✓ SPEC.md (decision records, specs)
- ✓ Formalized adversarial spec system
- ✓ Node briefings (.briefing.json per node)
- ✓ Test organization guide

### Phase 5: Operational Hardening
- ✓ Git-state caching (O(1) orientation via .regent/git-state.json)
- ✓ Consumer bootstrap template generator
- ✓ Multi-repo patterns (sequential, merged, parallel)

### Phase 6: Governance Layer
- ✓ Checkpoint/restore mechanism
- ✓ Append-only audit trail
- ✓ Regent integration template

### Phase 7: Versioning
- ✓ DAG versioning system
- ✓ Auto-migration (0.1 → 0.3)
- ✓ Backward compatibility maintained

### Phase 8: Auto-Integration
- ✓ Project metadata schema
- ✓ Project-type detector
- ✓ Build process discoverer
- ✓ Dependency resolver
- ✓ Unified CLI: `roadmap integrate`

### Phase 9: Regent Executor + Real Project Adoption
- ✓ RoadmapExecutor class (getBrief, checkpoint, advance)
- ✓ Sealed APIs (agents can't forge progress)
- ✓ Real project integration tests (fusion, cockpit)
- ✓ Multi-project coordination patterns
- ✓ Error-as-teaching design

### Phase 10: API Optimization (Reordered)
- ✓ API audit (unused exports, tree-shaking)
- ✓ Sub-entry-points design
- ✓ API refactoring + tree-shaking tests
- ✓ Export surface optimized

---

## Phase 11: Adoption Audit & Release Readiness (NEXT)

**Purpose**: Validate market fit before v0.4.0 release

**10 Adoption Scenarios**:
1. **monorepo-services** — Multi-repo coordination + merge()
2. **microservice-deploy** — Deployment ordering + gates
3. **library-ecosystem** — Version management + parallel tracks
4. **ci-cd-pipeline** — Artifact contracts + stage ordering
5. **compliance-audit** — Checkpoint/restore + audit trail
6. **team-workflow** — Agent autonomy + position accuracy
7. **feature-rollout** — Gate conditions + metric validation
8. **db-migration** — Versioning + backward-compat gates
9. **perf-optimization** — Branch/merge + metrics-based gates
10. **legacy-refactor** — Parallel refactoring + contract preservation

**Survey Dimensions**:
- Adoption friction (time, docs, clarity)
- Value delivered (errors caught, time saved)
- Agent handoff (briefing clarity, position accuracy)
- Coordination (merge/branch, checkpoint success)
- Recommendation (production use, team adoption)

**Success Criteria**:
- ≥7/10 scenarios: "would use in production"
- ≥80%: "DAG caught a real error"
- ≥4/5 on briefing clarity
- Zero blocking friction points

**Decision**:
- **GO**: Bump to 0.4.0, publish, announce
- **NO-GO**: Design phase 12 to address top 3 friction points

**Roadmap Nodes**:
- adoption-scenario-setup → adoption-scenario-1–10 → survey-analysis → release-readiness-assessment → phase-11-term

**Execution Time**: ~6–8 hours

---

## Release Checklist (Post-Phase 11)

### If GO Decision:

**Version & Changelog**
- [ ] Update package.json version to 0.4.0
- [ ] Update CHANGELOG.md with phases 5–10 entries
- [ ] Add v0.4.0 section with adoption survey results link

**Documentation**
- [ ] Verify README.md examples still work
- [ ] Check all doc links (SKILL.md, SPEC.md, decision records)
- [ ] Link to ADOPTION-AUDIT.md in README
- [ ] Add "Real-world usage" section with scenario links

**Testing**
- [ ] npm test (all 161 tests pass)
- [ ] tsc --noEmit (zero type errors)
- [ ] Consumer smoke test (npm install, orient works)
- [ ] Self-validation: node roadmap.ts --validate

**API/Exports**
- [ ] npm run build && tree-shaking analysis
- [ ] Verify entry points: `./` and `./protocol`
- [ ] Test imports: `from 'roadmap'` and `from 'roadmap/protocol'`

**npm Publishing**
- [ ] Create git tag v0.4.0
- [ ] npm publish (verify on npm.org)
- [ ] Announce on relevant channels

### If NO-GO Decision:

**Phase 12 Design**
- [ ] Document top 3 friction points from survey
- [ ] Design phase 12 roadmap to address them
- [ ] Re-run adoption scenarios after fixes
- [ ] Decision: retry or pivot

---

## File Structure

```
roadmap/
├── .roadmap/
│   ├── head.json                    ← DAG definition (phases 1–11)
│   ├── adoption-scenarios.json      ← 10 scenarios + survey questions
│   ├── phase-11-design.md           ← Phase 11 specification
│   ├── add-phase-11.ts              ← Script to add phase 11
│   ├── reorder-phases.ts            ← Script to reorder phase 10
│   └── query.ts                     ← DAG query interface
│
├── docs/
│   ├── adoption-survey-results.md   ← Aggregate findings (Phase 11)
│   ├── adoption-audit.md            ← GO/NO-GO decision (Phase 11)
│   ├── api-audit.md                 ← API surface audit (Phase 10)
│   └── decisions/                   ← 6+ decision records
│
├── tests/
│   ├── adoption/                    ← 10 adoption scenario tests
│   │   ├── harness-template.ts
│   │   ├── results/                 ← {scenario}.json files
│   │   └── survey-form.json
│   ├── agent-executor.test.ts       ← Phase 9 executor tests
│   ├── consumer-adoption.test.ts    ← Real project integration
│   └── ...                          ← 19 other test files
│
├── src/
│   ├── protocol.ts                  ← Core functions (phases 1–3)
│   ├── index.agent.ts               ← Agent APIs (phase 9)
│   ├── index.recovery.ts            ← Sub-entry: API recovery (phase 10)
│   ├── index.validation.ts          ← Sub-entry: validation
│   ├── index.versioning.ts          ← Sub-entry: versioning (phase 7)
│   └── index.ts                     ← Main entry point
│
├── .claude/agents/
│   └── roadmap-executor-template.md ← Agent template (phase 9)
│
├── ADOPTION-AUDIT.md                ← Phase 11 guide (this file)
├── RELEASE-ROADMAP.md               ← Release checklist (this file)
└── roadmap.ts                       ← Self-validating DAG query
```

---

## Key Capabilities Summary

| Capability | Phase | Tests | Status |
|-----------|-------|-------|--------|
| Core protocol (define/check/verify/order/orient) | 1 | 37 | ✓ |
| Merge DAGs | 2 | 7 | ✓ |
| Branch DAGs | 3 | 5 | ✓ |
| Contract validation | 1 | 83 | ✓ |
| Cycle detection | 1 | 83 | ✓ |
| Git-state caching | 5 | 6 | ✓ |
| Checkpoint/restore | 6 | 5 | ✓ |
| Audit trail | 6 | 5 | ✓ |
| Versioning + migration | 7 | 5 | ✓ |
| Auto-integration | 8 | 1 | ✓ |
| Agent executor | 9 | 10 | ✓ |
| Real project adoption | 9 | 4 | ✓ |
| Tree-shaking ready | 10 | 1 | ✓ |

---

## Metrics

- **Code**: 3,600 LOC (protocol, hooks, examples, tests)
- **Tests**: 161 passing (23 test files)
- **Type safety**: 0 tsc errors
- **API exports**: 40+ clean, tree-shaken
- **Documentation**: README, SKILL.md, SPEC.md, 6+ decision records
- **Test coverage**: Adversarial specs for critical bugs

---

## Next Phase (Post-Release)

### Phase 12: Feedback & Iteration (if NO-GO)
- Address top 3 friction points from survey
- Re-test adoption scenarios
- Iterate until GO criteria met

### Or: Future Expansions (if GO)
- Multi-agent orchestrator layer
- Consumer ecosystem examples
- Performance benchmarks
- Advanced features (policy/compliance, CI/CD integration)

---

## How to Use This Document

1. **Before Phase 11**: Read adoption scenarios to understand what we're testing
2. **During Phase 11**: Use ADOPTION-AUDIT.md as execution guide
3. **After Phase 11**: This checklist becomes the release process
4. **If NO-GO**: Design phase 12 roadmap node by node using same protocol

---

## Related Documents

- `.roadmap/adoption-scenarios.json` — Scenario definitions
- `.roadmap/phase-11-design.md` — Phase 11 specification
- `ADOPTION-AUDIT.md` — Phase 11 execution guide
- `.roadmap/head.json` — Live DAG (all 11 phases)
- `roadmap.ts` — Query interface

---

**Status**: v0.3.0 complete. Phase 11 added to roadmap. Ready for adoption audit execution.

**Last updated**: 2026-02-25
