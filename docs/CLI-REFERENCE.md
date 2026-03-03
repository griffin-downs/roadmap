# Roadmap CLI Reference

**Consolidated surface:** 6 core + 4 groups. All output is JSON by default.

---

## Core Commands (Mainline Execution Loop)

### `roadmap orient [--ready|--next|--assign|--json|--staged|--check]`

Find current batch position. Core entry point for all workflows.

**Options:**
- `--ready` — Nodes beyond current batch whose deps are satisfied (eager dispatch)
- `--next` — Next batch lookahead (orchestrator pre-warming)
- `--assign --owners w1,w2` — Round-robin assign batchRemaining nodes
- `--json` — Full DAG structure (nodes, edges, toposort, blocked, executable)
- `--staged` — Per-node isomorphism: do staged files match produces[]?
- `--check` — No trail entry (for frequent polling)

**Example:**
```bash
roadmap orient --note "starting auth phase"
roadmap orient --ready --note "check unblocked future nodes"
roadmap orient --assign --owners alice,bob --note "dispatch batch"
```

---

### `roadmap advance [--structural-only|--allow-conflicts]`

Validate all nodes in current batch complete, move to next batch.

**Options:**
- `--structural-only` — Skip quality gates, advance on artifact existence only
- `--allow-conflicts` — Override batch conflict enforcement

**Example:**
```bash
roadmap advance --note "batch 1 complete"
```

---

### `roadmap show <node-id> [--batch [level]]`

Get full node spec (produces, consumes, deps, validate, status).

**Options:**
- `--batch [level]` — All nodes at a batch level (default: current batch)

**Example:**
```bash
roadmap show init
roadmap show --batch 2
```

---

### `roadmap complete <node-id> [--no-advance]`

Atomic: claim → checkpoint → reorient → auto-advance if last in batch.

**Options:**
- `--no-advance` — Don't auto-advance after completing node

**Example:**
```bash
roadmap complete node-a --note "implemented auth service"
```

---

### `roadmap chart [--deps|--critical-path]`

Pretty-print progress chart with emoji bars.

**Options:**
- `--deps` — Cross-repo chart: show dependency repo positions
- `--critical-path` — Annotate critical path nodes with ⚡

**Example:**
```bash
roadmap chart
roadmap chart --deps
```

---

### `roadmap validate [<node-id>]`

Run validation rules (all nodes or specific).

**Example:**
```bash
roadmap validate
roadmap validate auth-01
```

---

## Command Groups

### `roadmap dag <subcommand> [options]`

DAG structure and manipulation.

**Subcommands:**

#### `roadmap dag diff [<ref>]`
Structural diff between current DAG and old version.
```bash
roadmap dag diff HEAD~1 --note "review changes"
```

#### `roadmap dag expand <script.ts>`
Run expansion script, validate DAG, commit.
```bash
roadmap dag expand phase-2.ts --note "decomposed phase 2 into nodes"
```

#### `roadmap dag propagate [--from <id>] [--dry-run] [--depth N]`
Backward constraint propagation — derive upstream validate rules from downstream.
```bash
roadmap dag propagate --note "propagate downstream constraints"
```

#### `roadmap dag retire <id> [--cascade|--undo|--list]`
Skip/retire a node (treated as done by orient).
```bash
roadmap dag retire auth-01 --note "archival: auth already exists"
roadmap dag retire auth-01 --cascade --note "retire auth-01 and dependents"
```

#### `roadmap dag optimize`
Refactor DAG for better structure.
```bash
roadmap dag optimize --note "reduce critical path length"
```

#### `roadmap dag switch`
Switch worktree/branch.
```bash
roadmap dag switch --note "switch to develop"
```

#### `roadmap dag spawn <id>`
Create worktree for a node.
```bash
roadmap dag spawn auth-01 --note "start work on auth-01"
```

---

### `roadmap team <subcommand> [options]`

Multi-agent coordination.

**Subcommands:**

#### `roadmap team claim <id> [--owner <name>] [--ttl <sec>] [--renew|--release|--list]`
Claim a node for exclusive work (advisory lock).
```bash
roadmap team claim auth-01 --owner alice --ttl 900
roadmap team claim auth-01 --renew
roadmap team claim --list
```

#### `roadmap team dispatch`
Route tasks to agents.
```bash
roadmap team dispatch --note "dispatch batch to workers"
```

#### `roadmap team strategy`
Proposal/selection for multi-agent strategy.
```bash
roadmap team strategy --note "auto-assign by load"
```

#### `roadmap team assign [--owners w1,w2,w3] [--ttl <sec>]`
Round-robin assign batchRemaining nodes to owners.
```bash
roadmap team assign --owners alice,bob,charlie --note "dispatch batch"
```

---

### `roadmap spec <subcommand> [options]`

Spec intake pipeline.

**Subcommands:**

#### `roadmap spec plan [--gallery|select <id>|status|overlay <id>|schedule]`
Spec planning: gallery, selection, status, overlay, schedule.
```bash
roadmap spec plan --gallery --note "show spec gallery"
roadmap spec plan select auth-spec --note "select auth spec"
roadmap spec plan status
roadmap spec plan overlay auth-spec --note "write candidate nodes"
roadmap spec plan schedule --note "schedule execution"
```

#### `roadmap spec import --from speckit <file.md> --id <dag-id>`
Parse tasks.md → roadmap DAG (receipted).
```bash
roadmap spec import --from speckit tasks.md --id phase-2 --note "import spec tasks"
```

#### `roadmap spec intake [absorb|scan|import|certify|absorb]`
Absorb git range → .roadmap/intake/<id>.json.
```bash
roadmap spec intake absorb --from abc1234 --to def5678 --note "absorb commit range"
```

#### `roadmap spec compile`
Parse tasks → spec-compiled.json (roadmap IR).
```bash
roadmap spec compile --note "compile spec"
```

#### `roadmap spec init --id <dag-id> [--engine <name>]`
Create spec workspace + config (.roadmap/spec/).
```bash
roadmap spec init --id phase-2 --engine spec-kit --note "init spec workspace"
```

---

### `roadmap util <subcommand> [options]`

Session utilities, debugging, and introspection.

**Subcommands:**

#### `roadmap util trail [--last N] [--global] [--repo <name>] [--archive] [--archived] [--read <file>]`
Read invocation trail.
```bash
roadmap util trail --last 10
roadmap util trail --global
roadmap util trail --archive
```

#### `roadmap util checkpoint [--label <name>] [--list] [--restore]`
Save/restore state checkpoints.
```bash
roadmap util checkpoint --label "phase 1 complete" --note "save checkpoint"
roadmap util checkpoint --list
roadmap util checkpoint --restore
```

#### `roadmap util explore [--api] [--run <script>] [--launch <cmd>] [--port N] [--keep-alive]`
Explore API surface and run exploration scripts.
```bash
roadmap util explore --api
roadmap util explore --run my-script.ts --launch "npm start"
```

#### `roadmap util install [path]`
Install protocol into CLAUDE.md (default: .claude/CLAUDE.md).
```bash
roadmap util install
roadmap util install .my-claude/CLAUDE.md
```

#### `roadmap util federation`
Cross-repo coordination.
```bash
roadmap util federation --note "sync with sibling repos"
```

---

## Global Flags

All commands output JSON by default (no `--json` flag needed).

```
--quiet, -q              Suppress non-fatal output
--global, -g             Access global trail (~/.roadmap/trail.jsonl)
--dry-run, --dryrun      Show what would happen without executing
--depth, -d N            Dependency traversal depth
```

---

## Note Requirement

All commands (except `help`, `orient`, `chart`, `show`) require `--note "reason"`.

The note is trail content — write what you're doing and why, not ceremony.

**Good:**
```bash
roadmap dag expand phase-2.ts --note "auth module — decomposing session management into 3 nodes"
```

**Bad:**
```bash
roadmap dag expand phase-2.ts --note "expanding"
```

---

## Example Workflows

### Start a new phase
```bash
roadmap orient --note "auth module — investigating token expiry"
roadmap show init
roadmap dag expand auth-spec.ts --note "decomposed auth into 4 nodes"
```

### Parallel work (single batch)
```bash
roadmap team claim auth-service --owner alice
roadmap team claim auth-storage --owner bob
# (do work...)
roadmap complete auth-service --note "JWT service implemented"
roadmap complete auth-storage --note "token store implemented"
roadmap advance --note "auth batch complete"
```

### Import spec and execute
```bash
roadmap spec import --from speckit tasks.md --id phase-1 --note "import spec tasks"
roadmap spec plan status
roadmap dag diff
roadmap advance --note "phase 1 ready"
```

### Track progress across repos
```bash
roadmap chart
roadmap chart --deps  # cross-repo view
roadmap util trail --last 20
```

---

## Migration Notes

### Old → New Spelling

| Old | New |
|-----|-----|
| `roadmap expand` | `roadmap dag expand` |
| `roadmap propagate` | `roadmap dag propagate` |
| `roadmap retire` | `roadmap dag retire` |
| `roadmap optimize` | `roadmap dag optimize` |
| `roadmap switch` | `roadmap dag switch` |
| `roadmap spawn` | `roadmap dag spawn` |
| `roadmap diff` | `roadmap dag diff` |
| `roadmap import` | `roadmap spec import` |
| `roadmap intake` | `roadmap spec intake` |
| `roadmap plan` | `roadmap spec plan` |
| `roadmap claim` | `roadmap team claim` |
| `roadmap dispatch` | `roadmap team dispatch` |
| `roadmap strategy` | `roadmap team strategy` |
| `roadmap trail` | `roadmap util trail` |
| `roadmap checkpoint` | `roadmap util checkpoint` |
| `roadmap explore` | `roadmap util explore` |
| `roadmap install` | `roadmap util install` |
| `roadmap federation` | `roadmap util federation` |

All old spellings are removed — use new grouped names.

---

## Help

```bash
roadmap help          # Show this reference
roadmap <group> help  # Group-specific help (roadmap dag help, etc.)
```
