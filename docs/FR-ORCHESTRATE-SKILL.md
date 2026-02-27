# FR: `/roadmap-orchestrate` — Full pipeline skill with rich visual display

## Problem

The full spec→execution→verification pipeline requires ~15 manual CLI invocations, multiple decision points, and knowledge of which skill to call when. An experienced user can thread it together by reading CLAUDE.md, but:

1. **No single entry point** — user must know the sequence: intake → import → enrich → gallery → review → dispatch → execute → gate
2. **Terse output by default** — CLAUDE.md optimizes for density/speed, hiding the machinery. For demonstrations and new users, this is opaque.
3. **No visual feedback** — DAG structure, progress, strategy alternatives, and gate results are JSON blobs. No charts, no diagrams, no explanation of what's happening.
4. **Meta-workflow not encoded** — spec-kit running *inside* roadmap (intake as a DAG) is a pattern, not a codified workflow.

## Proposal

### `/roadmap-orchestrate` skill

A user-invocable skill that runs the full pipeline from pre-spec corpus to verified output. Rich visual display mode: diagrams, emojis, transparent CLI output, DAG graph rendering at every transition.

### Display mode override

The skill injects a **display context** that overrides the terse CLAUDE.md language settings for the duration of the session:

```markdown
## Display Mode: Orchestrate

For this session, override default output constraints:
- 📊 Show DAG graphs at every phase transition (ASCII art, mermaid, or roadmap chart)
- 🔍 Reprint all roadmap CLI output verbatim — user sees what the system sees
- 💬 Explain each phase before entering it: what it does, why it matters, what can go wrong
- 📋 Show decision points explicitly with options and tradeoffs
- ✅❌ Gate results displayed as observation tables with emoji status
- 🔄 Progress bars and phase indicators throughout
- No density optimization — clarity over brevity
```

The terse settings (`Concrete, declarative, load-bearing, dense`) are backed up and restored after the skill completes.

### Pipeline phases (what the skill executes)

```
Phase 0: 📥 INTAKE
  "Taking your pre-spec and running it through spec-kit..."

  ┌─────────────────────────────────────────────────┐
  │  pre-spec.md → constitution → specify → plan → tasks  │
  │  Each step validates before proceeding.          │
  └─────────────────────────────────────────────────┘

  Runs: /speckit.constitution, /speckit.specify, /speckit.plan, /speckit.tasks
  Shows: Each artifact as it's produced, with summary
  Gate: All 4 artifacts exist and pass schema validation

Phase 1: 🏗️ IMPORT
  "Converting tasks into a roadmap DAG..."

  Runs: roadmap import --from speckit <tasks.md> --id <dag-id>
  Shows: Imported node count, dependency graph, batch structure
  Reprints: Full import output

Phase 2: 🔧 ENRICH
  "Adding validation rules, intent gates, and spec conformance..."

  ┌─ Init Gate ─────────────────────────────────────┐
  │  Plan clarity: concrete produces, resolvable     │
  │  consumes, testable validates, scoped nodes      │
  │  Produces: spec-clarified.json                   │
  └─────────────────────────────────────────────────┘

  ┌─ Terminal Gate ─────────────────────────────────┐
  │  Output correctness: app launches, features      │
  │  present, visual validation passes               │
  │  Consumes: spec-clarified.json                   │
  │  Runs: explore script against live app via CDP   │
  └─────────────────────────────────────────────────┘

  Runs: roadmap init, LLM enrichment, roadmap propagate
  Shows: Before/after node validator counts, propagation results
  Reprints: propagate --dry-run output, then propagate output

Phase 3: 🎯 STRATEGY SELECTION
  "Here are your execution strategies..."

  ┌─────────────┬───────┬──────────┬────────────┐
  │ Strategy    │ Nodes │ Agents   │ Est. Time  │
  ├─────────────┼───────┼──────────┼────────────┤
  │ 🎯 Faithful │  28   │ 5       │ ~45min     │
  │ ⚡ Minimal  │  18   │ 3       │ ~25min     │
  │ 🛡️ Robust   │  34   │ 6       │ ~60min     │
  │ 💰 Budget   │  15   │ 2       │ ~20min     │
  └─────────────┴───────┴──────────┴────────────┘

  Runs: roadmap plan --gallery
  Shows: Strategy comparison table with AskUserQuestion
  User selects → DAG committed

Phase 4: 🔍 ADVERSARIAL REVIEW
  "Running three-pass adversarial review..."

  Pass 1 🃏 Fool:        "What dependency is assumed but unstated?"
  Pass 2 🔎 Inquisitor:  "Are acceptance criteria testable and falsifiable?"
  Pass 3 👁️ GriffinProxy: "Does this match what you asked for?"

  Verdict: ✅ proceed / ⚠️ conditional / ❌ reject

  Runs: /roadmap-review
  Shows: Each pass with findings, final synthesis
  If reject → loops back to Phase 2 with user guidance

Phase 5: 🚀 DISPATCH
  "Spawning workers and assigning nodes..."

  ┌─ Batch L00 ────────────────────────────────────┐
  │  worker-1 → config-package                      │
  │  worker-2 → opus-spine                          │
  └─────────────────────────────────────────────────┘
  ┌─ Batch L01 (pre-warming) ──────────────────────┐
  │  worker-3 → config-tsconfig                     │
  │  worker-4 → config-build                        │
  │  ...                                            │
  └─────────────────────────────────────────────────┘

  Runs: roadmap install --skills, /roadmap-dispatch
  Shows: Assignment table, batch structure, pre-warm status
  Reprints: orient --assign output

Phase 6: ⚙️ AUTONOMOUS EXECUTION
  "Workers are building. Monitoring progress..."

  █████████████░░░░░░░░░░░░░░░░░ 45% (12/28 nodes)

  ✅ L00 config-package (worker-1, 2m 14s)
  ✅ L00 opus-spine (worker-2, 4m 31s)
  ✅ L01 config-tsconfig (worker-3, 1m 02s)
  🔄 L01 config-build (worker-4, running...)
  ⏳ L02 electron-db (queued)

  Runs: Workers call /roadmap-work → implement → /roadmap-done
  Shows: Live progress via /roadmap-progress at intervals
  Reprints: roadmap chart after each batch completion

Phase 7: 🔒 INIT GATE
  "Validating plan clarity..."

  ✅ ConcreteProduces    — all 28 nodes have file paths
  ✅ ResolvableConsumes  — all consumed artifacts are produced upstream
  ✅ ValidateRules       — all nodes have ≥1 validator
  ✅ NoOwnershipConflict — no duplicate produces
  ✅ ScopeBounded        — all nodes under 15-word scope

  📄 Produced: spec-clarified.json (14 features, 0 gaps, confidence: 0.98)

  Shows: Each clarity check with pass/fail
  Reprints: complete output with validation results

Phase 8: 🎯 TERMINAL GATE
  "Building app, launching, running visual validation..."

  Step 1: npx tsc --noEmit         ✅ clean
  Step 2: npx vitest run           ✅ 51 tests, 76% coverage
  Step 3: npx electron-vite build  ✅ main + preload + renderer
  Step 4: Launch app (CDP:9222)    ✅ connected
  Step 5: Explore observations:

  🔬 validate-contract.ts

  ✅ todo-input              Visible at input[placeholder]
  ✅ crud-add                count: 1 (expected: >= 1)
  ✅ crud-toggle             interactive: checkbox toggles
  ✅ theme-toggle            dark class toggles on html
  ✅ text-contrast           4.87:1 (min: 4.5:1)
  ✅ dark-contrast           12.4:1 (min: 4.5:1)
  ❌ crud-edit               edit input did not appear

  6/7 passing · 1 failure

  🔄 expandOnFail triggered → generating fix node...

  Shows: Each deterministic gate, then explore observations table
  If fail → shows expansion, fix nodes, re-validation loop
  Reprints: complete --explore full output

Phase 9: ✅ CONVERGENCE
  "DAG terminated. All gates passed."

  ████████████████████████████████ 100% (28/28 nodes)

  📊 Final metrics:
    Nodes:     28 complete
    Tests:     51 pass, 0 fail
    Coverage:  76% statements
    Build:     main + preload + renderer
    Explore:   7/7 observations passing
    Time:      ~38 minutes
    Agents:    5 workers

  Runs: roadmap trail --archive
  Shows: Final chart, metrics summary, trail archive confirmation
```

### Skill arguments

```
/roadmap-orchestrate [pre-spec-path] [--resume] [--from-phase N] [--dry-run]

  pre-spec-path   Path to pre-spec.md (default: .specify/pre-spec.md)
  --resume        Resume from last checkpoint (reads trail)
  --from-phase N  Skip to phase N (useful after manual fixes)
  --dry-run       Show what would happen without executing
```

### Implementation: skill template

The skill is a `.claude/skills/roadmap-orchestrate/SKILL.md` installed via `roadmap install --skills`. It:

1. Injects the display mode override (rich output context)
2. Sequences through phases 0-9
3. At each phase: explains → executes → reprints output → shows visual
4. At decision points (Phase 3, 4): uses `AskUserQuestion`
5. On failure: shows diagnosis, offers options (fix, skip, escalate)
6. On completion: restores terse display mode, archives trail

### CLAUDE.md integration

The skill does NOT permanently modify CLAUDE.md. Instead, it prepends a display context block at session start and the agent follows it for the session duration. The existing terse constraints remain in CLAUDE.md for all other workflows.

However, CLAUDE.md should document the orchestrate skill as the recommended entry point for full pipeline execution:

```markdown
## Full Pipeline

For end-to-end spec→execution→verification:
  /roadmap-orchestrate [pre-spec-path]

This runs the complete pipeline with visual feedback.
For manual control, use individual skills (start, work, done, dispatch, etc).
```

## Scope

### In scope
- Skill template: `src/skills/roadmap-orchestrate.md`
- Registration in `builtinTemplates()`
- Display mode context block (injected, not persistent)
- Phase sequencing with checkpoint/resume support
- DAG graph rendering at transitions (ASCII via `roadmap chart`)
- AskUserQuestion at decision points

### Out of scope
- Mermaid/Graphviz rendering (ASCII chart is sufficient)
- Web UI for progress monitoring
- Automated strategy selection (always asks user)
- Modifying CLAUDE.md language constraints permanently

## Dependencies

- FR-EXPLORE-API (for terminal gate explore script imports)
- FIXUP-WORKFLOW-INTEGRATION (for missing skills: expand, validate, escalate)
- v0.8.0 spec-threading (shipped)

## Validation

- Skill installs via `roadmap install --skills`
- `/roadmap-orchestrate --dry-run` shows all phases without executing
- Full pipeline completes on todo-app pre-spec (end-to-end test)
- Display mode produces readable, visual output at every phase
- Resume from checkpoint works after interruption
