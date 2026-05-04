---
name: roadmap-spec
description: Generate convergence-oriented roadmap specs
user-invocable: true
---

# roadmap-spec

A spec is a bet: *if I execute these nodes in this order, I satisfy this intent.*

Intelligence lives in the spec. Pack thinking into compile-time, not runtime. A lightweight spec produces lightweight agents.

## The schema

```ts
interface NodeSpec {
  id:        string;                  // required · slug · concern-prefixed
  desc:      string;                  // required · line 1 = plain-English title
  produces:  string[];                // required · artifacts this node creates
  consumes:  ConsumeSpec[];           // required · artifacts this node reads
  validate:  ValidationRule[];        // required · acceptance gates
  mode?:     'execute' | 'plan';      // optional · default "execute"
  sidecar?:  Record<string, unknown>; // optional · ad-hoc per-node context
}
```

Five required, two optional. Nothing else.

INVARIANT · **a field is first-class iff the engine reads it and branches.**
Everything else — context files, source coordinates, author notes,
domain knowledge, round-level facts — lives under `sidecar.{}`.

ORDERING · **every ordering edge is a `consumes` of an upstream `produces`.**
If a gate has no artifact, the upstream node grows one — typically a
ratification receipt at `.roadmap/round-N/<upstream-id>.json` that
downstream nodes list under consumes. Logical-prereq-without-artifact
is not a thing.

```bash
roadmap api make    # live schema · check shape before authoring
```

## Read what came before

```
.roadmap/heads/*.json    archived DAGs
.roadmap/trail.jsonl     what actually happened
.roadmap/.handoff/*.json what agents discovered
```

Before writing, scan 2-3 recent completed DAGs for shape, validators, decomposition idiom, friction (`grep` trail for advance rejections).

## Spec-time observation discipline · the load-bearing change

**Observations happen DURING spec authoring, in conversation with the user — NOT as an O-thread in the DAG.**

The anti-pattern: open every round with 6-8 observation nodes that dispatch agents to read files the orchestrator and user could answer in 30 seconds together. Findings then required dag.insert, invalidating the DAG, surfacing blockers, stalling execution. ~500K tokens per round of pure waste.

The discipline:

```
no node enters the spec until its premise is grounded.

  if the premise is "we need to know X" — author + user resolve X
  in conversation BEFORE the spec compiles. dag_desc embeds the
  finding. no observation node.

  if the premise is "we need to discover X by running code" — that
  IS the node. it's a discovery node, not an observation node. it
  produces an artifact other nodes consume. one such node, not six.

  if the premise is genuinely unknown until execution — use a
  plan-mode node. its expansion at runtime IS the observation.
```

The test: "could the user and I have answered this question in conversation in 5 minutes?" If yes, no observation node — answer it now, embed in dag_desc.

## The bet · what to answer before writing

```
intent     what was the human actually asking for? the need, not the implementation.

scenario   given [starting state] · when [the human acts] · then [the human can ___]
           write this BEFORE any node. it IS the acceptance.

done       what would the human do to check? open it. run it. interact with it.
           the terminal validator does exactly that.

stance     what artifacts encode this project's quality standard?
           point at them. they travel with every dispatch.

risk       what will surprise us? boundaries between systems. always.
           ground the surprises in conversation. don't dispatch them.
```

## Compile vs runtime

```
compile time    intent · scenario · stance · risk · shape · validators · doctrine
                survives sessions · IS the thinking

runtime         service state · prior-node findings · session traps · agent judgment
                ephemeral · dies with the session

shared          stance sharpens per dispatch · risk grows as observations land ·
                doctrine re-emphasizes per node
```

Anything CAN be encoded at compile time SHOULD be.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 🗂️ Knowledge surface · choose the right slot

the spec is not a config file. the spec is a typed knowledge graph.
slots have access patterns. authors choose by kind × access × durability.

SLOTS
  inputs[]              immutable substrate · sha-pinned · participates in compile_hash
  dag_desc              prose · intent · scenario · stance · risk · narrative
  tasks[].sidecar.{}    structured per-node facts · jq-queryable · engine-ignored
  validators            claim-category-matched checks
  receipts              per-node completion JSON at .roadmap/round-N/<id>.json

CHOOSE BY KIND × ACCESS × DURABILITY
  immutable + hashable             → inputs[]
  prose narrative                  → dag_desc
  per-node structured fact         → tasks[].sidecar.{}
  durable across rounds            → CLAUDE.md or skill

EMERGENT SIDECAR SHAPES (today's commonly-seen keys under tasks[].sidecar.{})
  ambient                          context files agents should read but engine doesn't gate
  network_endpoints                ssh hosts · controlmaster paths · reactivation commands
  filesystem_coordinates           remote paths · cross-repo bridges
  toolchain                        compiler paths · build tool locations · capability bools
  procedures                       literal text agents emit on trigger (e.g. SSH-resilience)
  autonomy                         policy · gate declarations · human_window_nodes
  provenance                       source-spec coordinates · file/line/section

§Sidecar-promotion-rule · when a sidecar key recurs across 3+ specs ·
promote to first-class engine schema. sidecars are honest interim slots.
discipline is in WHEN to promote · not in avoiding sidecars.

ANTI-PATTERN · re-passing the same fact through every node's sidecar.
if the SSH host appears in 8 nodes · either every node truly needs it
(keep) or one upstream node should produce a config receipt downstream
nodes consume (collapse).

💀 *Permissive fields become knowledge stores · place them deliberately.*

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Receipts go to `.roadmap/`, not `docs/`

Round-receipts are ephemeral — only consumers are next-batch agents and the terminal rubric. They are NOT doctrine.

```
✓ .roadmap/round-N/<node-id>.json     ephemeral · structured · machine-queryable
✗ docs/audit/round-N/<node-id>.md     pollutes doctrine folder · prose theater
```

`docs/` holds things that outlive a round (thesis, design, doctrine). Round artifacts live under `.roadmap/`.

When a receipt earns durability (e.g. the doctrine note actually changed), `git mv` it to `docs/` deliberately. Default is ephemeral.

## Meta-DAGs

Plan-mode nodes carry the INTENT of a phase. The executing agent decomposes into concrete sub-nodes informed by what's true at execution time.

```
spec encodes        what to prove
observation encodes what's true (in conversation, embedded in dag_desc)
expansion encodes   how to get there (runtime, in plan-mode children)
```

Flat nodes = you guessed the decomposition at spec time. Plan nodes = the decomposition emerges from runtime knowledge. Plan-mode preferred wherever uncertainty lives.

## Fleeted lanes

Independent concerns → separate DAGs in separate worktrees. `fleet.json` registers each lane. Each worktree has its own `.roadmap/head.json`. Three lanes = three parallel sessions = 3× throughput.

When to fleet: concerns touch different files → fleet. Concerns share a critical-path dep → same DAG.

## Sizing

```
real work        30-35 nodes minimum per lane
under 20         hasn't been thought through
over 80          split into lanes or successors
with meta-DAGs   15-25 top-level nodes; expansion adds 8-15 per plan
```

The spec is heavyweight by design. Every node desc carries full context. Every validator encodes a real check. Every scenario traces to root intent.

## Plain-English names · load-bearing for humans

Every node carries TWO names: an `id` (slug for the engine) and a plain-English title (first line of `desc`, for humans). Both are required. The id sequences the DAG · the title is what a user reads in orient output, in dispatch banners, in the trail, in receipts. If a human can't read the DAG aloud and understand what each node does, the spec failed before it compiled.

```
id          concern-prefixed slug · machine-readable · stable
            e.g. c-compile-schema · p-parse-records · v-verify-dashboard

title       first line of desc · plain English · capability-shaped · ≤ 80 chars
            no slugs · no jargon-only · no "implement X module"
            reads like a sentence a non-author could repeat back

body        rest of desc · scenario · stance · risk · receipt path · validators rationale
```

REQUIRED SHAPE for every `tasks[].desc`:

```
<Plain-English title — one line, capability-shaped>

<scenario · stance · risk · receipt path · doctrine pointers>
```

GOOD vs BAD titles:

```
✗ "c-compile-schema"                           (slug, not English)
✗ "Implement the compiler module"              (task-shaped, no capability)
✗ "Phase 2 wiring"                             (batch vocabulary, opaque)
✗ "Fix the thing"                              (no referent)

✓ "Compile the API schema from the OpenAPI definition"
✓ "Parse user records from the legacy database into structured JSON"
✓ "Verify the dashboard renders against the design spec"
```

The test · read the DAG to a stranger. If they can follow the story from titles alone, the spec is load-bearing for humans. If they need to ask "what does c-compile-schema mean," the title failed.

A spec that ships nodes without plain-English titles is redirected before compile · titleless nodes are unreviewable.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Banned · batch vocabulary

Streaming dispatch is the execution model. The spec does NOT pre-partition nodes into waves. Ordering comes from `consumes ↔ produces` wiring, period.

```
❌ BANNED in node ids       B0-<name> · B1-<name> · B2-<name>
❌ BANNED in dag_desc        'batch' · 'wave' · 'depth-layer' · 'synchronization barrier'
❌ BANNED in node desc       'after batch N completes' · 'parallel with B1' ·
                             'wait for sibling cohort'

✓ REQUIRED                   prefix nodes by CONCERN not BATCH · e.g.
                             c-compile-schema · p-parse-records · v-verify-dashboard
✓ REQUIRED                   ordering is consumes ↔ produces · gates with no
                             artifact get a ratification receipt upstream
✓ REQUIRED                   cluster in dag_desc by CONCERN not BATCH
                             (SCHEMA · PARSER · VERIFIER · etc)
```

A spec containing `B0/B1/B2` templates is redirected before compile. Clusters-of-concern replace batch-cohorts · streaming dispatch is the runtime.

## What kills specs

```
1. assumption-first       builds before observing.
                          fix: ground premises in conversation before compile.

2. boundary blindness     implements without probing seams.
                          fix: ask what breaks at every boundary; answer in dag_desc.

3. weak validators        "it compiles" as proof.
                          fix: validator answers "how would a human check?"

4. self-graded success    agent writes intent, agent grades intent.
                          fix: intent validators on plan nodes only;
                          execute nodes use shell validators against real artifacts.

5. shallow testing        presence mistaken for function.
                          fix: validator checks RESPONSE, not PRESENCE.

6. anemic specs           too few nodes · no plan-mode · no lanes.
                          fix: push knowledge into the spec violently.
                          if you know it, encode it. if you suspect it, plan-mode it.

7. observation-thread     opening the round with N read-only agents.
                          fix: observations are author-time conversations, not nodes.
```

## Writing the spec · checklist

```
shape          observe-in-conversation → implement narrow → verify wide
nodes          self-contained · one concern · falsifiable · heavyweight desc
titles         first line of desc is a plain-English capability sentence ·
               readable aloud · no slugs · ≤ 80 chars · load-bearing for users
descs          scenario form · then = a CAPABILITY the human gains
validators     match category of claim · structural→structural · behavioral→behavioral
               refuse artifact-exists as terminal · refuse grep as behavioral evidence
receipts       node desc states "receipt to .roadmap/round-N/<id>.json"
```

## Before submit

```
approve    premises grounded in conversation · embedded in dag_desc.
           every validator invokes a produce.
           terminal uses the thing the way a human would.
           descs are scenarios, not tasks.
           independent concerns are fleeted.

redirect   observation-thread present · implementation-first ·
           validators don't name produces · terminal checks existence ·
           descs describe files not capabilities · under 20 nodes ·
           any node missing a plain-English title on line 1 of desc ·
           any node with predecessors and empty consumes ·
           any gate that can't point at an upstream produce ·
           anemic.

stop       boundaries unknown · intent unclear · no archived heads read.
```

## Create

```bash
roadmap make docs/<dag-id>.spec.json --note "<intent>"
roadmap orient --note "begin <dag-id>"
```

## Chain

```
orient → spec → make → orient → auto → term → orient
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Survey · two seats, one stream

The schema is fixed. The survey doesn't decide what to keep · it
verifies that the seven-field shape survives in practice and surfaces
sidecar keys earning their way to first-class status.

Two seats, one append-only stream at `.roadmap/spec-survey.jsonl`.
Discriminate via `seat: "author" | "consumer"`.

### Author seat · runs BEFORE `roadmap make` succeeds

While per-node decisions are still recallable.

```
1. WIRING — for every node with predecessors, list the consumes entries
   that gate it. For every gate, name the upstream produce that satisfies
   it. If any gate has no upstream produce, that's a structural failure ·
   either fix the wiring or surface the missing artifact.

2. RATIFICATION — list every node that exists primarily as a gate (init ·
   plan-mode parents · scope-lockers). For each, name the receipt it
   produces and which downstream nodes consume it.

3. SIDECAR KEYS — every key you wrote under tasks[].sidecar.{}:
     one-shot   · used here only
     recurring  · seen in ≥1 prior spec
     promote    · should be a first-class field (which · why)

4. MODE — list nodes you marked mode: "plan". For each, what runtime
   knowledge will drive the expansion? If you can answer at compile time,
   it shouldn't be plan-mode.

5. TITLES — confirm every node's desc opens with a plain-English
   capability sentence. Paste any title you suspect won't survive the
   read-aloud test.
```

### Consumer seat · runs on first dispatch of each node

While the brief and dispatch routing are fresh.

```
1. ROUTING — did consumes ↔ produces alone tell you what was on the
   frontier? if you needed any other signal to pick this node, name it.

2. DESC FIDELITY — was line 1 of desc a usable plain-English title?
   yes · no (paste the title and what would have served better)

3. CONSUMES UTILITY — did you actually read the artifacts under consumes
   to do this work, or was the wiring decorative?

4. SIDECAR USE — did anything in sidecar.{} change how you executed?
   if no, the keys are spec-time documentation (fine) · if yes, name them.

5. UNEXPRESSED CONSTRAINTS — was there anything you needed to know that
   the seven-field schema couldn't carry? where did you get it from
   instead (CLAUDE.md, dag_desc, the boot prompt)?
```

### Receipt schema

```
.roadmap/spec-survey.jsonl
  { seat, dag_id, node_id?, ts, agent_id,
    answers: { q1, q2, q3, q4, q5 } }
```

### Aggregation

```
sidecar promotion       a key labeled "promote" in author Q3 across ≥3
                        specs becomes a first-class field candidate ·
                        review at next schema bump
unexpressed constraints recurring entries in consumer Q5 are the
                        candidates AGAINST the seven-field shape · if
                        ≥3 specs surface the same gap, the schema needs
                        another field
wiring failures         any author Q1 with an unsatisfiable gate is a
                        spec rejection · author redrafts before make
```
