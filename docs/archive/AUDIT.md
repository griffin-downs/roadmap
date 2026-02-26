# Audit Trail Structure

The roadmap audit trail enables post-hoc analysis of execution.

## Format

`.roadmap/trail.jsonl` — newline-delimited JSON

```jsonl
{"ts":"2025-02-26T10:00:00Z","cmd":"orient","note":"session start","position":"bootstrap"}
{"ts":"2025-02-26T10:30:00Z","cmd":"orient","note":"compile done","position":"build","dagId":"myproject"}
{"ts":"2025-02-26T11:00:00Z","cmd":"checkpoint","label":"build-ok","position":"build"}
{"ts":"2025-02-26T11:30:00Z","cmd":"validate","passed":5,"failed":0}
```

## Entry Schema

```typescript
interface TrailEntry {
  ts: string;                    // ISO 8601 timestamp
  cmd: 'orient' | 'checkpoint' | 'validate' | 'trail' | ...;
  note?: string;                 // User-provided reason
  position?: string;             // DAG position (orient, checkpoint)
  dagId?: string;                // Project ID (cross-repo)
  label?: string;                // Checkpoint name
  passed?: number;               // Validation results
  failed?: number;
  detail?: Record<string, any>;  // Extra context
}
```

## Queries

```bash
# Recent activity
roadmap trail --last 20

# By repo
roadmap trail --repo fusion --last 50

# By phase
roadmap trail --repo cockpit | grep position | sort | uniq -c

# Performance
roadmap trail --last 100 | jq '.[] | {ts, cmd}' | analyze
```

## Analysis Examples

### Build Time Consistency

```bash
roadmap trail --repo myproject | \
  jq 'select(.cmd == "orient") | .ts' | \
  analyze-timestamps
```

### Failure Recovery Efficiency

```bash
roadmap trail --repo myproject | \
  jq 'select(.cmd == "checkpoint" or .cmd == "restore")' | \
  correlate-checkpoints
```

### Cross-Repo Coordination

```bash
roadmap trail --global | \
  jq 'group_by(.dagId) | map(analyze-synchronization)'
```

## Retention

- Local trail: indefinite (checked into git)
- Global trail: last 1000 entries (rotate old entries)
- Archive: `roadmap trail --archive` commits to git

## Security

- ✅ Append-only (immutable once written)
- ✅ No secrets (never include passwords, tokens)
- ✅ Timestamped (tamper-evident)
- ❌ Not encrypted (store in secure location if needed)

## See Also

- `bin/roadmap.ts` — trail command implementation
- `audit.ts` — trail recording
