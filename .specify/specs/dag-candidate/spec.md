# dag-candidate spec

## Overview

Non-destructive staging for DAG mutations. Import and expand write to a candidate file; diff/accept/reject govern promotion to head.json.

## Requirements

### R1: Candidate writer

Import and expand write to `.roadmap/head.candidate.json` instead of `.roadmap/head.json`. The candidate envelope:

```typescript
interface CandidateEnvelope {
  schemaVersion: 1;
  baseSha: string;       // sha256 of head.json at candidate creation time
  source: 'import' | 'expand';
  sourceDetail: string;  // file path or script path
  createdAt: string;     // ISO timestamp
  dag: Graph<string>;    // the proposed DAG (same schema as head.json content)
}
```

If a candidate already exists, refuse with error (must accept/reject first).

### R2: Structural diff

`roadmap dag diff` compares head.json (base) to head.candidate.json (proposed). Output:

- `nodesAdded: string[]` — IDs present in candidate but not base
- `nodesRemoved: string[]` — IDs present in base but not candidate
- `nodesChanged: Array<{ id, fields: string[] }>` — nodes with differing deps/produces/consumes/validate/mode
- `batchShifts: Array<{ id, fromLevel, toLevel }>` — nodes that move batch levels
- `newConflicts: ConflictInfo[]` — batch conflicts in candidate not present in base
- `overlayInvalid: boolean` — true if plan-overlay.json exists and would be invalidated
- `stale: boolean` — true if baseSha !== current headSha

Exit 0 if candidate exists, exit 1 if no candidate. JSON output to stdout.

### R3: Accept (atomic promotion)

`roadmap dag accept --note "reason"`:

1. Load candidate, verify `baseSha` matches current headSha (fail if stale, unless `--force`)
2. Run `define()`, `verify()`, `check()` on candidate DAG (validation gate)
3. Write `candidate.dag` content to `head.json`
4. Delete `head.candidate.json`
5. If `plan-overlay.json` exists, delete it (invalidated by DAG change)
6. Write receipt: `.roadmap/receipts/dag-accept-<timestamp>.json`
7. `git add` all affected files, commit: `roadmap: dag accept — <note>`
8. Record trail entry

Receipt schema:
```json
{
  "schema_version": 1,
  "action": "accept",
  "source": "import",
  "baseSha": "<sha>",
  "newSha": "<sha of new head.json>",
  "nodesAdded": 5,
  "nodesRemoved": 0,
  "nodesChanged": 2,
  "timestamp": "<iso>",
  "note": "<reason>"
}
```

### R4: Reject (clean abort)

`roadmap dag reject --note "reason"`:

1. Delete `head.candidate.json`
2. Write receipt: `.roadmap/receipts/dag-reject-<timestamp>.json`
3. Record trail entry
4. No head.json change, no overlay invalidation

Receipt includes the rejected candidate's baseSha and source for audit trail.

### R5: Stale detection

Candidate carries `baseSha` = sha256(head.json) at creation time.

- **Fresh**: baseSha matches sha256(current head.json) — diff/accept proceed normally
- **Stale**: baseSha mismatch — another mutation happened since candidate was created
  - `dag diff` outputs `"stale": true` in response, still shows diff
  - `dag accept` refuses with error, suggests `--force` or re-import
  - `dag reject` always succeeds (stale candidates can always be cleaned up)

## Acceptance scenarios

### S1: Import writes candidate, not head

**Given** a repo with an existing head.json
**When** `roadmap import --from speckit tasks.md --id foo --note "test"`
**Then** `.roadmap/head.candidate.json` exists with source "import"
**And** `.roadmap/head.json` content is unchanged
**And** candidate.baseSha equals sha256 of original head.json

### S2: Diff shows structural changes

**Given** head.json with nodes [init, a, b, term]
**And** head.candidate.json with nodes [init, a, b, c, term]
**When** `roadmap dag diff`
**Then** output includes `nodesAdded: ["c"]`
**And** output includes batch level shifts if c changes topo order
**And** exit code 0

### S3: Accept atomically promotes

**Given** a fresh (non-stale) candidate
**When** `roadmap dag accept --note "reviewed"`
**Then** head.json content equals the candidate's dag
**And** head.candidate.json is deleted
**And** plan-overlay.json is deleted (if it existed)
**And** receipt written to `.roadmap/receipts/dag-accept-*.json`
**And** git commit created

### S4: Reject cleans up

**Given** a candidate exists
**When** `roadmap dag reject --note "wrong approach"`
**Then** head.candidate.json is deleted
**And** head.json is unchanged
**And** receipt written to `.roadmap/receipts/dag-reject-*.json`

### S5: Stale candidate detected

**Given** a candidate with baseSha X
**And** head.json has been modified (sha256 != X)
**When** `roadmap dag accept --note "promote"`
**Then** exit code 1 with error "candidate is stale"
**And** error includes current headSha and candidate baseSha
**And** fix suggests `--force` or re-import

### S6: Duplicate candidate blocked

**Given** head.candidate.json already exists
**When** `roadmap import --from speckit tasks.md --id bar --note "second"`
**Then** exit code 1 with error "candidate already exists"
**And** fix suggests `dag accept`, `dag reject`, or `--replace-candidate`

### S7: Expand writes candidate

**Given** a repo with head.json and an expansion script
**When** `roadmap expand expand-script.ts --note "add nodes"`
**Then** head.candidate.json exists with source "expand"
**And** head.json content is unchanged
**And** expansion script receives candidate path via env var `ROADMAP_CANDIDATE_PATH`

### S8: No-candidate diff fails gracefully

**Given** no head.candidate.json exists
**When** `roadmap dag diff`
**Then** exit code 1 with error "no candidate"
**And** fix suggests running import or expand first
