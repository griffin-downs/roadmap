# Quickstart: 5-minute roadmap setup

## Step 1: Install

```bash
cd your-project
npm install ../roadmap  # or: pnpm add ../roadmap
```

## Step 2: Generate roadmap

```bash
npx roadmap generate-bootstrap \
  --project my-app \
  --desc "My TypeScript app" \
  --init src/index.ts,package.json,tsconfig.json \
  --term dist/index.js,dist/index.d.ts
```

Output:
- `roadmap.ts` — your DAG
- `boot.ts` — entry point
- `.roadmap/head.json` — metadata

## Step 3: Commit

```bash
git add roadmap.ts boot.ts .roadmap/
git commit -m "feat: roadmap — project phase tracking"
```

## Step 4: Check status

```bash
node boot.ts
# Position: build
# Produces: dist/index.js, dist/index.d.ts
# Consumes: src/index.ts, package.json, tsconfig.json
# Remaining: 1 nodes
```

## Step 5: Execute

Create a simple agent:

```typescript
import { orient } from 'roadmap/protocol';
import { loadDAG } from 'roadmap/versioning';
import { CheckpointManager, AuditTrail } from 'roadmap/recovery';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const checkpoint = new CheckpointManager(repoRoot);
const audit = new AuditTrail(repoRoot);

async function run() {
  // Load + validate
  const dag = await loadDAG(roadmap);

  // Start audit
  audit.startSession('quickstart-agent');

  // Try restore first
  let pos;
  const restore = await checkpoint.restore();
  if (restore) {
    console.log(`✓ Restored from ${restore.checkpoint.id}`);
    pos = restore.position;
  } else {
    // Fresh orientation
    const fsCheck = (a) => existsSync(join(repoRoot, a));
    const orientation = orient(dag, fsCheck);
    pos = orientation.position;
    console.log(`Current position: ${pos}`);
  }

  // Main loop
  while (pos !== dag.term) {
    const node = dag.nodes[pos];
    console.log(`\n📍 ${pos}: ${node.desc}`);
    console.log(`   Create: ${node.produces.join(', ')}`);

    // Execute node (depends on phase)
    if (pos === 'build') {
      console.log('   Running: tsc + test');
      execSync('npm run build', { stdio: 'inherit' });
    }

    // Validate
    console.log('   Validating...');
    let valid = true;
    for (const artifact of node.produces) {
      if (!existsSync(artifact)) {
        console.log(`   ✗ Missing: ${artifact}`);
        valid = false;
      }
    }

    if (!valid) {
      console.error('Validation failed');
      process.exit(1);
    }

    // Commit
    console.log('   Committing...');
    execSync(`git add -A && git commit -m "feat: ${pos}" || true`, {
      stdio: 'ignore',
    });

    // Checkpoint
    await checkpoint.saveCheckpoint({
      position: pos,
      phase: pos,
      artifacts: node.produces,
      agent: 'quickstart-agent',
      duration: 1000,
      success: true,
    });

    // Audit
    audit.record({
      nodeId: pos,
      status: 'complete',
      duration: 1000,
      artifacts: node.produces.map(p => ({ path: p, hash: 'sha256:abc' })),
    });

    // Advance
    const fsCheck = (a) => existsSync(join(repoRoot, a));
    const nextPos = orient(dag, fsCheck);
    pos = nextPos.position;
  }

  console.log('\n✓ Roadmap complete!');
  await audit.endSession();
}

run().catch(console.error);
```

Run it:
```bash
node agent.ts
```

## Step 6: Check audit

```bash
cat AUDIT.md
# Shows: agent, phases completed, timestamps, artifacts

ls -la .roadmap/checkpoints/
# All saved state for recovery
```

## idempotent field

Every node has `idempotent: boolean`. This is a contract with executor agents:

```typescript
// idempotent: true  — agent can re-run safely if interrupted
{ id: 'build', idempotent: true, ... }

// idempotent: false — one-time operation; agent must not auto-retry
{ id: 'db-migration', idempotent: false, ... }
{ id: 'auditor-sign-off', idempotent: false, ... }
```

**What agents do with `idempotent: false`:**
- Checkpoint immediately before execution (`checkpoint.saveCheckpoint(...)`)
- Treat failure as a human-in-the-loop gate — surface the error, do not retry
- Do not advance position until the operation is confirmed complete

`idempotent: false` does not mean rollback is impossible — it means the agent
cannot safely replay the operation to recover. Rollback is a separate concern
handled by checkpoint/restore.

## Entry points (v0.4.0+)

```typescript
import { define, check, verify, order, orient, merge, branch } from 'roadmap/protocol';
import { CheckpointManager, AuditTrail } from 'roadmap/recovery';
import { validateNode, validateGraph } from 'roadmap/validation';
import { loadDAG, migrateDAG } from 'roadmap/versioning';
import { getBrief, checkpoint, advance } from 'roadmap/agent';
// or: import everything from 'roadmap' (barrel)
```

## Next

- Read `README.md` for full API
- Check `docs/decisions/` for design decisions
- Multi-repo coordination? See `docs/multi-project-patterns.md`
- Real project adoption? See `docs/real-project-adoption.md`
