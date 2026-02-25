# Test Organization Guide

How to read and understand the test suite progressively without reading all 88 tests.

## Test suites by concern

### Layer 1: Core API (start here)
- **tests/protocol.test.ts** (37 tests)
  - What: Basic function behavior (define, check, verify, order, orient, reconcile)
  - Pattern: Fixture graphs + assertions on output
  - Size: Large, but organized by function (6 sections)
  - **Read when**: Understanding what each function does
  - **Skip when**: Implementing specific features; read only the function you're working on

### Layer 2: Adversarial specs (implementation guidance)
- **tests/adv-reconcile.test.ts** (8 tests, ~100 lines)
  - What: gap.missing semantics (unmet consumes only)
  - Pattern: Core contract + boundary tests (see SPEC.md)
  - Read: When implementing reconcile() or understanding the bug
- **tests/adv-orient.test.ts** (8 tests, ~200 lines)
  - What: empty-produces gates trivially done
  - Pattern: Same as adv-reconcile
  - Read: When implementing orient()
- **tests/adv-property.test.ts** (17 tests, ~300 lines)
  - What: Property-based: order/orient consistency, check/verify independence
  - Pattern: Parametric over multiple graphs + state variations
  - Read: When verifying consistency invariants
- **tests/adv-merge.test.ts** (7 tests, ~120 lines)
  - What: merge() correctness (check/verify on merged, partition holds)
  - Pattern: Merge two graphs, validate output
  - Read: When implementing merge()
- **tests/adv-branch.test.ts** (5 tests, ~100 lines)
  - What: branch() extraction (subgraph from node to term)
  - Pattern: Extract, validate
  - Read: When implementing branch()

### Layer 3: Integration & types
- **tests/consumer-integration.test.ts** (6 tests, ~80 lines)
  - What: Package works end-to-end (import, define, orient, check, verify)
  - Pattern: Real usage scenario
  - Read: After implementing new functions; verify consumer-facing API works
- **tests/adv-types.test-d.ts** (~100 lines)
  - What: Type-level invariants (compile-time validation)
  - Pattern: @ts-expect-error directives + valid usage
  - Validated by: tsc --noEmit
  - Read: When adding type constraints

## Reading strategy

**Scenario 1: Starting a new phase**
1. Read `.briefing/{node}.json` (2 minutes)
2. Read SPEC.md section on adversarial specs (if applicable)
3. Look at 1 similar adv-* test for pattern (if applicable)
4. Implement
5. Run `npm test` — your new adv-* tests fail (expected), you fix it, they pass

**Scenario 2: Understanding a bug**
1. Find the adv-* test that catches it
2. Read that test file (50–150 lines, ~5 min)
3. Read the fix in protocol.ts and decision doc

**Scenario 3: Understanding overall correctness**
1. Read adv-property.test.ts (shows consistency invariants)
2. Spot-check one adv-* test for pattern
3. Read consumer-integration.test.ts (shows it works end-to-end)

**Scenario 4: Modifying protocol.ts**
- Run `npm test` — see which tests fail
- Read only the failing test files
- Don't read all 88 tests

## File size discipline

Each test file has a target size:
- **protocol.test.ts**: 37 tests (baseline, core functions)
- **adv-*.test.ts**: 5–17 tests per file (~100–300 lines max)
- **consumer-integration.test.ts**: 6 tests (~80 lines)
- **adv-types.test-d.ts**: type checks only

**Rule**: New adv-* tests don't grow existing files unbounded. Each new feature gets its own adv-{feature}.test.ts file (1 file per bug/invariant).

## Briefing files (.briefing/)

Each node has `.briefing/{node}.json`:
```json
{
  "desc": "what to build",
  "pattern": "which pattern to follow",
  "key_files": ["which files matter"],
  "context_bytes": 300,
  "implementation_minutes": 15
}
```

Agent reads briefing (~200 bytes), then reads key files + relevant test file. Total context: <5KB.

**Example**: Implementing `adv-reconcile`:
- Read `.briefing/adv-reconcile.json` (2 min)
- Read `tests/adv-reconcile.test.ts` (5 min, ~100 lines)
- Read `src/protocol.ts:171-175` (1 min)
- Implement test (10 min)
- Total: 18 min, 300 bytes briefing + 100-line test + 5-line code snippet = <5KB context

## Progressive disclosure

Tests are organized so agents can:
1. Start with briefing (2 min, <1KB)
2. Read pattern from 1 adv-* test (5 min, 100–200 lines)
3. Implement (varies)
4. Spot-check with consumer-integration (2 min, ~10 lines relevant)

This avoids the "read all 88 tests" trap. Agent works on 1 concern at a time, reads ~300–500 lines per node, completes in 15–30 min.

## Metric

**For each phase**: tests should remain <500 lines total for adv-* (core spec) tests. If tests exceed that, split into separate concerns or consolidate fixture builders.

**For agents**: briefing + relevant adv-* file + key protocol.ts lines ≤ 5KB per node. Verify with:
```bash
(cat .briefing/node.json; head -100 tests/adv-node.test.ts; grep -A5 "BUG_LOCATION" src/protocol.ts) | wc -c
# Should be < 5000 bytes
```
