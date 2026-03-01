# Recommended Metaflows Roadmap (Post CLI-Quality Phase)

## Executive Summary
13 improvement opportunities identified through mining metaflow-cli-quality implementation. Three phases recommended, prioritized by **impact/effort ratio**. Top 4 opportunities can reduce workflow abandonment from 78.8% → <50% and unlock advanced features currently at 0% adoption.

---

## Priority Matrix

```
IMPACT
  ▲
  │  ★ opp-003          ★ opp-009
  │  (high/med)         (high/large)
  │
  │  ★ opp-001,004     ★ opp-007
  │  (high/med)        (med/med)
  │
  │                    ★ opp-002,006,011
  └─────────────────────────────────► EFFORT
   LOW                                HIGH
```

---

## Phase 1: High-Impact Quick Wins (Recommended: Start Immediately)

**Duration**: 1 week | **Value**: Reduce abandon rate 78.8% → ~60%

### 1. **metaflow-workflow-hints-enforcement** (opp-003)
**Severity**: ⚠️ CRITICAL  
**Impact/Effort**: ⭐⭐⭐⭐⭐ (Very High / Medium)

**Problem**: 78.8% of users run `orient` then immediately `re-orient` without reading output. Hints were added but are not effective.

**Solution**:
1. Add explicit "Next Step" block to orient output (2-3 lines)
   ```
   Next step: roadmap show <nodeId>
     Example: roadmap show json-default-flip
   ```
2. Instrument orient to track if users follow hint (A/B test: verbose vs minimal)
3. Detect re-orient pattern and offer smart redirect: "Did you mean: roadmap show <current>?"

**Acceptance Criteria**:
- Implement "Next Step" block in orient output
- Reduce re-orient rate from 78.8% to <60% (validate via mining)
- Test: 2+ real users follow hint in 80%+ of workflows

**Dependencies**: None (build on top of existing hints)

**Estimated Scope**: 5-8 nodes
- Design hint rendering strategy
- Add "Next Step" block to orient output
- Implement pattern detection (re-orient → suggest show)
- Instrument and measure effectiveness
- Integration tests
- Documentation

---

### 2. **metaflow-error-recovery-hints** (opp-004)
**Severity**: 🔴 HIGH  
**Impact/Effort**: ⭐⭐⭐⭐⭐ (Medium / Medium)

**Problem**: 50% of errors are not retried. Error messages lack recovery hints. Mining showed `claim` and `orient` failures with no guidance.

**Solution**:
1. Enhance error messages with recovery hints
   - `claim init --owner X` fails → suggest "Try: roadmap show init" to check batch
   - `orient` without `--note` → suggest "Use --note to record reason"
2. Add `--help-on-error` flag to repeat relevant help for failing command
3. Classify errors: permission | invalid-args | logic | system

**Acceptance Criteria**:
- Implement error classification for claim, orient, complete, validate
- Test: 80%+ of first errors retried within 2 cycles (up from 50%)
- Error messages include recovery suggestions for top 5 error cases

**Estimated Scope**: 4-6 nodes
- Classify error types and root causes
- Add recovery hints to error handlers (claim, orient, validate, complete)
- Instrument error paths to log which errors are retried
- Tests for error message clarity
- Mining: run 50 error scenarios and measure retry rate

---

### 3. **metaflow-parallel-features-discoverability** (opp-001)
**Severity**: 🔴 HIGH  
**Impact/Effort**: ⭐⭐⭐⭐ (High / Medium)

**Problem**: `--assign`, `--next`, `--ready` (critical for swarm dispatch) have 0% usage. Blocks parallelization.

**Solution**:
1. Add mandatory help examples showing --assign batch allocation
   ```
   Example: roadmap orient --assign --note "allocate batch 3"
   # Output: agentA claims node-1, agentB claims node-2
   ```
2. Add "Pre-gate workable" hint to orient when `--next` nodes are available
3. Document swarm worker protocol in help (--ready, --next sequence)

**Acceptance Criteria**:
- Add 2+ examples to help showing --assign, --next, --ready
- Test: grep help output includes all three flags prominently
- Mining: verify 20%+ adoption of --assign in test swarms

**Estimated Scope**: 3-4 nodes
- Update help text with swarm examples
- Add pre-gate context to orient output
- Document worker protocol in help
- Test help examples are executable
- Mining: test with simulated swarm (3+ agents)

---

## Phase 2: Feature Expansion (Weeks 2-3)

**Value**: Unlock advanced features, improve latency, enable evidence-driven decisions

### 4. **metaflow-mining-with-outcomes** (opp-009)
**Severity**: 🔴 HIGH  
**Impact/Effort**: ⭐⭐⭐ (High / Large)

**Problem**: Trail shows command sequences but lacks outcome labels (success vs abandoned). Can't identify winning patterns.

**Solution**:
1. Extend mining to capture 100+ sequences with outcome labels:
   - Completed: orient → show → work → complete ✓
   - Abandoned: orient → orient → orient (no completion) ✗
   - Error recovery: orient → error → orient → ... → complete ✓
2. Analyze: which flag combinations appear in successful sequences?
3. Output: pattern-success-rate.json with (pattern, successRate, avgCycles)

**Acceptance Criteria**:
- Mine 100+ real command sequences from cross-repo trail
- Classify: 80%+ sequences labeled success/abandoned
- Identify top 3 successful patterns (orient→show→complete, etc.)
- Top 3 failure patterns (orient→orient→..., error→error→...)

**Estimated Scope**: 5-6 nodes
- Design sequence classification scheme
- Extend mining to track sequence outcomes
- Implement pattern analyzer
- Rank patterns by success rate
- Generate pattern-success-rate.json
- Documentation and findings

---

### 5. **metaflow-validate-latency-optimization** (opp-007)
**Severity**: 🟡 MEDIUM  
**Impact/Effort**: ⭐⭐⭐⭐ (Medium / Medium)

**Problem**: Validate latency 749ms (5.3× slower than orient at 141ms). Blocks pre-commit workflows.

**Solution**:
1. Profile validate command: identify slowest validator (artifact-exists vs shell vs function)
2. Add caching: cache validator results for 30s if DAG unchanged
3. Add `--fast` flag: skip shell validators (lint/test), only check artifact-exists
4. Parallelize: run independent shell checks in parallel

**Acceptance Criteria**:
- Profile validate, identify slowest path (expected: shell validators)
- Reduce validate P50 from 749ms to <250ms
- Add --fast flag with documentation
- Test: validate without shell validators <200ms

**Estimated Scope**: 4-5 nodes
- Instrument and profile validate command
- Implement caching layer
- Add --fast flag
- Parallelize independent validators
- Tests: latency benchmarks
- Documentation

---

### 6. **metaflow-flag-aliases-and-output-control** (opp-002)
**Severity**: 🔴 HIGH  
**Impact/Effort**: ⭐⭐⭐⭐ (Medium / Small)

**Problem**: `--json` and `--quiet` (for scripting/CI) have 0% usage. Aliases (-j, -q) exist but are undiscovered.

**Solution**:
1. Verify aliases are implemented and advertised (likely already done in cli-quality)
2. Add examples to help: "Use -j for scripting" with shell loop example
3. Add -q example: "Suppress output with -q for CI integration"
4. Test: scripting scenarios (shell loop calling orient -j)

**Acceptance Criteria**:
- Verify aliases work: `roadmap orient -j`, `roadmap orient -q`
- Add 2+ examples to help showing scripting use cases
- Test: CI scenario (sh loop 5× orient -j | jq...)
- Mining: verify 30%+ adoption in scripting scenarios

**Estimated Scope**: 2-3 nodes
- Verify aliases work and are documented
- Add help examples for scripting
- Create test for CI integration scenario
- Mining: test with shell script runner

---

## Phase 3: Polish & Validation (Weeks 4+)

**Value**: Deepen understanding, validate cache, expand coverage

### 7. **metaflow-cache-performance-validation** (opp-011)
**Severity**: 🟡 MEDIUM  
**Impact/Effort**: ⭐⭐⭐ (Medium / Small)

Add metrics to claims-cache: hit rate, miss rate, file scan counts. Verify 396→1 claim.

---

### 8. **metaflow-integration-test-expansion** (opp-012)
**Severity**: 🟡 MEDIUM  
**Impact/Effort**: ⭐⭐⭐ (Medium / Medium)

Expand tests from 49 → 65+. Cover error paths, edge cases, state consistency.

---

### 9. **metaflow-cross-repo-visibility** (opp-006)
**Severity**: 🟡 MEDIUM  
**Impact/Effort**: ⭐⭐⭐ (Medium / Medium)

Document `--repo`, `--global`, `--deps`, `--depth` with examples. Enable cross-project debugging.

---

## Estimated Timeline & Resources

| Phase | Duration | Nodes | Focus | Effort |
|-------|----------|-------|-------|--------|
| **Phase 1** (Immediate) | 1-2 weeks | 3 metaflows | Abandon rate, errors, parallelization | 15-20 nodes |
| **Phase 2** (Expansion) | 2-3 weeks | 3 metaflows | Mining, latency, scripting | 14-18 nodes |
| **Phase 3** (Polish) | 2-3 weeks | 3+ metaflows | Validation, tests, visibility | 10-15 nodes |
| **Total** | 5-8 weeks | 9+ metaflows | Full hardening | 40-50 nodes |

---

## Expected Outcomes

### Phase 1 Targets
- ✅ Reduce workflow abandon rate: 78.8% → <60% (via better hints + error recovery)
- ✅ Enable swarm dispatch: --assign, --next, --ready adoption 0% → 20%+
- ✅ Improve error recovery: 50% → 80% (errors retried on first attempt)

### Phase 2 Targets
- ✅ Evidence-driven UX: identify top 3 successful workflows, 3 failure patterns
- ✅ Validate latency: 749ms → <250ms (5.3× → 1.8× vs orient)
- ✅ Scripting adoption: --json, --quiet usage 0% → 30%+

### Phase 3 Targets
- ✅ Cache validated: measure 95%+ hit rate, confirm 396→1 scans
- ✅ Test coverage: 49 → 65+ tests, error paths covered
- ✅ Discoverability score: 49/100 → 65+/100 (via Phase 1-2 improvements)

---

## Recommendation

**Start with Phase 1 immediately.** The three opportunities (workflow hints, error recovery, parallel features) address the critical finding: **78.8% workflow abandon rate**. These are:
- High impact (fix root cause of biggest pain point)
- Medium effort (3-4 weeks for full implementation)
- Measurable (mining will show improvement)

Phase 2 validates improvements and unlocks advanced features. Phase 3 deepens the foundation for future optimizations.

**Combined effect**: Transform CLI from 49/100 discoverability (barely above target) to 65+/100 (solid), with 80%+ of advanced features discoverable and adopted.

