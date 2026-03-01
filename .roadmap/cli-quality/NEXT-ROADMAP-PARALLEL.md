# Recommended Metaflows Roadmap (Post CLI-Quality Phase)
## With Spec-Kit Formalization & Maximum Parallel Execution

---

## Meta-Workflow: Spec-Kit Intake → DAG Expansion → Parallel Execution

### Execution Pipeline
```
opportunities.json (13 findings)
    ↓
[PHASE 0] Constitution → Spec-Kit CLI inputs
    ↓
[PHASE 0] Formalize specs (Given/When/Then scenarios)
    ↓
[PHASE 0] DAG expansion (roadmap expand) → ~50 nodes
    ↓
[PHASE 0] Compute parallelOrder + agent assignments
    ↓
[PHASE 1-3] Dispatch 3 agent teams in MAXIMUM PARALLEL
    ├─ Team A: metaflow-workflow-hints-enforcement (opp-003)
    ├─ Team B: metaflow-error-recovery-hints (opp-004)
    └─ Team C: metaflow-parallel-features-discoverability (opp-001)
    ↓
[MINING] Validate improvements between phases
    ↓
[PHASE 2-3] Re-assign teams to new metaflows (cascading parallel)
    └─ Mining, latency, scripting, cache, tests, cross-repo
    ↓
[TERMINAL] All gates pass, discoverability 49 → 65+/100
```

### Parallelization Strategy

**Goal**: Maximize throughput via:
1. **3 concurrent agent teams** (one per metaflow in phase)
2. **Batch-level parallelism** (2-3 nodes in parallel per team where independent)
3. **Minimal phase serialization** (Phase 2 starts when Phase 1 ≥80% complete)

**Expected benefit**: 40-50% faster delivery (5-6 weeks wall-clock vs 8+ weeks sequential)

---

## Phase 0: Spec-Kit Formalization (2-3 hours, Sequential Preparation)

### Step 1: Create Constitution (`.specify/pre-spec.md`)

```markdown
# CLI Quality Improvements - Constitution

## Problem Statement
Mining metaflow-cli-quality revealed critical gaps:
- **78.8% workflow abandon rate**: users run orient→re-orient without reading output
- **50% error non-recovery**: errors not immediately retried
- **0% parallel feature adoption**: --assign, --next, --ready never used
- **5.3× latency regression**: validate (749ms) vs orient baseline (141ms)
- **13 undiscovered flags**: advanced features invisible to users

## Domain Concepts
- **Workflow**: sequence of roadmap commands (orient→show→claim→complete)
- **Abandon**: command followed by re-execution without action (orient→orient)
- **Adoption**: users discover and use a feature (flag, workflow pattern)
- **Latency**: P50 command execution time (success path only)

## Success Criteria (Terminal Gate)
- Abandon rate: 78.8% → <60%
- Error recovery: 50% → 80%
- Parallel adoption: 0% → 20%+
- Validate latency: 749ms → <250ms
- Discoverability score: 49 → 65+/100
- Test success rate: 100%

## Acceptance Scenarios
[Per metaflow, Given/When/Then format below]
```

### Step 2: Formalize Scenarios (Gherkin format)

**Scenario 1: Workflow Hints Enforcement**
```gherkin
Feature: Orient suggests next steps to reduce abandon rate

Scenario: User reads Next Step hint and follows it
  Given orient command with position data
  When output rendered with Next Step block
  Then render exactly: "Next step: roadmap show <nodeId>"
    And render example: "Example: roadmap show json-default-flip"
  When user receives output
  And user runs suggested command within 5s
  Then instrument hint-following event

Scenario: Re-orient pattern detected
  Given user runs orient at T0
  And runs orient again at T0+2s
  When detect re-orient within 5s (no show/chart between)
  Then offer smart redirect: "Did you mean: roadmap show <current>?"
  And log pattern-detection event

Scenario: Mining validates improvement
  Given Phase 1 complete
  When run mining: 50+ workflow cycles
  And classify: orient→re-orient vs orient→show→work
  Then compute abandon rate = (re-orients / total-orients)
  And assert rate < 60% (down from 78.8% baseline)
```

**Scenario 2: Error Recovery Hints**
```gherkin
Feature: Error messages include recovery hints

Scenario: Claim fails with actionable hint
  Given claim init --owner test-agent
  When node not in current batch (state error)
  Then exit(1)
    And render: "claim failed: node 'init' not in batch"
    And render recovery: "Next: roadmap show init (to verify batch membership)"

Scenario: Error classification logged
  Given any command fails
  When error handler invoked
  Then classify error: permission | invalid-args | logic | system
    And capture exit code, stderr, stderrLines context
    And log (error-class, command, recovery-hint)

Scenario: Mining validates retry improvement
  Given Phase 1 complete
  When run mining: 50 error scenarios across claim/orient/validate
  And log retry attempts within 2 cycles
  Then compute retry-rate = (retried / total-errors)
  And assert rate >= 80% (up from 50% baseline)
```

**Scenario 3: Parallel Features Discoverability**
```gherkin
Feature: --assign, --next, --ready discoverable and working

Scenario: Help includes swarm dispatch example
  Given roadmap help
  When user reads help text
  Then help includes example:
    "Parallel dispatch: roadmap orient --assign --note 'batch-3'"
    "Pre-load: roadmap orient --next"
    "Worker: roadmap orient --ready"

Scenario: Swarm dispatch works
  Given 3 agents, DAG with 3 independent nodes
  When agent-a: roadmap claim node-1 --owner agent-a
    And agent-b: roadmap claim node-2 --owner agent-b
    And agent-c: roadmap claim node-3 --owner agent-c
  Then all nodes claimed simultaneously (no conflicts)
    And preGate available via orient --next
    And ready state tracked via --ready flag

Scenario: Mining validates adoption
  Given Phase 1 complete
  When run mining: 3+ agent swarms with --assign
  And measure --assign usage frequency
  Then adoption-rate >= 20% (up from 0% baseline)
```

### Step 3: Run `roadmap expand` for each metaflow

For **Phase 1** (3 metaflows, ~18 nodes total):

```bash
# Create expansion scripts (Phase 1)
cat > scripts/expand-workflow-hints.ts << 'EOF'
export const expand = (parent: string) => ({
  parent,
  id: "workflow-hints-enforcement",
  children: [
    "design-hints-rendering",
    "implement-orient-next-step",
    "detect-reorient-pattern",
    "instrument-abtest",
    "integration-tests-hints",
    "mining-validation-abandon"
  ]
});
EOF

cat > scripts/expand-error-recovery.ts << 'EOF'
export const expand = (parent: string) => ({
  parent,
  id: "error-recovery-hints",
  children: [
    "design-error-classifier",
    "implement-claim-hints",
    "implement-orient-hints",
    "implement-validate-hints",
    "instrumentation-error-paths",
    "test-error-recovery",
    "mining-error-scenarios"
  ]
});
EOF

cat > scripts/expand-parallel-discoverability.ts << 'EOF'
export const expand = (parent: string) => ({
  parent,
  id: "parallel-discoverability",
  children: [
    "update-help-assign-next-ready",
    "add-pregate-context",
    "test-swarm-dispatch",
    "mining-swarm-adoption"
  ]
});
EOF

# Run expansions
roadmap expand scripts/expand-workflow-hints.ts --note "expand workflow-hints-enforcement → 6 nodes"
roadmap expand scripts/expand-error-recovery.ts --note "expand error-recovery-hints → 7 nodes"
roadmap expand scripts/expand-parallel-discoverability.ts --note "expand parallel-discoverability → 4 nodes"

# Propagate constraints
roadmap propagate --dry-run
roadmap propagate
```

### Step 4: Build Agent Assignment Matrix

```json
{
  "phase": 1,
  "wall_clock_weeks": "1-2",
  "concurrent_teams": 3,
  "total_nodes": 18,
  "batches_per_team": 3,
  "teams": {
    "team-hints": {
      "metaflow": "workflow-hints-enforcement",
      "owner": "hints-team",
      "nodes": ["design-hints-rendering", "implement-orient-next-step", "detect-reorient-pattern", "instrument-abtest", "integration-tests-hints", "mining-validation-abandon"],
      "batch_1": ["design-hints-rendering"],
      "batch_2": ["implement-orient-next-step", "detect-reorient-pattern"],
      "batch_3": ["instrument-abtest", "integration-tests-hints", "mining-validation-abandon"]
    },
    "team-errors": {
      "metaflow": "error-recovery-hints",
      "owner": "error-team",
      "nodes": ["design-error-classifier", "implement-claim-hints", "implement-orient-hints", "implement-validate-hints", "instrumentation-error-paths", "test-error-recovery", "mining-error-scenarios"],
      "batch_1": ["design-error-classifier"],
      "batch_2": ["implement-claim-hints", "implement-orient-hints", "implement-validate-hints"],
      "batch_3": ["instrumentation-error-paths", "test-error-recovery", "mining-error-scenarios"]
    },
    "team-parallel": {
      "metaflow": "parallel-discoverability",
      "owner": "parallel-team",
      "nodes": ["update-help-assign-next-ready", "add-pregate-context", "test-swarm-dispatch", "mining-swarm-adoption"],
      "batch_1": ["update-help-assign-next-ready"],
      "batch_2": ["add-pregate-context"],
      "batch_3": ["test-swarm-dispatch", "mining-swarm-adoption"]
    }
  },
  "sync_points": {
    "after_batch_1": "All teams complete design/planning (day 1-2)",
    "after_batch_2": "All teams complete implementation (day 3-5)",
    "after_batch_3": "All teams complete testing + mining (day 6-8)",
    "gate": "All mining results validate improvements within target (day 8)"
  }
}
```

---

## Phase 1: High-Impact Quick Wins (PARALLEL, 3 Teams, 1-2 weeks wall-clock)

### Execution Timeline (Gantt-style)
```
TIME ────────────────────────────────────────────────────→
Week:  1          │          2
Day:   1 2 3 4 5 6│7 8 9 10 11 12

Team A (Hints):
  ████ design
       ████ implement
            ████ test
                 ████ mining

Team B (Errors):
  ████ design
       ████ implement
            ████ test
                 ████ mining

Team C (Parallel):
  ████ design
       ████ implement
            ████ test
                 ████ mining
           ↓                ↓
       SYNC (impl)      SYNC (gate)
```

### Team A: **metaflow-workflow-hints-enforcement** (opp-003)
**Nodes**: design-hints, implement-orient, detect-reorient, instrument, tests, mining
**Owner**: hints-team
**Dependencies**: None

**Batch 1 (Days 1-2)**: `design-hints-rendering`
- Design hint rendering strategy: placement (render block), format (text + example), visibility
- Acceptance: design doc + prototype showing hint placement

**Batch 2 (Days 3-5)**: `implement-orient-next-step`, `detect-reorient-pattern`
- Implement "Next Step" block in orient output
- Implement pattern detection (re-orient within 5s → suggest show)
- Acceptance: `roadmap orient` shows "Next: roadmap show <nodeId>"

**Batch 3 (Days 6-8)**: `instrument-abtest`, `integration-tests-hints`, `mining-validation-abandon`
- Instrument hint-following (A/B: verbose vs minimal)
- Integration tests: 80%+ of workflows follow hint
- Mining: abandon rate < 60% (validate with 50+ cycles)
- Acceptance: mining-run shows abandon-rate < 60%

---

### Team B: **metaflow-error-recovery-hints** (opp-004)
**Nodes**: design-classifier, implement-claim/orient/validate, instrumentation, tests, mining
**Owner**: error-team
**Dependencies**: None

**Batch 1**: `design-error-classifier`
- Design error classification: permission | invalid-args | logic | system
- Map claim/orient/validate/complete errors to categories
- Acceptance: error-classification.md with examples

**Batch 2**: `implement-claim-hints`, `implement-orient-hints`, `implement-validate-hints`
- Add recovery hints to claim error (e.g., "Try: roadmap show <node>")
- Add recovery hints to orient error (e.g., "Use --note to record reason")
- Add recovery hints to validate/complete errors
- Acceptance: error messages include recovery suggestions

**Batch 3**: `instrumentation-error-paths`, `test-error-recovery`, `mining-error-scenarios`
- Instrument error paths to log classification + retry attempts
- Test: 50 error scenarios, verify recovery hints
- Mining: error retry rate 50% → 80%
- Acceptance: mining shows retry-rate >= 80%

---

### Team C: **metaflow-parallel-features-discoverability** (opp-001)
**Nodes**: update-help, add-pregate, test-swarm, mining-swarm
**Owner**: parallel-team
**Dependencies**: None

**Batch 1**: `update-help-assign-next-ready`
- Add help examples for `--assign`, `--next`, `--ready`
- Document swarm worker protocol
- Acceptance: `roadmap help` shows 2+ swarm examples

**Batch 2**: `add-pregate-context`
- Add pre-gate hint to orient output when `--next` nodes available
- Acceptance: `roadmap orient` shows pre-gate nodes

**Batch 3**: `test-swarm-dispatch`, `mining-swarm-adoption`
- Test: 3-agent swarm with `--assign`, all nodes claimed
- Mining: measure `--assign` adoption in 20+ swarm runs
- Acceptance: adoption rate >= 20%

---

### Phase 1 Success Gate
```
✓ Team A: abandon-rate < 60%
✓ Team B: error-retry-rate >= 80%
✓ Team C: --assign adoption >= 20%
✓ All: integration tests pass
✓ All: mining data validates improvements
```

**Wall-clock time**: 1-2 weeks (3 teams in parallel, sync after batch 2 and batch 3)

---

## Phase 2: Feature Expansion & Evidence (Parallel, 3 Teams Re-assigned, 2-3 weeks wall-clock)

**Start condition**: Phase 1 ≥80% complete (batches 1-2 done)

### Team A (re-assigned) → **metaflow-mining-with-outcomes** (opp-009)
**Nodes**: design-classifier, extend-mining, pattern-analyzer, success-ranker, report

**Acceptance**: 100+ real sequences classified, top 3 winning + 3 failure patterns identified

---

### Team B (re-assigned) → **metaflow-validate-latency-optimization** (opp-007)
**Nodes**: profile, cache-layer, add-fast-flag, parallelize, latency-tests

**Acceptance**: validate P50 < 250ms (down from 749ms), --fast flag available

---

### Team C (re-assigned) → **metaflow-flag-aliases-and-output-control** (opp-002)
**Nodes**: verify-aliases, add-examples, ci-test, scripting-mining

**Acceptance**: -j, -q aliases verified, 2+ scripting examples in help, adoption >= 30%

---

## Phase 3: Polish & Validation (Parallel, 2-3 weeks wall-clock)

Teams 3x rotate through remaining metaflows (cache, tests, cross-repo):
- **metaflow-cache-performance-validation**
- **metaflow-integration-test-expansion**
- **metaflow-cross-repo-visibility**

---

## Total Timeline

| Phase | Wall-Clock | Nodes | Teams | Key Gate |
|-------|-----------|-------|-------|----------|
| Phase 0 (Prep) | 2-3h | — | 1 | Specs + DAGs ready |
| Phase 1 | 1-2 weeks | 18 | 3 parallel | abandon<60%, errors→80%, --assign→20% |
| Phase 2 | 2-3 weeks | 15 | 3 re-assigned | patterns found, latency<250ms, scripts→30% |
| Phase 3 | 2-3 weeks | 12 | 3 re-assigned | cache validated, tests→65+, score→65+ |
| **Total** | **5-6 weeks** | **~50** | **3 concurrent** | All gates pass |

**Comparison:**
- Sequential execution: 8+ weeks
- Maximum parallel: 5-6 weeks
- **Benefit: 40-50% faster delivery**

---

## Success Metrics (Terminal Gate)

All phases must achieve:

| Metric | Phase 1 | Phase 2 | Phase 3 | Final |
|--------|---------|---------|---------|-------|
| Abandon rate | <60% | Sustain | Sustain | <60% ✅ |
| Error retry | ≥80% | Sustain | Sustain | ≥80% ✅ |
| Parallel adopt | ≥20% | ≥40% | ≥60% | ≥60% ✅ |
| Validate latency | — | <250ms | Sustain | <250ms ✅ |
| Discoverability | +10pts | +5pts | +10pts | 65+ ✅ |
| Test pass | 100% | 100% | 100% | 100% ✅ |

---

## Recommendation

**Proceed with Phase 0 immediately:**

1. ✅ Formalize 13 opportunities as spec-kit constitution
2. ✅ Create Given/When/Then scenarios (Gherkin) for Phase 1 metaflows
3. ✅ Run `roadmap expand` to decompose into 18 Phase-1 nodes + downstream phases
4. ✅ Build agent assignment matrix (3 teams, 3 batches per phase)
5. ✅ **Dispatch Phase 1 teams simultaneously** (parallel execution)
6. ✅ **Set sync points** (end of batch 2, end of batch 3/mining)
7. ✅ **Chain Phase 2 start** when Phase 1 ≥80% complete

**Expected delivery: 5-6 weeks wall-clock (vs 8+ weeks sequential) = 40-50% faster**

**Next steps:**
- [ ] Create `.specify/pre-spec.md` from next-opportunities.json
- [ ] Write Gherkin scenarios for 9 metaflows
- [ ] Run roadmap expand for all phases
- [ ] Build agent assignment matrix
- [ ] Dispatch Phase 1 teams (TeamCreate + Agent tool with swarm)
- [ ] Monitor sync points and Phase 2 trigger condition
