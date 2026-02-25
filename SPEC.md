# SPEC.md — Adversarial Speccing System

**Adversarial specs** are tests that specify correct behavior by documenting known bugs. They guide implementation via **failing tests first, passing after fix**.

## When to write adversarial specs

1. **Bug discovered** during development (e.g., orient() stalls on empty produces)
2. **Contract violation** identified (e.g., reconcile() gap.missing includes surplus)
3. **Invariant broken** at integration (e.g., orient() partition doesn't hold)
4. **Edge case** not covered by core tests

## How to write

### Structure

**File**: `tests/adv-{feature}.test.ts`

**Pattern**:
```typescript
// ADV-{FEATURE} — what the spec catches
//
// Bug (protocol.ts:XXX): describe the current buggy behavior
// Fix: describe the correct behavior  
// Core contract tests FAIL on current impl, PASS after fix.
// Boundary tests PASS on both (regression guards).

import { describe, it, expect } from 'vitest';
import { ... } from '../src/protocol.ts';

describe('ADV-{FEATURE}: core contract', () => {
  it('test case 1: specific bug manifestation', () => {
    // Current behavior: wrong ❌
    // After fix: correct ✓
  });
  // More core contract tests...
});

describe('ADV-{FEATURE}: boundary (regression guard)', () => {
  it('test case: behavior unaffected by fix', () => {
    // PASS on both buggy and fixed impl
  });
});
```

### Example: adv-reconcile

```typescript
// ADV-RECONCILE — reconcile() gap.missing semantics
//
// Bug (protocol.ts:171-175):
//   missing = [...surplus produces, ...unmet consumes]  // WRONG
// Fix:
//   missing = unmet consumes only                       // CORRECT
// Semantics: missing[] is actionable work (new node must produce).
//            Surplus produces already available — not work items.
//
// Core contract tests: FAIL on current, PASS after fix
it('surplus forward produces do not appear in missing', () => {
  const g = probe(['x'], ['y']);
  const { gaps } = reconcile(g, ['fwd'], ['bwd']);
  expect(gaps[0].missing).not.toContain('x');  // ❌ FAILS NOW
  expect(gaps[0].missing).toContain('y');      // ✓ ALWAYS PASSES
});

// Boundary test: PASS on both
it('full overlap: connection recorded, no gap', () => {
  const g = probe(['x'], ['x']);
  const { connections } = reconcile(g, ['fwd'], ['bwd']);
  expect(connections.length).toBe(1);  // ✓ PASSES ALWAYS
});
```

## Implementation flow

1. **Write adversarial spec** (tests fail on current impl)
2. **Write decision doc** explaining the bug, fix, semantics
3. **Implement fix** in protocol.ts
4. **Verify**: all adv-{feature} tests pass
5. **Commit**: "fix: {feature}" includes decision doc + fix + test passing
6. **Next node depends on this one** (creates linear progression)

## Test organization

```
tests/
  protocol.test.ts          # baseline API tests
  adv-reconcile.test.ts     # gap.missing semantics (fixed)
  adv-orient.test.ts        # empty-produces stall (fixed)
  adv-property.test.ts      # order/orient consistency (property-based)
  adv-merge.test.ts         # merge() correctness
  adv-branch.test.ts        # branch() extraction
  adv-types.test-d.ts       # type invariants (tsc validates)
  consumer-integration.test.ts  # end-to-end package usage
```

Each `adv-*.test.ts`:
- Documents a specific contract or invariant
- Core contract tests catch the bug
- Boundary tests prevent regressions
- **File size**: 50–150 lines (not unbounded)

## Metrics

**For each spec**:
- ✓ Fails on current impl (at least 1 test)
- ✓ Passes after fix (all tests)
- ✓ No false positives (boundary tests pass both ways)
- ✓ Decision doc explains why this matters

**For the system**:
- ✓ One spec per discovered bug/invariant
- ✓ Spec-first → fix → implementation order
- ✓ Tests organized by concern, not by volume
- ✓ Agent can learn pattern from reading 1–2 suites

## Integration with roadmap

```
roadmap.ts node structure:
  adv-{feature}    (write spec, currently failing)
    ↓
  fix-{feature}    (implement fix, write decision doc)
    ↓
  consumer-test    (verify end-to-end)
    ↓
  term             (phase complete)
```

Each adv- node blocks fix- node. Fix node blocks forward progress. This creates **executable specs**: tests are the contract, they fail until satisfied.

## Not scope: property testing

Adversarial specs catch specific bugs. For properties (e.g., "for all valid graphs, orient() partition holds"), use property-based tests (adv-property.test.ts). See `adv-property` for the pattern.
