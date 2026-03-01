# Roadmap Expand Validation Issue

**Date**: 2026-03-02  
**Status**: Blocker for automatic DAG expansion  
**Severity**: Medium (workaround exists, manual scripts work)

## Problem

`roadmap expand` rejects valid expanded DAG structures with error:
```
Expansion produced invalid DAG: 1 errors
```

The error provides no detail about what validation rule failed.

## Evidence

- Expand script runs successfully (`node --experimental-strip-types expand-cli-quality-correct.ts` produces correct output)
- DAG structure appears valid: nodes added, dependencies set correctly, path to term unbroken
- Error message: "Expansion produced invalid DAG: 1 errors" (no details)
- Same issue across 3 different expand scripts

## Scripts That Fail Validation

1. `scripts/expand-cli-quality-correct.ts` - expands workflow-guide + help-improvements to 22 nodes
2. `scripts/expand-spec-kit-phase1.ts` - targets spec-kit nodes (don't exist in current DAG)
3. `scripts/expand-workflow-hints-enforcement.ts` - Phase 1 expansion

## Workaround

Expanded DAG structure is valid and could be manually applied. Use one of:
- Manual JSON edits to head.json (apply expand-cli-quality-correct.ts changes)
- Execute current 14-node DAG without expansion (fully functional)
- Investigate roadmap expand validation logic

## Next Steps

1. **Immediate**: Use current 14-node DAG (ready for dispatch)
2. **Later**: Debug roadmap expand validation - check:
   - Validation rule implementation in roadmap source
   - Check if orphaned nodes, unreachable code, or dep cycles are being detected incorrectly
   - Compare with known-working expand examples in codebase

## Context for Investigation

- DAG: metaflow-cli-quality (14 nodes, post-spec-kit-intake)
- Current nodes: init, json-default-flip, p9-002-latency-guard, p9-003-chart-envelope, instrument-context, claims-cache, usage-mine, discoverability-audit, workflow-guide, help-improvements, integration-test, dogfood-measure, synthesis, term
- Expand targets: workflow-guide (→ wg-design, wg-impl, wg-test, wg-mine), help-improvements (→ hi-design, hi-impl, hi-test, hi-mine)
- Expected: 22 nodes (14 + 8 new)
- Validation error: unspecified "1 errors"

## Related Commands

```bash
# Expand script that works in memory but fails validation:
roadmap plan select metaflow-cli-quality --note "..."
roadmap expand scripts/expand-cli-quality-correct.ts --note "..."

# To investigate validation:
# - Check src/lib/roadmap/validation.ts for expand() validation rules
# - Look for DAG check() constraints
# - Verify all expanded nodes are reachable from init
```
