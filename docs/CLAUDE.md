# Roadmap Claude Integration

## Using roadmap with Claude

### As a User

Work with roadmap through Claude:
```
/commit  # Use the commit skill to create roadmap commits
/review-pr  # Review PRs that update roadmap
```

Roadmap enforces:
1. Every state mutation recorded in `.roadmap/trail.jsonl`
2. Position is always found via `orient`, never inferred
3. Work is bounded by node specs in head.json

### As an Agent

Sealed API for agents:
```typescript
import { getBrief, advance, checkpoint, restore } from 'roadmap/agent';

const brief = await getBrief();
await advance('in-progress');
await checkpoint('attempt-1', artifacts);
```

Agents:
- ✅ Cannot introspect full DAG
- ✅ Can read decision docs
- ✅ Can write artifacts
- ✅ Report progress via handoffs

### As Regent

Coordinate agents:
```typescript
import { define, check, verify, orient, parallelOrder } from 'roadmap/protocol';

const g = loadDAG();
const order = parallelOrder(g);
// Spawn agents for each batch
```

## Integration with Claude Code

### Session Protocol

**Start:**
```bash
roadmap orient --note "session start — <intent>"
roadmap chart
```

**During work:**
```bash
roadmap orient --note "<what changed>"
roadmap chart  # reprint full status
```

**End:**
```bash
roadmap trail --archive
```

### Workflow

1. **Interrogate** — Ask what user wants (AskUserQuestion)
2. **Synthesize** — State back the intent + scope
3. **Enrich** — Add implied work + dependencies
4. **Plan** — Define DAG (EnterPlanMode)
5. **Execute** — Work through nodes (autonomously)
6. **Report** — Show progress (roadmap chart)

### Error Handling

Roadmap errors guide users:
```
Error: node "test" consumes "src/index.ts" but no predecessor produces it

Fix:
1. Check which node should produce src/index.ts
2. Add "src/index.ts" to that node's produces array
3. Run: roadmap validate --note "test"
```

## File Organization

- `.roadmap/head.json` — Active DAG (readonly by agents)
- `.roadmap/trail.jsonl` — Execution history (append-only)
- `.roadmap/checkpoints/` — Saved milestones
- `docs/decisions/` — Why decisions were made
- `.claude/agents/` — Sealed agent manifests

## Key Constraints

- 🔒 Agents cannot modify `.roadmap/head.json` directly
- 📍 Position always from `orient`, never inferred from memory
- 🔄 Every state mutation is recorded in trail
- ✅ Validation stack: tsc → define → verify → check → orient
- 🚫 No skipping hooks (--no-verify) or bypassing enforcement

## Best Practices

### 1. Always Run Session Protocol
Never infer position from memory or files. Always:
```bash
roadmap orient --note "session start — <intent>"
```

### 2. Reprint Chart Verbatim
Show user the full status:
```bash
roadmap chart
```

### 3. Orient After Each Phase
Track progress:
```bash
roadmap orient --note "<what changed>"
roadmap chart
```

### 4. Use Checkpoints for Recovery
After major work:
```bash
roadmap checkpoint --label "phase-complete"
```

### 5. Archive on Session End
```bash
roadmap trail --archive
```

## Multi-Repo Scenarios

For projects with dependencies:
```bash
roadmap chart --deps  # Show cross-repo progress
roadmap trail --repo <name>  # Filter by repo
```

## See Also

- `roadmap.ts` — Example consumer
- `example/` — Real-world adoption examples
- `docs/` — Decision history and patterns
- `.claude/agents/` — Agent templates and executor
