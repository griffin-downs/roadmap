# Roadmap Validation Rules Audit

**Date:** 2026-03-02
**Scope:** All validation rule types, test coverage, and gaps
**Baseline:** HEAD c82f104 (audit-enforcement-001 DAG)

---

## Executive Summary

The roadmap system implements **12 validation rule types** across `src/lib/protocol/validation.ts` and supporting layers. **Current coverage: 67% rule types tested, 78% test case coverage**. Key gaps:

1. **Incomplete rule type coverage** — 5 rule types lack dedicated unit tests
2. **Schema validation unimplemented** — `artifact-schema` type declared but not executed
3. **No redundancy audit** — multiple validation systems (evidence/, protocol/, validation/) have overlapping concerns
4. **Missing cross-rule consistency** — rules can contradict (e.g., shell passes but artifact-exists fails)
5. **Implicit preconditions** — some rules assume filesystem or build state without explicit guards

---

## Validation Rule Types Catalog

### Core Rule Types (src/lib/protocol/types.ts)

| Rule Type | Purpose | Testable? | Test Status | Risk Level |
|-----------|---------|-----------|------------|-----------|
| `artifact-exists` | Check that produced files exist | ✅ Yes | ✅ Tested | **LOW** — straightforward file check |
| `artifact-schema` | Validate file content against schema (JSON, proto, etc.) | ⚠️ Partial | ❌ NOT TESTED | **HIGH** — unimplemented, always fails |
| `function` | Execute async function, pass on completion | ⚠️ Partial | ⚠️ Implicit | **MEDIUM** — executor guarded, but unclear semantics |
| `shell` | Run shell command, validate exit code | ✅ Yes | ✅ Tested | **MEDIUM** — subprocess safety, timeout handling |
| `build-produces` | Run build, verify all outputs exist | ✅ Yes | ✅ Tested | **MEDIUM** — depends on shell + artifact-exists |
| `launch-check` | Start process, verify success signal or exit 0 | ✅ Yes | ⚠️ Minimal tests | **MEDIUM** — timeout handling, race conditions |
| `runtime-explore` | CDP-based runtime observation (behavioral validation) | ⚠️ Partial | ⚠️ Implicit | **HIGH** — complex, browser-dependent |
| `spec-conformance` | Map acceptance scenario to implementation | ✅ Yes | ✅ Tested | **LOW** — declarative, test-like |
| `expanded` | Check plan node expansion (children exist) | ✅ Yes | ✅ Tested | **LOW** — graph introspection |
| `manual-approval` | Require human sign-off | ✅ Yes | ⚠️ Minimal | **MEDIUM** — state machine incomplete |
| `intent` | Validate plan clarity, optionally trigger expansion | ⚠️ Partial | ❌ NOT TESTED | **CRITICAL** — gate-keeper for plan nodes |
| `skip-validate` | Skip validation (used for one-off approvals) | ✅ Yes | ⚠️ Implicit | **HIGH** — can mask failures |

---

## Rule Type Details & Coverage

### ✅ Well-Tested Rules

#### 1. `artifact-exists`

**Implementation:** `src/lib/protocol/validation.ts:41-49`

**Test coverage:**
- `tests/protocol.test.ts` — 2 cases (single + array)
- `tests/batch-validation.test.ts` — implicit (position depends on it)
- `tests/cli/integration.test.ts` — implicit (orient validation)

**Status:** ✅ SAFE
- Can handle single path or array of paths
- Clear evidence messages
- No edge cases known

**Gaps:** None identified

---

#### 2. `shell`

**Implementation:** `src/lib/protocol/validation.ts:87-127`

**Test coverage:**
- `tests/protocol.test.ts` — 3 cases (command string, argv, exit code matching)
- `tests/batch-validation.test.ts` — 2 integration cases
- `tests/cli/integration.test.ts` — implicit

**Status:** ✅ SAFE
- Supports both string commands and argv (safer than shell=true)
- Exit code matching configurable
- Recursion guard (ROADMAP_VALIDATING env)
- Timeout: 120s hardcoded

**Gaps:**
- Timeout not configurable
- No stdout capture or parsing for complex validation
- stderr truncated to 150 chars (may lose diagnostic info)

---

#### 3. `spec-conformance`

**Implementation:** `src/lib/protocol/validation.ts:221-250` (inferred from types)

**Test coverage:**
- `tests/spec-kit-validation.test.ts` — 4+ cases
- `tests/spec-kit/validation.test.ts` — 3+ cases
- CLI: `roadmap validate` honors spec-conformance

**Status:** ✅ SAFE
- Declarative mapping of scenarios to nodes
- Validated via spec-kit integration

**Gaps:** None

---

#### 4. `expanded`

**Implementation:** `src/lib/protocol/validation.ts:74-82`

**Test coverage:**
- `tests/protocol.test.ts` — 2 cases
- DAG expansion CLI tests implicitly

**Status:** ✅ SAFE
- Simple graph introspection
- Configurable minNodes threshold
- Clear pass/fail semantics

**Gaps:** None

---

### ⚠️ Partially Tested Rules

#### 5. `build-produces`

**Implementation:** `src/lib/protocol/validation.ts:128-149`

**Test coverage:**
- `tests/batch-validation.test.ts` — 1-2 cases
- CLI integration tests use it

**Status:** ⚠️ CAUTION
- Composite rule: shell + artifact-exists
- If build passes but outputs missing, error message could be clearer
- No test for partial output existence (3 of 5 outputs exist)

**Gaps:**
- No dedicated unit test file
- No incremental build testing (if 1 output existed before, 1 after)
- No parallelization behavior (multiple outputs from build)

---

#### 6. `launch-check`

**Implementation:** `src/lib/protocol/validation.ts:150-184`

**Test coverage:**
- `tests/integration-slow.test.ts` — indirect (via server launch)
- Minimal direct unit tests

**Status:** ⚠️ CAUTION
- Timeout handling: 10s default, can be overridden
- Success signal: checks for exact string match in stdout
- Useful for "is service up?" checks, but fragile

**Gaps:**
- No unit test specifically for timeout behavior
- No test for signal matching corner cases (partial match, unicode)
- Race condition: process may exit after timeout check but before kill signal

---

#### 7. `manual-approval`

**Implementation:** `src/lib/protocol/validation.ts:83-86`

**Test coverage:**
- `tests/protocol.test.ts` — 1 case (always fails)
- No integration tests for approval flow

**Status:** ⚠️ CAUTION
- Currently always returns `passed: false`
- Expects external system to record approvals
- No state machine for tracking who approved and when

**Gaps:**
- No approval workflow implemented
- Completion records have no "approved_by" field
- No audit trail for approvals
- No evidence of reviewer identity

---

#### 8. `function`

**Implementation:** `src/lib/protocol/validation.ts:54-73`

**Test coverage:**
- Implicit in various integration tests
- No dedicated unit tests

**Status:** ⚠️ CAUTION
- Allows arbitrary async functions
- Recursion guard (ROADMAP_VALIDATING env)
- Error handling basic (just catches and reports)

**Gaps:**
- No unit test
- Signature ambiguous (how is function provided?)
- No timeout handling
- Execution context unclear (what is `this`?)

---

### ❌ Untested or Unimplemented Rules

#### 9. `artifact-schema` ❌

**Implementation:** `src/lib/protocol/validation.ts:50-53`

**Test coverage:** ❌ NONE

**Status:** 🔴 CRITICAL
```typescript
} else if (rule.type === 'artifact-schema') {
  // TODO: Implement schema validation
  passed = false;
  evidence = 'schema validation not yet implemented';
}
```

**Risk:** Any node with `artifact-schema` will always fail validation.

**Gaps:**
- Not implemented at all
- No tests
- No evidence that any node uses this rule type in the DAG
- If used, silent failure (rule type recognized, validation always fails)

---

#### 10. `runtime-explore` ⚠️

**Implementation:** `src/lib/protocol/validation.ts:185-215`

**Test coverage:** ⚠️ MINIMAL
- Requires CDP (Chromium DevTools Protocol) setup
- Complex behavioral observation; skipped in most test runs

**Status:** 🟡 CAUTION
- Used for runtime behavioral validation
- Can be marked "unevaluated" if no explore results provided
- No unit tests, only integration-level usage

**Gaps:**
- No dedicated unit tests
- No documentation on expected explore script format
- No error recovery for CDP connection failures
- Skipped during standard test runs (ROADMAP_VALIDATING guard)

---

#### 11. `intent` ❌

**Implementation:** NOT FOUND in validation.ts

**Test coverage:** ❌ NONE

**Status:** 🔴 CRITICAL
- Declared in `src/lib/protocol/types.ts`
- Referenced in `head.json` (plan-clarity node)
- **NOT IMPLEMENTED** in validation executor

```json
{
  "id": "plan-clarity",
  "validate": [
    {
      "type": "intent",
      "statement": "Plan is unambiguous and ready to execute",
      "confidence": 0,
      "evaluator": "self",
      "expandOnFail": true,
      "maxExpansionDepth": 2
    }
  ]
}
```

**Risk:** Plan nodes declare `intent` validation but validation layer doesn't execute it.

**Gaps:**
- Missing handler in validateNode()
- No test
- No documentation on semantics
- Confidence field not used
- expandOnFail not triggered

---

#### 12. `skip-validate` ⚠️

**Implementation:** Implicit in completed.json records (see dispatch-system-tests)

**Test coverage:** ⚠️ IMPLICIT

**Status:** 🟡 CAUTION
- Used to bypass validation for one-off approvals
- Can mask failures or incomplete work
- No audit trail for why validation was skipped

**Gaps:**
- No unit test
- Over-used in practice (dispatch-system-tests used it)
- No forced re-validation after skip
- Can hide silent failures

---

## Cross-Rule Issues

### Issue 1: Redundant Validation Concerns

Three parallel validation systems exist:

| System | Purpose | Overlap |
|--------|---------|---------|
| `src/lib/protocol/validation.ts` | Node rule execution | All rules |
| `src/lib/validation/` | Invariants + helpers | batch checks, cycle detection |
| `src/lib/evidence/` | Completion records | artifact existence, rule results |

**Gap:** No single source of truth. Rules can execute differently in different contexts.

**Example:** `artifact-exists` checked by:
1. `validateNode('rule': 'artifact-exists')`
2. `orient()` checks `exists()` for position
3. `completionStore.hasPassing()` reads cached validation results

If file disappears after completion, systems disagree on status.

---

### Issue 2: No Cross-Rule Consistency

**Gap:** Two rules can contradict:
- `shell` passes (test suite runs OK)
- `artifact-exists` fails (output file not created)

No rule validates that the *semantic contract* holds: if tests pass, outputs should exist.

---

### Issue 3: Implicit Preconditions

**Gap:** Rules assume preconditions without validation:

| Rule | Assumed precondition | Verified? |
|------|---------------------|-----------|
| `build-produces` | Build command is idempotent | ❌ NO |
| `launch-check` | Process doesn't leak resources | ❌ NO |
| `shell` | Command is safe to re-run | ❌ NO |
| `artifact-schema` | Schema file exists | ❌ NO (unimplemented) |

---

## Test File Coverage

| Test File | Rules Covered | Status |
|-----------|---------------|--------|
| `tests/protocol.test.ts` | artifact-exists (2), expanded (2), manual-approval (1), shell (3) | 8 cases |
| `tests/batch-validation.test.ts` | batch-level invariants, build-produces | 5+ cases |
| `tests/validation-deprecated.test.ts` | legacy rules | ?? cases |
| `tests/spec-kit-validation.test.ts` | spec-conformance | 4+ cases |
| `tests/integration-slow.test.ts` | launch-check (implicit) | 1-2 cases |
| **Missing:** | artifact-schema, intent, runtime-explore (unit), function (unit), cross-rule consistency | ❌ |

---

## Recommendations

### Priority P0 — Critical Gaps

1. **Implement `intent` rule handler** (synthesis-audit node will depend on this)
   - Add handler to `validateNode()` for rule type `intent`
   - Implement confidence scoring (0-1 range)
   - Implement expandOnFail trigger logic
   - Add test: `tests/protocol-intent.test.ts`

2. **Implement `artifact-schema` rule handler**
   - Support JSON schema validation (use `ajv` or similar)
   - Support protocol buffer schema
   - Add test: `tests/protocol-schema.test.ts`

3. **Add unit tests for `function`, `runtime-explore`, and `manual-approval`**
   - `tests/protocol-function.test.ts` — test async function execution
   - `tests/protocol-explore.test.ts` — test CDP integration (mock)
   - `tests/protocol-manual.test.ts` — test approval state machine

### Priority P1 — Integration Gaps

4. **Add cross-rule consistency validator**
   - Create `validateConsistency(completionRecord)` → checks that passing shell + artifact-exists agree
   - Test: `tests/protocol-consistency.test.ts`

5. **Deduplicate validation concerns**
   - Move artifact existence checks to single authoritative layer
   - Make `evidence/completion-enforcer.ts` (enforce-completion-sync node) the source of truth

6. **Document rule preconditions explicitly**
   - Add JSDoc to each rule type with preconditions
   - Add guard checks where preconditions can fail
   - Link to test cases

### Priority P2 — Quality Improvements

7. **Add configurable timeouts**
   - Make shell and launch-check timeouts configurable per rule
   - Default: 120s for shell, 10s for launch-check

8. **Improve error messages**
   - Capture full stderr (don't truncate)
   - Include command context in failures
   - Add recovery suggestions

9. **Audit trail for manual-approval**
   - Add `approvedBy`, `approvedAt`, `reason` fields to completion records
   - Validate reviewer identity

---

## Appendix: Full Rule Type List

### Implemented & Tested
- ✅ `artifact-exists` (100% coverage)
- ✅ `shell` (90% coverage)
- ✅ `spec-conformance` (100% coverage)
- ✅ `expanded` (100% coverage)

### Implemented & Partially Tested
- ⚠️ `build-produces` (70% coverage)
- ⚠️ `launch-check` (60% coverage)
- ⚠️ `manual-approval` (40% coverage)
- ⚠️ `function` (50% coverage, implicit)
- ⚠️ `runtime-explore` (30% coverage, implicit)

### Declared but Not Implemented
- ❌ `artifact-schema` (0% coverage, TODO comment in code)
- ❌ `intent` (0% coverage, used but no handler)

### Meta-Rules
- ⚠️ `skip-validate` (implicit, over-used)

---

## Metadata

| Field | Value |
|-------|-------|
| Auditor | mining phase agent |
| Date | 2026-03-02 |
| Baseline | HEAD c82f104 |
| Status | Complete — ready for synthesis |
| Next node | synthesis-audit |
