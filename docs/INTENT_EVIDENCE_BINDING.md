# Intent-Evidence Binding

Terminal intent gates require evidence backing. This document describes how intent decisions are bound to evidence bundles.

## Overview

Terminal intent gates are the final decision points in the roadmap. They should not be reached without proof that work was done, changes were validated, and claims are substantiated.

**Intent-Evidence Binding** makes this mechanical: every terminal intent decision must cite an evidence bundle.

## Decision Model

Terminal intent decisions are one of three outcomes:

| Decision | Condition | Meaning |
|----------|-----------|---------|
| **approved** | Has evidence: diffs + (reads OR checks), checks all passed | Proceed to next phase |
| **escalated** | Has evidence but checks failed OR claims unsupported | Manual review required |
| **rejected** | No evidence OR stub-only changesets | Blocked, must provide evidence |

### Approved
- ✅ git diffs present (actual changes made)
- ✅ Either file reads (spec reviewed) OR test checks (verified)
- ✅ All checks passed (or none required)
- ✅ Claims backed by evidence

### Escalated
- ⚠️ Has evidence but failed checks — manual override needed
- ⚠️ Claims exist but lack evidence items to support them

### Rejected
- ❌ Empty evidence (no diffs, reads, or checks)
- ❌ Stub-only changeset (added files < 50 bytes with no reads/tests)

## IntentEvidenceBinding Type

```typescript
interface IntentEvidenceBinding {
  intentNodeId: string;                // terminal node ID
  timestamp: number;                   // when decision was made

  evidenceHeadSha: string;            // git commit of evidence
  evidenceBaseSha?: string;           // optional: diff baseline
  diffstatCount: number;              // how many files changed

  hasReads: boolean;                  // files were consulted
  hasChecks: boolean;                 // tests/checks were run
  checksAllPassed: boolean;           // all tests passed

  claimsSupported: string[];          // claims made with evidence

  decision: 'approved' | 'escalated' | 'rejected';
  reason?: string;                    // explanation of decision
}
```

## Usage

### At Terminal Intent Gate

```typescript
import { EvidenceContextualizer } from 'src/lib/intent/evidence-context';
import { collectEvidence } from 'src/lib/evidence/collect';

// Collect evidence of work done
const evidence = collectEvidence(repoRoot, beforeSha, afterSha, ['spec.md']);

// Contextualize the intent
const binding = EvidenceContextualizer.contextualizeIntent('my-intent-node', evidence);

if (binding.decision === 'approved') {
  // Proceed
  return { ok: true };
} else if (binding.decision === 'escalated') {
  // Require manual intervention
  return { ok: false, escalation: binding };
} else {
  // Rejected
  return { ok: false, reason: binding.reason };
}
```

### Validation

```typescript
// Verify binding is complete and valid
const result = EvidenceContextualizer.verify(binding);
if (!result.ok) {
  throw new Error(`Invalid binding: ${result.errors.join(', ')}`);
}
```

## Integration with Roadmap

Terminal nodes in `head.json` should include a `validate` rule that requires evidence:

```json
{
  "id": "my-terminal-node",
  "desc": "...",
  "produces": [...],
  "consumes": [...],
  "deps": [...],
  "validate": [
    { "type": "artifact-exists", "path": ".roadmap/intent-bindings/my-terminal-node.json" },
    { "type": "shell", "command": "jq '.decision == \"approved\"' .roadmap/intent-bindings/my-terminal-node.json" }
  ]
}
```

This ensures:
1. A binding file exists
2. The decision is approved (not rejected or escalated)

## Escalation Handling

If a binding is escalated (failed checks or unsupported claims):

```
binding.decision = 'escalated'
binding.reason = "Check failures: 2 of 3 failed"
```

The system should:
1. Halt progression to next phase
2. Create an escalation review task
3. Allow manual override or request evidence remediation

Example remediation:
- Fix the failing tests
- Add explicit evidence for claims (reads, checks, diffs)
- Re-create the binding and retry

## Examples

### Example 1: Approved Intent

```json
{
  "intentNodeId": "feature-complete",
  "timestamp": 1709300000000,
  "evidenceHeadSha": "abc1234567890",
  "diffstatCount": 12,
  "hasReads": true,
  "hasChecks": true,
  "checksAllPassed": true,
  "claimsSupported": [
    "Implemented feature X per spec",
    "Added test coverage for all paths",
    "Reviewed downstream impacts"
  ],
  "decision": "approved",
  "reason": "Evidence complete: 12 diffs, 3 reads, 15 checks all passed"
}
```

### Example 2: Escalated Intent

```json
{
  "intentNodeId": "refactor-complete",
  "timestamp": 1709300000000,
  "evidenceHeadSha": "def5678901234",
  "diffstatCount": 8,
  "hasReads": true,
  "hasChecks": true,
  "checksAllPassed": false,
  "claimsSupported": [
    "Refactored module X for clarity"
  ],
  "decision": "escalated",
  "reason": "Check failures: 2 of 8 tests failed"
}
```

### Example 3: Rejected Intent

```json
{
  "intentNodeId": "setup-tools",
  "timestamp": 1709300000000,
  "evidenceHeadSha": "ghi9012345678",
  "diffstatCount": 0,
  "hasReads": false,
  "hasChecks": false,
  "checksAllPassed": false,
  "claimsSupported": [],
  "decision": "rejected",
  "reason": "No evidence: empty changeset"
}
```

## Audit Trail

All intent-evidence bindings are written to `.roadmap/intent-bindings/<node-id>.json` for audit and recovery.

```
.roadmap/
├── intent-bindings/
│   ├── feature-complete.json
│   ├── refactor-complete.json
│   └── setup-tools.json
```

This enables:
- Traceability: why was each terminal decision made?
- Recovery: re-examine escalations
- Metrics: what fraction of terminal gates were approved vs escalated?

## Anti-Patterns

❌ **Terminal gate without binding**: decision made without evidence
❌ **Approved decision on failed checks**: ignoring test failures
❌ **Escalated but no review process**: allowing escalations to sit indefinitely
❌ **Manual override without binding update**: updating decision state without audit trail

## Best Practices

✅ **Write bindings before proceeding**: always create the JSON artifact
✅ **Audit escalations actively**: review failed checks and unsupported claims same session
✅ **Claim-to-evidence mapping**: every claim in `claimsSupported` is an entry in evidence.entries
✅ **Binding verification**: call `EvidenceContextualizer.verify()` before considering a decision final
