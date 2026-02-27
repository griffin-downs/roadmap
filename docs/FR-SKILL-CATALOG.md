# FR: Skill catalog — agent-minimal and user-display skill layers

## Problem

FR-INSTALL-SKILLS shipped 8 skills covering the core protocol loop (start → work → done → dispatch). These are the load-bearing skills — they replaced CLAUDE.md prose with executable sequences.

Two gaps remain:

**Agent gap**: Agents need more than the execute loop. Expansion, claiming, validation pre-checks, error diagnosis, trail management — these are currently raw CLI calls that agents assemble by reading CLAUDE.md prose (or don't, and get it wrong). Every raw CLI call is a compliance risk. The shipped skills proved that wrapping CLI sequences in skills eliminates that risk.

**User gap**: Roadmap's output is JSON and ASCII tables. Agents dutifully reprint it. The user sees walls of monospace text where they should see progress bars, dependency diagrams, session timelines, and cost breakdowns. `/roadmap-gallery` and `/roadmap-progress` (from FR-INSTALL-SKILLS) started this — emoji-rich display + AskUserQuestion steering. But those are two skills in a space that needs a dozen.

The two layers have different design constraints:

| | Agent skills | User skills |
|---|---|---|
| Consumer | LLM agent | Human in terminal |
| Design goal | Correctness — eliminate protocol violations | Comprehension — convey state at a glance |
| Output format | Structured (JSON, file paths, node IDs) | Visual (emoji, progress bars, ASCII diagrams, color) |
| Interaction | None — execute and return | AskUserQuestion — interactive steering |
| Complexity | Minimal — one concern per skill | Rich — aggregate multiple data sources |
| Failure mode | Agent skips a step | User misreads state, makes wrong decision |

## Proposal: Agent skills (minimal layer)

These skills wrap CLI sequences that agents currently assemble by hand. Each skill handles one concern. No display logic, no emoji — structured output only.

### `/roadmap-expand`

Triggered by intent-driven expansion (FR-INTENT-EXPANSION) or manual expansion.

```markdown
## Arguments
- `node` (required): Node to expand
- `reason` (required): Why expansion is needed (becomes orient note + commit message)

## Steps
1. Run: orient --check → verify node is in current batch
2. Run: show <node> → get failing intents (if expanding from intent failure)
3. Generate expansion script from failing intents (or accept user-provided script path)
4. Run: expand <script> --note "$reason"
5. Run: propagate → back-derive constraints on new nodes
6. Run: orient --check → confirm DAG reopened at new nodes
7. Return: new node IDs, their produces, their batch level

## Contract
- Always propagate after expand. No exceptions.
- Expansion script is deterministic — same failures → same fix nodes.
- If expanding from intent failure: fix nodes inherit parent's deterministic gates.
```

### `/roadmap-claim`

For swarm workers. Wraps the claim + show + orient sequence.

```markdown
## Arguments
- `node` (required): Node ID to claim
- `owner` (optional): Agent name (defaults to $AGENT_ID)
- `ttl` (optional): Seconds (default: 300)

## Steps
1. Run: claim <node> --owner $owner --ttl $ttl
2. Run: show <node> → return full node spec
3. Run: orient --check → confirm position

## Contract
- Claims are advisory locks — expired claims are ignored.
- Claim before work, release on done (/roadmap-done releases implicitly via complete).
- If claim fails (already claimed by another): return current claim owner + expiry. Do not retry.
```

### `/roadmap-validate`

Pre-check before committing to `/roadmap-done`. Runs validators without completing the node.

```markdown
## Arguments
- `node` (required): Node ID to validate
- `evaluate` (optional): JSON array of intent judgments

## Steps
1. Run: validate <node> [--evaluate '$evaluate'] --note "pre-check"
2. Parse ValidationResult
3. Return structured result:
   - deterministic: { rule, passed, evidence }[]
   - intent: { statement, status, confidence, threshold }[]
   - allPassed: boolean
   - expandable: boolean (any failing intent has expandOnFail?)

## Contract
- This is read-only. Does not modify DAG state, does not complete, does not commit.
- Use before /roadmap-done to catch failures early (avoids commit-then-reject cycle).
- Intent gates without --evaluate return as unevaluated (non-blocking).
```

### `/roadmap-escalate`

When work is blocked — can't fix a failing validator, missing dependency, unclear spec. Structured escalation instead of freeform "I'm stuck."

```markdown
## Arguments
- `node` (required): Node being worked on
- `reason` (required): What's blocking
- `type` (required): one of: validation-failure, missing-dependency, spec-ambiguity, scope-exceeded

## Steps
1. Run: show <node> → get node context
2. Run: orient --check → get current position
3. Compose structured escalation:
   { node, type, reason, currentConfidence (if intent), attemptCount, produces, evidence }
4. If in swarm: SendMessage to orchestrator with escalation payload
5. If single agent: present to user via AskUserQuestion:
   - "Provide hint and retry"
   - "Skip this node (retire)"
   - "Override validation (--skip-validate)"
   - "Pause — I'll look at this"

## Contract
- Escalation is a structured exit, not a retry mechanism.
- Never escalate without evidence (failing rule, confidence numbers, what was attempted).
- In swarm: orchestrator decides. In single agent: user decides.
```

### `/roadmap-trail`

Session trail management. Agents use this for context recovery and session boundaries.

```markdown
## Arguments
- `action` (required): one of: archive, read, status
- `scope` (optional): local | global (default: local)
- `last` (optional): number of recent entries to read

## Steps
- archive: Run trail --archive → commit local trail, return entry count
- read: Run trail [--global] [--last N] → return trail entries
- status: Run trail --last 1 → return most recent breadcrumb (for context recovery on session resume)

## Contract
- Always archive at session end. /roadmap-progress handles this via "Pause" option.
- Trail is the audit record. Every state mutation has a breadcrumb.
```

### `/roadmap-checkpoint`

Save/restore points for risky operations.

```markdown
## Arguments
- `action` (required): save | list | restore
- `label` (optional): checkpoint label (required for save)

## Steps
- save: Run checkpoint --label "$label" --note "$reason" → return checkpoint ID
- list: Run checkpoint --list → return checkpoint table
- restore: Run checkpoint --restore → rollback to latest valid checkpoint

## Contract
- Checkpoint before expansion (expansion can produce invalid DAGs).
- Checkpoint before risky architectural changes.
- Restore is destructive — confirms with user before executing.
```

### `/roadmap-explore-write`

Context injection for writing explore scripts. Presents the observation pattern library, interaction helpers, script template, and ExploreResult contract. The agent calls this once before writing an explore script — it loads the vocabulary into context.

This is not a generator. It does not produce a script. It presents the patterns so the agent can compose from them.

```markdown
# /roadmap-explore-write

Load the explore script pattern library. Call this before writing a runtime-explore script.

## Arguments
- `spec-statements` (optional): Intent statements the explore script should validate. If provided, the skill highlights which observation patterns are most relevant.

## Steps
1. Present the ExploreResult contract:
   - Script reads `CDP_URL` from env
   - Script connects via `chromium.connectOverCDP()`
   - Script emits JSON to stdout: `{ observations: ObservationResult[] }`
   - Each observation: `{ id, pass, evidence, value? }`

2. Present the observation pattern library (from explore-helpers.ts):

   | Pattern | Function | Use when |
   |---------|----------|----------|
   | Visibility | `checkVisible(page, selector, label)` | Element should be present and visible |
   | Text content | `checkText(page, selector, label)` | Verify rendered text (always trims) |
   | Computed style | `checkStyle(page, selector, property, label)` | CSS property inspection (color, font, layout) |
   | Size / touch target | `checkSize(page, selector, minW, minH, label)` | Bounding box measurement |
   | Count | `checkCount(page, selector, expected, label)` | Number of matching elements |
   | Attribute | `checkAttribute(page, selector, attr, expected, label)` | ARIA, data attributes, accessibility |
   | Class state | `checkClass(page, selector, className, label)` | Class-based state (dark mode, expanded) |
   | Contrast | `checkContrast(page, textSel, bgSel, minRatio, label)` | Text legibility (catches white-on-white) |
   | Overflow | `checkOverflow(page, selector, label)` | Scroll/overflow detection |

3. Present the interaction library (from explore-interactions.ts):

   | Pattern | Function | Use when |
   |---------|----------|----------|
   | Safe click | `safeClick(page, selector)` | Click with visibility guard |
   | Type + submit | `typeAndSubmit(page, selector, text, key?)` | Form input |
   | Drag | `drag(page, source, target, opts?)` | Mouse drag with smooth motion |
   | Wait for element | `waitFor(page, selector, timeout?)` | Element readiness |
   | Wait for transition | `waitForTransition(page, ms?)` | Animation/CSS transition settle |

4. Present the page discovery pattern:
   - `connectAndFindPage(cdpUrl)` → filters DevTools pages, returns app page
   - `resetState(page)` → calls __DEMO_RESET__() if available

5. Present the template script (from scripts/explore/template-explore.ts):
   - Full working example showing all patterns in context
   - Baseline state → observations → interactions → re-observations

6. If `spec-statements` provided: highlight which patterns map to each statement.
   - "renders correctly in both themes" → checkStyle, checkContrast, checkClass
   - "all CRUD operations functional" → typeAndSubmit, checkCount, checkText
   - "data persists across restart" → interaction sequence (add → close → reopen → verify)

## Contract
- This skill is read-only. It does not create files.
- The agent writes the script after reading these patterns.
- The script must emit ExploreResult JSON to stdout. Everything else is up to the agent.
- Do not generate the script from the patterns. Present the vocabulary; the agent composes.
```

### `/roadmap-explore-run`

Iterative explore script execution. Agent wrote a script, wants to test it against the live app. Launches app, runs script, returns observations. Agent fixes and re-runs until observations are correct.

```markdown
# /roadmap-explore-run

Run an explore script against the live application and return observations.

## Arguments
- `script` (required): Path to the explore script
- `launch` (optional): Launch command (default: inferred from package.json)
- `port` (optional): CDP port (default: 9222)
- `build` (optional): Build command to run before launch (default: inferred)
- `keep-alive` (optional): Don't teardown after run — for rapid iteration

## Steps
1. If app not already running (no keep-alive from previous run):
   a. Build if needed: `$build` or `npx electron-vite build`
   b. Launch: `$launch --remote-debugging-port=$port`
   c. Wait for CDP readiness (poll /json/version, timeout 10s)
2. Run explore script: `npx tsx $script` with CDP_URL + CDP_PORT env vars
3. Parse ExploreResult JSON from stdout
4. Present observations:

   ```
   ## 🔬 Explore Results — validate-app.ts

   ✅ input-field-visible     — element found
   ✅ todo-added              — count: 1 (expected: 1)
   ✅ todo-text-correct       — "Test todo"
   ❌ text-contrast           — ratio 1.2:1 (min: 4.5:1)  ← FAILING
   ✅ dark-mode-active        — html.dark class present
   ❌ dark-mode-contrast      — ratio 1.0:1 (min: 4.5:1)  ← FAILING

   4/6 passing · 2 failures
   ```

5. If failures exist, present diagnostic context:
   - Which observation failed + actual value
   - Suggest which source files likely need changes (from node's produces)
6. If keep-alive: leave app running for next run
7. If not keep-alive: teardown app process

## Contract
- This is for iteration, not for validation. Use /roadmap-done for formal validation.
- Agent can call this repeatedly (fix script → re-run → fix script → re-run).
- With --keep-alive, app stays up between runs — faster iteration cycle.
- Observations are displayed with emoji status (✅/❌) for quick scanning.
- Failures include actual values, not just pass/fail — the agent needs to see what's wrong.
```

## Proposal: User skills (display layer)

These skills transform CLI output into visual displays optimized for human comprehension. Every user skill ends with AskUserQuestion — the display is always a decision point, never a dead-end dump.

### `/roadmap-dashboard`

Single-project health dashboard. Richer than `/roadmap-progress`, designed for session start or periodic check-in.

```
## 📊 todo-app-iter2

### Progress
█████████████████████████████ 100% complete (28/28 nodes)
⏱️ Total: 2h 14m across 3 sessions · Last: 34m ago

### Validation health
✅ Deterministic: 28/28 nodes pass (tsc + vitest + build)
🔍 Intent: 3/28 nodes evaluated, all passing
⚠️ Runtime: 0/28 nodes (no runtime-explore gates configured)

### Session history
  Session 1 (1h 20m) ── L00–L06: config + core modules
  Session 2 (34m)    ── L07–L08: components + tests
  Session 3 (20m)    ── L09: integration validation ✅

### Open concerns
🔴 No runtime-explore on terminal node
🟡 5 intent rules unevaluated
🟢 All deterministic gates passing
```

AskUserQuestion:
- "Start next iteration — plan iter3 DAG"
- "Evaluate unevaluated intents — run /roadmap-validate on pending"
- "Add runtime-explore gate to terminal"
- "Archive and close"

### `/roadmap-dag`

Visual DAG rendering. ASCII dependency graph with status indicators.

```
## 🔀 todo-app-iter2 — Dependency Graph

  wait-cluster-auto ✅ ──┐
  wait-intent-constraints ✅ ──┤
                               ├── audit-claude-md ✅
                               └── plan-iter2-dispatch ✅ ──┬── config-package ✅
                                                            ├── opus-spine ✅
                                                            │
                          ┌─────────────────────────────────┘
                          ├── config-build ✅    ├── config-lint ✅
                          ├── config-test ✅     ├── config-tsconfig ✅
                          ├── config-ui ✅       ├── deps-install ✅
                          ├── feature-csv ✅     └── renderer-utils ✅
                          │
                    ┌─────┴─────┐
              electron-db ✅   renderer-store ✅
              electron-preload ✅  test-csv ✅
                    │               │
              electron-main ✅   renderer-entry ✅
              test-db ✅         test-store ✅
                    │               │
                    └───────┬───────┘
                            │
                  ┌─────────┴─────────┐
            TodoList ✅  TodoItem ✅  TitleBar ✅  ThemeToggle ✅
                  └─────────┬─────────┘
                     test-components ✅
                            │
                  integration-validated ✅
```

AskUserQuestion:
- "Show critical path"
- "Show a specific node detail — enter node ID"
- "Show cross-repo dependencies"
- "No action needed"

### `/roadmap-cost`

Cost and performance metrics. Pulls from checkpoints, trail, and cost-estimator.

```
## 💰 todo-app-iter2 — Cost & Performance

### This iteration
  Agents spawned:  20 (vs 99 in iter1)
  Wall clock:      2h 14m (vs 2h 30m in iter1)
  Agent utilization: 68% (vs 12% in iter1)
  Estimated cost:  $12.40

### Per-batch breakdown
  L00  ██░░░░  $0.80   2 nodes  ⏱ 4m    — init constraints
  L03  ████░░  $1.60   2 nodes  ⏱ 8m    — config + spine
  L04  ██████  $3.20   8 nodes  ⏱ 12m   — parallel config + features
  L05  █████░  $2.40   4 nodes  ⏱ 8m    — core modules
  L06  █████░  $2.00   4 nodes  ⏱ 12m   — electron + renderer
  L07  ████░░  $1.60   4 nodes  ⏱ 6m    — components
  L08  ██░░░░  $0.60   1 node   ⏱ 3m    — test integration
  L09  ██░░░░  $0.20   1 node   ⏱ 1m    — final validation

### Trends (vs iter1)
  📉 Agent count:    -80%
  📈 Utilization:    +467%
  📉 Integration bugs: -100% (0 vs 10)
  ≈  Wall clock:     -11%
  📉 Cost:           -73%
```

AskUserQuestion:
- "Drill into a specific batch"
- "Compare with iter1 in detail"
- "Export as report"
- "No action"

### `/roadmap-node`

Rich single-node detail card. For when the user asks "what's going on with this node?"

```
## 📋 electron-db

  Status:     ✅ Complete (checkpoint cp-20260227015226)
  Level:      L05 (batch 5 of 9)
  Mode:       execute
  Owner:      worker-2 (claimed 02:15, completed 02:23, 8m)

  📥 Consumes
  └── shared/types.ts (from config-package)

  📤 Produces
  └── electron/db.ts ✅ exists (247 lines)

  🔍 Validators
  ├── ✅ artifact-exists: electron/db.ts
  ├── ✅ shell: npx tsc --noEmit (exit 0)
  └── 🔍 intent: "CRUD operations use parameterized queries" (unevaluated)

  🌐 Ambient
  ├── .specify/pre-spec.md
  └── tsconfig.json

  📎 Commit: 3088fa4 "electron-db: SQLite CRUD layer with sort tiebreaker"
```

AskUserQuestion:
- "Evaluate unevaluated intent"
- "Show file diff for this node's commit"
- "Show downstream dependents"
- "No action"

### `/roadmap-expansion-history`

Visualizes intent-driven expansion chains (FR-INTENT-EXPANSION). Shows how a node decomposed through recursive expansion.

```
## 🌳 Expansion History — component-themetoggle

  component-themetoggle (L07)
  ├── Intent: "dark: variants use .dark class selector" — ❌ 0.72/0.90
  │   └── 🔧 component-themetoggle-fix-0 (depth 1)
  │       ├── Diagnosis: "index.css missing @custom-variant dark declaration"
  │       ├── Produces: src/assets/index.css, src/components/ThemeToggle.vue
  │       ├── Confidence: 0.72 → 0.91 ✅
  │       └── Status: ✅ Complete
  │
  ├── Intent: "toggle button visible in title bar" — ❌ 0.65/0.90
  │   └── 🔧 component-themetoggle-fix-1 (depth 1)
  │       ├── Diagnosis: "ThemeToggle rendered but z-index behind TitleBar drag region"
  │       ├── Produces: src/components/TitleBar.vue
  │       ├── Confidence: 0.65 → 0.88 — ❌ (depth 2)
  │       │   └── 🔧 component-themetoggle-fix-1-fix-0 (depth 2)
  │       │       ├── Diagnosis: "pointer-events: none on drag region covers toggle"
  │       │       ├── Confidence: 0.88 → 0.94 ✅
  │       │       └── Status: ✅ Complete
  │       └── Status: ✅ Complete (via child)
  │
  └── Re-validation: all intents passing ✅ — node closed
```

AskUserQuestion:
- "Show the actual file diffs from each fix"
- "Show cost breakdown for expansion chain"
- "No action"

### `/roadmap-session`

Session timeline. What happened, in order, with timing. For session review or handoff.

```
## ⏱️ Session Timeline — 2026-02-27 02:15–02:49 (34m)

  02:15  🚀 /roadmap-start "iter2 L07 — component batch"
  02:16  📋 /roadmap-work component-todolist
  02:18  ⚡ Spawned 4 workers (todolist, todoitem, titlebar, themetoggle)
  02:19  ✅ component-todoitem complete (worker-3, 1m)
  02:22  ✅ component-todolist complete (worker-1, 6m)
  02:24  ✅ component-titlebar complete (worker-2, 6m)
  02:26  ⚠️ component-themetoggle — intent fail (0.72/0.90)
  02:26  🌳 Expanding: 2 fix nodes generated
  02:29  ✅ fix-0 complete (dark mode CSS, 3m)
  02:32  ✅ fix-1 complete (z-index, depth 2 needed, 6m)
  02:33  ✅ component-themetoggle re-validated — all intents pass
  02:33  📊 /roadmap-progress — batch L07 complete
  02:34  📋 /roadmap-work test-components
  02:42  ✅ test-components complete (8m)
  02:43  📊 /roadmap-progress — batch L08 complete
  02:44  📋 /roadmap-work integration-validated
  02:48  ✅ integration-validated complete
  02:49  🏁 /roadmap-progress — DAG converged
```

AskUserQuestion:
- "Export session notes for handoff"
- "Start next session"
- "Review a specific event — enter timestamp"
- "Archive and close"

## Rendering engine

User skills share a rendering layer. Common primitives:

```typescript
interface SkillRenderer {
  progressBar(done: number, total: number, width?: number): string  // █████░░░ 75%
  statusIcon(status: 'pass' | 'fail' | 'pending' | 'warn'): string // ✅ ❌ ⬜ ⚠️
  treeNode(label: string, children: string[], indent: number): string
  table(headers: string[], rows: string[][]): string
  timeAgo(date: Date): string                                       // "34m ago"
  duration(ms: number): string                                      // "2h 14m"
  costBar(usd: number, maxUsd: number): string                     // ██░░░░ $1.60
}
```

Installed as `src/lib/skill-renderer.ts`. Skills import it. Tests verify rendering output is deterministic (no dates in snapshots — mock `Date.now()`).

## Install integration

`roadmap install --skills` installs both layers:

```bash
roadmap install --skills                    # all skills (agent + user)
roadmap install --skills --agent-only       # agent skills only (for CI, headless)
roadmap install --skills --user-only        # user display skills only
```

Agent skills: roadmap-start, roadmap-work, roadmap-done, roadmap-dispatch, roadmap-review, roadmap-constraints, roadmap-expand, roadmap-claim, roadmap-validate, roadmap-escalate, roadmap-trail, roadmap-checkpoint, roadmap-explore-write, roadmap-explore-run

User skills: roadmap-gallery, roadmap-progress, roadmap-dashboard, roadmap-dag, roadmap-cost, roadmap-node, roadmap-expansion-history, roadmap-session

## Skill index

Full catalog with layer, shipped status, and dependency:

| Skill | Layer | Status | Depends on |
|---|---|---|---|
| `/roadmap-start` | agent | **shipped** | — |
| `/roadmap-work` | agent | **shipped** | — |
| `/roadmap-done` | agent | **shipped** | — |
| `/roadmap-dispatch` | agent | **shipped** | compile-prompts (future) |
| `/roadmap-review` | agent | **shipped** | — |
| `/roadmap-constraints` | agent | **shipped** | — |
| `/roadmap-expand` | agent | planned | FR-INTENT-EXPANSION |
| `/roadmap-claim` | agent | planned | — |
| `/roadmap-validate` | agent | planned | — |
| `/roadmap-escalate` | agent | planned | — |
| `/roadmap-trail` | agent | planned | — |
| `/roadmap-checkpoint` | agent | planned | — |
| `/roadmap-explore-write` | agent | planned | FR-RUNTIME-EXPLORE, explore-helpers.ts |
| `/roadmap-explore-run` | agent | planned | FR-RUNTIME-EXPLORE, runtime-explore.ts |
| `/roadmap-gallery` | user | **shipped** | — |
| `/roadmap-progress` | user | **shipped** | — |
| `/roadmap-dashboard` | user | planned | — |
| `/roadmap-dag` | user | planned | — |
| `/roadmap-cost` | user | planned | cost-estimator.ts |
| `/roadmap-node` | user | planned | — |
| `/roadmap-expansion-history` | user | planned | FR-INTENT-EXPANSION |
| `/roadmap-session` | user | planned | trail system |

## Priority order

**Agent skills first** — each one eliminates a class of protocol violations:

1. `/roadmap-validate` — highest value. Pre-check before done prevents the commit-reject-recommit cycle.
2. `/roadmap-claim` — swarm correctness. Eliminates claim misuse (wrong TTL, forgetting to claim, claiming ahead of frontier).
3. `/roadmap-expand` — expansion correctness. Ensures propagate always follows expand.
4. `/roadmap-escalate` — structured exits. Replaces freeform "I'm stuck" with actionable payloads.
5. `/roadmap-explore-write` — explore script authoring. Loads observation vocabulary so agents write rich scripts, not shallow `isVisible()` checks.
6. `/roadmap-explore-run` — explore iteration loop. Run script, see observations, fix, re-run. With `--keep-alive` for rapid cycles.
7. `/roadmap-trail` — session hygiene. Ensures archive on exit.
8. `/roadmap-checkpoint` — safety net. Saves before risky operations.

**User skills** — each one improves a decision the user makes:

1. `/roadmap-dashboard` — session start orientation. User sees health + options immediately.
2. `/roadmap-dag` — architectural comprehension. User sees shape, not just progress percentage.
3. `/roadmap-node` — drill-down. User inspects specific concerns.
4. `/roadmap-session` — review. User understands what happened and why.
5. `/roadmap-cost` — budget visibility. User sees spend patterns.
6. `/roadmap-expansion-history` — intent convergence visibility. User sees how expansion refined the DAG.

## Scope

- New: `src/skills/` — 14 new skill templates (8 agent, 6 user)
- New: `src/lib/skill-renderer.ts` — shared rendering primitives for user skills
- Modify: `src/lib/install-skills.ts` — `--agent-only`, `--user-only` flags, expanded skill registry
- Tests: each skill template renders correctly, AskUserQuestion options are state-derived, renderer primitives are deterministic

## Not in scope

- Skill composition (one skill calling another) — each skill is self-contained
- Custom user skill themes (color schemes, emoji sets) — single default
- Web-based rendering (HTML/SVG output) — terminal-only for now
- Skill analytics (which skills get called most) — future
