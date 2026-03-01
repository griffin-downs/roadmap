# EVIDENCE_CONTRACT

## Purpose

The Evidence Contract defines the structure and semantics of `EvidenceBundle` — a JSON record that proves work was done. It solves the hallucination problem: claims without evidence cannot be rendered.

## Problem Statement

Previous metaspec transcripts claimed 937 points of value with **zero evidence backing**:
- Claims: "refactored X, improved Y, added Z"
- Reality: stub-only changesets, no actual implementation
- Mechanism: no enforcement that claims must derive from observable repo state

The Evidence Contract mechanically prevents this by:
1. Recording what actually changed (git diffs)
2. Recording what was consulted (file reads)
3. Recording what was verified (test results)
4. Binding claims explicitly to evidence items
5. Refusing to render claims without backing

## Schema

### EvidenceBundle

```typescript
{
  schema_version: 1,
  timestamp: number,                    // ISO 8601 timestamp of evidence collection
  headSha: string,                      // git commit hash
  baseSha?: string,                     // optional: diff baseline commit

  gitDiffs: GitDiffItem[],              // what actually changed
  reads: FileReadProof[],               // what was consulted
  checks: CheckResult[],                // what was verified

  entries: EvidenceEntry[],             // claims and their backing evidence

  metadata?: {
    agent?: string,                     // name of agent/person producing this
    session?: string,                   // session/batch identifier
    intent?: string,                    // what was being attempted
  }
}
```

### GitDiffItem

Represents one file in a git diff:

```typescript
{
  file: string,                         // path relative to repo root
  status: 'added' | 'deleted' | 'modified' | 'renamed',
  additions: number,                    // lines added
  deletions: number,                    // lines deleted
}
```

### FileReadProof

Evidence that a file was consulted:

```typescript
{
  path: string,                         // file path relative to repo root
  timestamp: number,                    // ISO 8601 when it was read
  lineCount?: number,                   // optional: how many lines
}
```

### CheckResult

Evidence of verification (tests, lint, typecheck, etc):

```typescript
{
  type: 'test' | 'lint' | 'typecheck' | 'build' | 'custom',
  name: string,                         // specific test/check name
  passed: boolean,
  duration?: number,                    // execution time (ms)
  timestamp?: number,                   // when it ran
}
```

### EvidenceEntry

Maps a claim to the evidence that backs it:

```typescript
{
  claim: string,                        // the statement being made
  backingEvidence: {
    gitDiffs?: GitDiffItem[],           // files that changed for this claim
    reads?: FileReadProof[],            // files consulted
    checks?: CheckResult[],             // verification results
  }
}
```

## Key Invariants

1. **No empty bundles**: A bundle with zero diffs, zero reads, and zero checks is rejected
2. **No stub-only claims**: If gitDiffs shows only stubs (files with content but size < threshold), claims must cite reads/checks to justify the stub
3. **No uncovered claims**: Every entry in `entries` must have at least one backing evidence type (diffs OR reads OR checks)
4. **All checks must pass**: If checks are provided, all must pass=true, or the bundle is escalated for manual review
5. **Provenance**: headSha must match the current git HEAD when evidence is collected

## Example: Valid Evidence Bundle

```json
{
  "schema_version": 1,
  "timestamp": "2026-03-01T14:30:00Z",
  "headSha": "abc1234567890abcdef1234567890abcdef123456",

  "gitDiffs": [
    {
      "file": "src/lib/evidence/schema.ts",
      "status": "added",
      "additions": 85,
      "deletions": 0
    }
  ],

  "reads": [
    {
      "path": "docs/HANDOFF.md",
      "timestamp": "2026-03-01T14:29:00Z",
      "lineCount": 123
    }
  ],

  "checks": [
    {
      "type": "typecheck",
      "name": "tsc src/lib/evidence/schema.ts",
      "passed": true,
      "duration": 2000,
      "timestamp": "2026-03-01T14:30:00Z"
    }
  ],

  "entries": [
    {
      "claim": "Created evidence schema with GitDiffItem, FileReadProof, CheckResult types",
      "backingEvidence": {
        "gitDiffs": [
          { "file": "src/lib/evidence/schema.ts", "status": "added", "additions": 85, "deletions": 0 }
        ],
        "reads": [
          { "path": "docs/HANDOFF.md", "timestamp": "2026-03-01T14:29:00Z", "lineCount": 123 }
        ],
        "checks": [
          { "type": "typecheck", "name": "tsc src/lib/evidence/schema.ts", "passed": true, "duration": 2000 }
        ]
      }
    }
  ],

  "metadata": {
    "agent": "roadmap-executor",
    "session": "fr-meta-evid-001",
    "intent": "implement evidence-required governance kernel"
  }
}
```

## Detection Rules

### STUB_ONLY_CHANGESET

Rejects evidence where gitDiffs show files created but:
- File size < 50 bytes, OR
- File content is placeholder/example, OR
- No corresponding reads or checks

### INSUFFICIENT_READ_PROOFS

Rejects claims citing "reviewed X" when:
- reads array is empty, OR
- reads array doesn't include the claimed file

### NO_FAKE_PERF

Rejects claims citing performance improvements when:
- checks array is empty or all=false, OR
- no benchmark results in checks

## Integration Points

1. **Evidence Collector** (`evidence-collector` node): reads git diffs, file system, test results
2. **Claim Renderer** (`claim-renderer` node): applies detectors, refuses to emit claims without evidence
3. **Terminal Intent Binding** (`terminal-intent-evidence-binding` node): terminal intent gates require evidence
4. **Metaloop Wiring** (`metaloop-evidence-wiring` node): metaloop runner collects evidence for each iteration
5. **Kernel Invariant** (`roadmap-verify-invariant` node): kernel-level gate that all claims must have evidence

## Validation

Use `isValidEvidenceBundle(bundle)` to check structure compliance.

Use detector functions (`hasAnyChanges`, `hasAnyReads`, `hasAnyChecks`, `allChecksPass`) to check evidence adequacy.

Use `ClaimRenderer` (implemented in `claim-renderer` node) to apply domain-specific detectors (STUB_ONLY_CHANGESET, INSUFFICIENT_READ_PROOFS, NO_FAKE_PERF).

## Scope

This contract applies to:
- Metaspec/metaloop transcripts (blocking hallucination-style narration)
- Roadmap DAG execution summaries (evidence for claim-to-work binding)
- Agent work products (proof that work was done, not faked)

It does NOT apply to:
- Routine code commits (optional evidence)
- Code review (separate gate)
- Test suites (covered by CheckResult)
