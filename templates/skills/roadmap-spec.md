---
name: roadmap-spec
description: Generate convergence-oriented roadmap specs
user-invocable: true
---

# roadmap-spec

A spec is a bet: *if I execute these nodes in this order, I satisfy this intent.*

Intelligence lives in the spec. Pack thinking into compile-time, not runtime. A lightweight spec produces lightweight agents.

## The schema

```bash
roadmap api make
```

If this doc contradicts the API, the API wins.

## Read what came before

```
.roadmap/heads/*.json    archived DAGs
.roadmap/trail.jsonl     what actually happened
.roadmap/.handoff/*.json what agents discovered
```

Before writing, scan 2-3 recent completed DAGs for shape, validators, decomposition idiom, friction (`grep` trail for advance rejections).

## Spec-time observation discipline · the load-bearing change

**Observations happen DURING spec authoring, in conversation with the user — NOT as an O-thread in the DAG.**

The pre-r19 anti-pattern: open every round with 6-8 observation nodes that dispatch agents to read files the orchestrator and user could answer in 30 seconds together. Findings then required dag.insert, invalidating the DAG, surfacing blockers, stalling execution. ~500K tokens per round of pure waste.

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
  inputs[]         immutable substrate · sha-pinned · participates in compile_hash
  dag_desc         prose · intent · scenario · stance · risk · narrative
  metadata.{}      structured round-level facts · permissive · jq-queryable
  tasks[].{}       per-node specifications
  validators       claim-category-matched checks
  receipts         per-node completion JSON

CHOOSE BY KIND × ACCESS × DURABILITY
  immutable + hashable             → inputs[]
  prose context                    → dag_desc
  round-level structured fact      → metadata.{}
  per-task structured fact         → tasks[].{}
  durable across rounds            → CLAUDE.md or skill

EMERGENT SIDECAR SHAPES (today's commonly-seen)
  network_endpoints                ssh hosts · controlmaster paths · reactivation commands
  filesystem_coordinates           remote paths · cross-repo bridges
  toolchain                        compiler paths · qmake · MSBuild · capability bools
  procedures                       literal text agents emit on trigger (e.g. SSH-resilience)
  autonomy                         policy · gate declarations · human_window_nodes

§Sidecar-promotion-rule · when a metadata shape recurs across 3+ specs ·
promote to first-class engine schema. sidecars are honest interim slots.
discipline is in WHEN to promote · not in avoiding sidecars.

ANTI-PATTERN · re-passing round-level facts through every per-task brief.
if the SSH host appears in 8 task descs · it belongs in metadata.{} once.

depth · /fleet-doctrine §Spec-as-typed-knowledge-graph cluster
register · /stance

💀 *Permissive fields become knowledge stores · everywhere they exist.*

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

## Banned · batch vocabulary (r25+)

Streaming dispatch is the execution model. The spec does NOT pre-partition nodes into waves. `depends:` is the only ordering truth.

```
❌ BANNED in node ids       B0-<name> · B1-<name> · B2-<name>
❌ BANNED in dag_desc        'batch' · 'wave' · 'depth-layer' · 'synchronization barrier'
❌ BANNED in node desc       'after batch N completes' · 'parallel with B1' ·
                             'wait for sibling cohort'

✓ REQUIRED                   prefix nodes by CONCERN not BATCH · e.g.
                             i-predict-geometry · d-qmetaobject-parser · v-fnpgrov-convergence
✓ REQUIRED                   depends: [...] is the only sequencing declaration
✓ REQUIRED                   cluster in dag_desc by CONCERN not BATCH
                             (PREDICTOR · DIFF-ENGINE · BUG-CLASS-DETECTORS · etc)
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
