---
name: roadmap-spec
description: Generate convergence-oriented roadmap specs
user-invocable: true
---

# roadmap-spec

A spec is a bet: *if I execute these nodes in this order, I satisfy this intent.* Intelligence lives in the spec. Pack thinking into compile-time.

## Substrate inventory · precedes DAG authoring · §Substrate-inventory-precedes-DAG-authoring

Before drafting any DAG, enumerate the substrate state for this round's problem
domain. Skip this step and the round inherits substrate-amnesia risk · DAG
authoring against a partial substrate map duplicates extant artifacts and
misframes terminal classes.

Required inventory · for each round's problem domain:

1. Canonical artifacts        jq the four-or-five entries in model/canon/index.json
                              that touch this domain · cite path + sha256 + status
2. Cross-machine substrate    jq model/canon/forensic-sources.json for any
                              .sources[] whose role intersects the domain · note
                              .access (ssh host + paths) · .known_emitter_state
                              (per-field empirical observations · KNOWN-BUG flags)
3. Recent ephemeral substrate ls model/raw/<domain>/ · pick newest 1-3 epochs ·
                              record actual VALUES not just field presence
4. Deployed source state      if .access.remote_host present · ssh -O check the
                              controlmaster socket · note LastWriteTime · grep for
                              any in-flight integration markers
5. Predecessor round receipts find prior-round receipts under this domain ·
                              jq the carriers[] AND known limitations they named

Emit the inventory as the spec's ## Substrate state at round boundary block.
The DAG must declare for each new artifact it proposes: CONSUMES (extant) ·
SUPERSEDES (with named retirement) · NET-NEW (with justification why no extant
substrate satisfies). NET-NEW without justification is forge-by-narrative at the
DAG level.

If inventory cannot be completed (operator authority required · ssh unreachable ·
canonical artifact missing) · the spec must admit terminal class
HONEST_RED_SUBSTRATE_INVENTORY_INCOMPLETE explicitly. The round cannot close
GREEN if the inventory was skipped.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Schema

```ts
interface NodeSpec {
  id:        string;          // slug · concern-prefixed
  desc:      string;          // line 1 = plain-English title
  produces:  string[];        // artifacts this node creates
  consumes:  ConsumeSpec[];   // artifacts this node reads (encodes edges)
  validate:  ValidationRule[];
  mode?:     'execute' | 'plan';
  sidecar?:  Record<string, unknown>;  // ad-hoc · engine-ignored
}
```

INVARIANT · a field is first-class iff the engine reads it and branches. Everything else lives in `sidecar.{}`.

ORDERING · every edge is `consumes` of an upstream `produces`. If a gate has no artifact, the upstream node grows one — typically a ratification receipt at `.roadmap/round-N/<id>.json`. Logical-prereq-without-artifact is not a thing.

```bash
roadmap api make    # live schema · check shape before authoring
```

## Read what came before

```
.roadmap/heads/*.json         archived DAGs
.roadmap/heads/r*.boot.md     prior boot prompts · round-scoped cognitive residue
.roadmap/trail.jsonl          what actually happened
.roadmap/.handoff/*.json      what agents discovered
```

Scan 2-3 recent DAGs for shape, validators, friction (`grep` trail for advance rejections). Read the most recent `r<N>.boot.md` — it carries the prior session's stance and round context. `ls .roadmap/heads/r*.boot.md | sort` gives chronological round history.

## Observation discipline · author-time, not DAG-time

**Observations happen DURING spec authoring, in conversation — NOT as an O-thread of dispatched nodes.** The anti-pattern is opening every round with 6-8 observation nodes that dispatch agents to read files the user and author can answer in 30s together.

```
"we need to know X"        author + user resolve in conversation BEFORE compile
                           dag_desc embeds the finding · no observation node

"discover X by running code" THAT is the node · discovery node · single artifact
                           one such node, not six

"genuinely unknown until execution" plan-mode node · expansion at runtime IS the observation
```

The test: *"could the user and I have answered this in 5 minutes?"* If yes, embed in dag_desc.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## dag_desc · required shape

```
<Plain-English title — one line, capability-shaped, ≤ 80 chars>

## Intent
<the need · not the implementation>

## Scenario
given <starting state>
when  <the human acts>
then  <the human can ___>

## Round
<round N · falsifier this round must satisfy · carriers from prior round>

## Authority map
| domain | directories | allowed | forbidden |
|--------|-------------|---------|-----------|
| api    | src/api/    | routes, types, middleware | direct DB writes |
| auth   | src/auth/   | auth flow, JWT            | API routes, DB schema |
| db     | src/db/     | schema, migrations        | API surface, auth flow |

## Stance pointers
<CLAUDE.md sections · doctrine files · project-specific stance>

## Subtraction budget
| counted             | excluded                         | target  |
|---------------------|----------------------------------|---------|
| src/**/*.{ts,tsx}   | tests/ · generated/ · vendor/    | ≥ N LOC |

## Test profile
| level       | path glob                      | machine   | max dur |
|-------------|--------------------------------|-----------|---------|
| unit        | src/**/*.test.ts               | any       | 30s     |
| integration | tests/integration/**/*.test.ts | dev or ci | 5min    |
| e2e         | tests/e2e/**/*.spec.ts         | ci-only   | 30min   |

<narrative · risks · boundaries · known vs unknown>
```

The title + Intent + Scenario load-bear the boot.md scaffold render. Round + Authority map load-bear dispatch safety.

```
✗ titles      "r7-extract-pipeline" · "Implement the extraction module" · "Round 7"
✓ titles      "Extract pipeline records from the legacy database into typed JSON"
              "Verify the dashboard renders eerie-and-clickable against the design spec"
```

## Authority map · directory → domain

Parallel workers collide when scope is permissive. Fix lives upstream of dispatch: spec declares which directories belong to which domains; every node declares its target domain.

Required on every node: `sidecar.domain = "<domain>"`. Brief inherits allowed/forbidden from the authority map automatically.

```jsonc
{
  "id": "api-add-search-route",
  "desc": "Add /search endpoint to the catalog API\n\n...",
  "produces": ["src/api/routes/search.ts"],
  "sidecar": { "domain": "api" }
}
```

**Single-domain rule** (enforced by /roadmap-auto): one domain per node. Cross-domain changes split into multiple nodes wired by produces/consumes. Parallel dispatch only when domains disjoint.

Anti-patterns: node missing `sidecar.domain` · produces spanning multiple domains · authority map with one domain covering the whole repo (not a map, a non-statement).

## Investigation is always plan-mode

"Fix the dashboard" hides two phases: investigate (broad reads, hypothesis formation) and fix (narrow write). Different shapes, different nodes.

```
plan node      "Investigate <symptom> · identify root cause and fix scope"
               mode: plan
               produces: .roadmap/round-N/<id>.finding.json
               sidecar.domain: <usually the symptom's domain>

→ at runtime, plan expands into:
  · fix node(s) consuming finding.json
  · each fix node: execute-mode, single-domain, narrow scope
```

`finding.json`:

```json
{
  "node": "<plan id>", "symptom": "<one line>", "root_cause": "<one line>",
  "fix_scope": [{ "domain": "api", "files": [...], "change": "..." }],
  "evidence": ["<paths or excerpts>"]
}
```

Each `fix_scope` entry becomes a fix node. Each fix node is single-domain. Orchestrator parallelizes on disjoint domains.

**Test:** if desc starts with *fix / find / figure out / investigate / diagnose* → plan node. If it names a specific imperative (`add · rename · move · delete · extract · verify`) with concrete files → execute node.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Plain-English at node level

Every node carries TWO names: `id` (slug) and title (line 1 of desc).

```
id          concern-prefixed slug · stable · e.g. c-compile-schema
title       line 1 of desc · plain English · ≤ 80 chars · capability-shaped
body        rest of desc · scenario · stance · risk · receipt path · validator rationale
```

A spec without plain-English titles is unreviewable. Redirect before compile.

## Terminal node · the falsifier

Terminal node's `validate[]` IS the falsifier. NOT optional. NOT "artifact-exists" placeholders. Encodes the executable form of `Scenario.then`.

```
weak    { type: "artifact-exists", target: "dist/main.js" }
        ↑ structural validator, behavioral claim. false GREEN.

strong  { type: "shell", command: "curl -fs localhost:3000/api/health | jq -e .ok" }
        ↑ exercises the thing the way a human would.
```

If the spec has multiple natural leaves, author a `t-review` terminal that consumes every leaf's produces and runs the falsifier. Do not rely on synthetic `_term` — its validate is empty, and empty validator is coasting GREEN.

## Default code stance · the floor

Travels with every dispatch brief unless project overrides via stance pointers:

```
1. Subtract before adding.   Removing a surface > handling a case.
2. Extend, don't bolt.       Bolt-on flags = the existing shape is the actual subject.
3. Thin and long > short and fat. Cognitive density per line is the metric.
4. File sizing.              ~400 LOC goldilocks · under 100 suspicious · over 800 refactor.
5. Functions.                10-40 lines · one responsibility · guards first.
6. Delete completely.        Dead branches, unused imports, obsolete shims. No "removed"
                             comments, no _-prefixed stubs.
```

Floor, not ceiling. CLAUDE.md/docs override via stance pointers. Otherwise these ship default.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Compile vs runtime

```
compile time    intent · scenario · stance · risk · validators · doctrine
                survives sessions · IS the thinking

runtime         service state · prior-node findings · session traps · agent judgment
                ephemeral · dies with the session
```

Anything CAN be encoded at compile time SHOULD be.

## Knowledge surface · pick the slot

```
inputs[]              immutable substrate · sha-pinned · participates in compile_hash
dag_desc              prose · intent · scenario · authority · stance · narrative
tasks[].sidecar.{}    structured per-node facts · jq-queryable · engine-ignored
validators            claim-category-matched checks
receipts              per-node JSON at .roadmap/round-N/<id>.json
durable               CLAUDE.md or skill
```

§Sidecar-promotion · when a key recurs across 3+ specs · promote to first-class field. Sidecars are interim slots. Discipline is WHEN to promote, not avoiding sidecars.

Anti-pattern: re-passing the same fact through every node's sidecar. If SSH host appears in 8 nodes — either every node truly needs it (keep) or one upstream node produces a config receipt downstream consumes (collapse).

## Rounds

Round = falsifier + chain of DAGs aiming at it. Opens when falsifier declared, closes when satisfied OR HONEST-RED ships named carriers to next round.

```
node     intra-DAG · validator failure · fix-and-retry
DAG      inter-DAG within round · successor proposed, same round
round    cross-round · carriers named, falsifier survives boundary
```

Round encoding (optional, recommended):

```
dag-id prefix       r<N>-<concern>      e.g. r7-extract-pipeline
dag_desc / Round    "Round 7 · falsifier: <one line> · carriers from r6: X, Y, Z"
sidecar.round       round number
```

Round number is human-assigned. Agents do not auto-increment.

## Meta-DAGs

Plan-mode carries phase INTENT. Executing agent decomposes into sub-nodes informed by runtime truth.

```
spec        what to prove
observation what's true (in conversation, embedded in dag_desc)
expansion   how to get there (runtime, plan-mode children)
```

Plan-mode preferred wherever uncertainty lives.

## Fleeted lanes

Independent concerns → separate DAGs in separate worktrees. `fleet.json` registers each lane. Each worktree has its own `.roadmap/head.json`.

When to fleet: concerns touch different files. When NOT: shared critical-path dep → same DAG.

## Sizing

```
real work        30-35 nodes minimum per lane
under 20         hasn't been thought through
over 80          split into lanes or successors
with meta-DAGs   15-25 top-level nodes; expansion adds 8-15 per plan
```

## Banned · batch vocabulary

Streaming dispatch. Spec does NOT pre-partition into waves.

```
✗ ids        B0-<name> · B1-<name>
✗ dag_desc    'batch' · 'wave' · 'depth-layer' · 'synchronization barrier'
✗ node desc   'after batch N completes' · 'parallel with B1'

✓ ids         concern-prefixed · c-compile-schema · p-parse-records
✓ ordering    consumes ↔ produces · gates with no artifact get ratification receipt
✓ clustering  by CONCERN not BATCH in dag_desc
```

## Failure modes

```
1. assumption-first        builds before observing
2. boundary blindness      implements without probing seams
3. weak validators         "it compiles" as proof
4. self-graded success     agent writes intent, agent grades intent
5. shallow testing         presence mistaken for function
6. anemic specs            too few nodes · no plan-mode · no lanes
7. observation-thread      opening round with N read-only agents
8. empty terminal          terminal.validate = []
9. permissive scope        no authority map · workers collide
10. investigation in execute "fix the X" as one execute node hides broad reads
11. no subtraction       no audit/removal nodes · target=0 without greenfield justification
12. audit without tests  audit produces findings but no paired tests · findings will rot
13. missing test profile no Test profile in dag_desc · workers run blind, expensive suites
                         fire on wrong machines
```

## §Defer-only-when-necessary · spec-time mirror of fix-now beats carrier-now

Default to concrete now. Defer only when concrete-now genuinely isn't tractable at spec time.

```
plan-mode             genuine runtime uncertainty · NOT "I haven't decomposed"
                      test: can you write the children right now? then write them.

sidecar.{}            ad-hoc context engine ignores · NOT "I don't want to think
                      about the schema." if the engine reads it (domain, round,
                      validators), it's first-class.

observation-node      genuinely needing-execution discovery · NOT for questions
                      the user and author can resolve in 5 minutes.

carriers to round-N+1 work that doesn't fit this round's falsifier · NOT for work
                      the spec author defers because the spec already feels big enough.

vague authority map   not a thing · concrete domains with concrete dirs and
                      concrete allowed/forbidden, or the map is decorative.
```

Runtime mirror: `/roadmap-auto · fix-now beats carrier-now`. Both rules exist because polite-feeling deferrals defer tractable work and call it discipline.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## §Round-must-remove · subtraction is the discipline

Codebases accrete. Every round adds. Without forced subtraction, complexity grows monotonically. **Every round (post-greenfield) must include audit-and-removal as first-class nodes, and the terminal falsifier must confirm a non-trivial LOC reduction in the declared budget.**

The discipline is reducing SURFACE AREA, not compressing per-line. Remove whole files · whole abstractions · whole branches that don't pull weight. Do NOT compress thin-and-long code into dense one-liners — that fights rule 10.

**Audit candidates:**

```
dead code               unreachable · unused exports · unreferenced files
obsolete shims          backwards-compat whose callers are gone
redundant abstractions  abstraction layers used in 1 place
duplicated logic        copy-paste that should collapse
_-prefixed stubs        "removed" comments · placeholder names
over-fat functions      subjects of rule 10 refactor (extract + subtract from original)
```

**Spec shape:**

```
audit node          mode: plan · sidecar.domain: housekeeping (or candidate domain)
                    produces: .roadmap/round-N/subtract.audit.json
                    runs at round-open · inventories removal candidates

removal nodes       mode: execute · single-domain per node · consume audit.json
                    each candidate becomes a node in the expansion · scope tight

dag_desc            declare Subtraction budget block with target ≥ N LOC

terminal validator  shell · asserts removed >= target in budget
                    { type: "shell",
                      command: "removed=$(git diff main..HEAD --shortstat -- src/ \
                                ':!src/**/*.test.ts' | awk '{print $6+0}'); \
                                test ${removed:-0} -ge 50" }
```

**Greenfield exemption:** round 1 of a new lane may declare target=0. After round 1, target=0 requires explicit justification in dag_desc — *"this round is greenfield because <reason>."*

**Anti-patterns · gaming the metric:**

```
✗ delete whitespace · rename · comment removal to satisfy the gate
✗ compress thin-and-long into dense one-liners (fights rule 10)
✗ declare target=0 routinely · accretion is the failure mode
✗ subtraction punted to a "cleanup round" that never happens
```

**Sibling disciplines** · same shape, different artifact:
- `/roadmap-auto · fix-now beats carrier-now` — runtime mirror
- `/roadmap-bootprompt · §Substrate-inventory-precedes-DAG-authoring` — what the round inherits
- §Round-must-remove — what the round leaves behind
- §Audit-must-test — what protects the round's findings (below)

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## §Audit-must-test · tests are the anti-rot mechanism

Every audit (substrate inventory · subtraction · investigation) produces findings AND tests. Findings without tests are advisory; tests are structural — they fire on regression and prevent the next round from re-introducing the same defect.

```
audit kind              paired test
──────────────────────  ──────────────────────────────────────────
substrate inventory     contract test · substrate matches inventory (drift detection)
subtraction removal     regression test · deleted code stays deleted · behavior unchanged
investigation finding   targeted test · the fix holds against the symptom
```

Without paired tests, audit findings rot. The codebase regresses to the state the audit found removable. Round work becomes Sisyphean.

### Test pyramid by node-type · authoring guidance

When authoring a node, match test level to claim category:

```
refactor          unit tests           logic preserved
feature           integration tests    component contract
ui                e2e tests            user workflow
performance       benchmarks           regression bound
audit-removal     regression tests     deleted stays deleted
```

Runtime enforces this via `/roadmap-auto · post-GREEN sniff category-match`. Structural test on behavioral claim = false GREEN.

### Test profile · declared in dag_desc

Declare the per-level path globs · machine class · max duration in the Test profile block above. Execution rules (when to run, capture-before-rerun, profile-aware dispatch) live in `/roadmap-auto`. If the spec omits the profile, the floor profile travels.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Writing checklist

```
shape          observe-in-conversation → implement narrow → verify wide
nodes          self-contained · one concern · falsifiable · heavyweight desc
titles         line 1 plain English · ≤ 80 chars · capability-shaped
validators     match category of claim · structural→structural · behavioral→behavioral
terminal       validate[] holds the falsifier · INCLUDES the subtraction check
subtraction    audit node + removal nodes · Subtraction budget declared with target
tests          every audit produces paired tests · Test profile declared
               level matches node-type · machine class respected
dag_desc       title + Intent + Scenario + Round + Authority map + Stance pointers
authority      every node has sidecar.domain
investigations all "fix/find/investigate" are plan-mode producing finding.json
```

## Before submit

```
approve    premises grounded in conversation · embedded in dag_desc
           validators invoke produces · terminal carries falsifier (shell)
           descs are scenarios, not tasks
           Authority map declares directory → domain · every node has sidecar.domain
           investigations are plan-mode producing finding.json
           Subtraction budget declared · audit + removal nodes present ·
           terminal validator asserts removed >= target
           Test profile declared · audit nodes pair with test nodes ·
           test level matches node-type claim

redirect   observation-thread · implementation-first · validators don't name produces
           terminal validate is [] · under 20 nodes · titleless nodes
           missing sidecar.domain · produces spanning domains
           "fix/find/investigate" in execute-mode · Authority map absent
           no Subtraction budget · target=0 without greenfield justification ·
           no audit/removal nodes
           audit without paired tests · missing Test profile ·
           test level mismatches claim (structural test on behavioral claim)

stop       boundaries unknown · intent unclear · no archived heads read
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Create

```bash
roadmap make docs/<dag-id>.spec.json --note "<intent>"
```

## Closing ritual · invoke /roadmap-bootprompt

Before returning to user, invoke `/roadmap-bootprompt`. The spec encodes what to prove. The boot prompt encodes the cognitive stance from THIS session — drift-prevention, dead ends, register, user concerns. Dies with the session unless captured now.

```
chain: /roadmap-spec → roadmap make → /roadmap-bootprompt → user
```

Skipping strands the cognitive residue. Do not skip.

The boot prompt for the resulting round must inherit the inventory block · see
/roadmap-bootprompt skill for the ## Substrate state at round boundary template.

💀 *spec is the bet · terminal is the falsifier · boot prompt is the stance.*
