# roadmap-agent: Template for autonomous roadmap executor

## What this agent does

1. **Boot**: Check for latest checkpoint, restore or orient fresh
2. **Loop**: Find current node, create artifacts, commit, record audit
3. **Recover**: If crashed, checkpoint enables resume from last position
4. **Evidence**: Audit trail shows what happened and why

## Integration flow

```typescript
// 1. Initialize
const audit = await createAuditTrail(repoRoot);
audit.startSession(agentName, checkpoint?.id);

// 2. Try restore first
let restoreResult = await checkpointMgr.restore();
let position;

if (restoreResult) {
  console.log(`✓ Restored from ${restoreResult.checkpoint.id}`);
  position = restoreResult.position;
} else {
  console.log(`Orienting fresh...`);
  const orientation = orient(dag, exists);
  position = orientation.position;
}

// 3. Main loop
while (position !== dag.term) {
  const node = dag.nodes[position];
  const nodeStart = Date.now();

  // Create artifacts
  for (const artifact of node.produces) {
    await createArtifact(artifact);
  }

  // Validate
  const validation = await validateNode(node);
  if (!validation.passed) {
    throw new Error(`Validation failed: ${node.id}`);
  }

  // Commit
  await git.commit(`feat: ${node.id}\n\nProduces: ${node.produces.join(', ')}`);

  // Checkpoint
  const checkpoint = await checkpointMgr.saveCheckpoint({
    position,
    phase: node.id,
    artifacts: node.produces,
    agent: agentName,
    duration: Date.now() - nodeStart,
    success: true,
  });

  // Audit
  audit.record({
    nodeId: position,
    status: 'complete',
    duration: Date.now() - nodeStart,
    artifacts: node.produces.map(p => ({ path: p, hash: await hashFile(p) })),
    validation,
  });

  // Advance
  const nextOrientation = orient(dag, exists);
  position = nextOrientation.position;
}

// 4. End session
await audit.endSession();
```

## Error handling

### Idempotent node fails validation
```
✗ Phase failed validation: src/protocol.ts doesn't exist
  → Node is idempotent, re-run?
  → YES: delete produces, re-create (recover)
  → NO: manual intervention
```

### Non-idempotent node fails
```
✗ Phase failed validation: PR not approved
  → Node is NOT idempotent (manual-approval)
  → Can't auto-recover, requires human decision
  → Checkpoint saved; operator reviews + approves
  → Resume from checkpoint
```

### Agent crashes
```
On next boot:
  → readLatestCheckpoint() → finds cp-{id}
  → Validates artifacts still exist
  → resume from that position
  → Audit shows "Restored from cp-{id}"
```

## Capabilities

This agent needs:
- `fs`: read/write artifacts
- `git`: commit + push
- `protocol`: define/verify/check/orient/reconcile/merge
- `checkpoint`: save/restore state
- `audit`: log execution

## Bootstrap

When spawned by regent:
1. Read this template
2. Accept roadmap path
3. Initialize audit + checkpoint manager
4. Call boot loop above

## Monitoring

During execution:
- **AUDIT.md**: append-only evidence trail
- **.roadmap/audit/{session}.json**: machine-readable records
- **.roadmap/checkpoints/{cp-id}.json**: saved state for recovery
- **git log**: commits per phase

After completion:
- Check AUDIT.md for timeline + evidence
- Query audit records for failed phases
- Verify all hashes in checkpoints

## Next: regent-integration test

See tests/regent-integration.test.ts for integration test patterns.
