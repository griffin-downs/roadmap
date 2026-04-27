---
name: roadmap-auto
description: Autonomous roadmap execution with rich reporting
user-invocable: true
---

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

# roadmap-auto

The DAG executes itself. The node desc IS the agent brief. The orchestrator routes and synthesizes — does not do dirty work.

## Protocol · streaming dispatch (r25+)

```
1. roadmap orient — position is truth.
2. dispatch every READY node (deps satisfied, not in-flight).
3. per node:
   produce → git add → commit → push → roadmap advance --note "<what>"
4. advance rejects? read error · fix produce · re-commit · retry. never skip validators.
5. any node completes → orient → dispatch newly-ready nodes immediately → repeat.
6. at term → /roadmap-term.
```

**No waves. No batches. No depth-layer synchronization.** `depends:` is the only ordering truth. When a predecessor completes, every node whose deps just closed is dispatchable in the same tick — they do not wait for sibling peers in an artificial cohort.

## The orchestrator is precious · stay out of the dirt

Context window is the scarcest resource. The orchestrator coordinates and synthesizes; subagents do work. If the orchestrator finds itself parsing 297KB orient output or reading 600-line receipts, the dispatch pattern is wrong.

**Streaming dispatch agent.** When ≥2 nodes are READY, spawn ONE dispatcher whose job is:

```
- read briefs in .roadmap/round-N/briefs/ for every READY node
- dispatch one agent per node, parallel where independent
- as each agent completes, re-orient and dispatch any newly-ready nodes
- collect agent reports
- return a tight ≤10-line status to the orchestrator:
    {ready: [ids], completed: [ids], failed: [{id, reason}],
     surfaces: [carrier-ids], frontier: [next-ready ids]}
- the orchestrator never sees raw orient or raw agent receipts
```

For solo-ready dispatch, call the single agent directly.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 📡 Ambient context · read metadata first

before reading any node desc · read the spec's metadata.{}.
round-level facts live there. ssh hosts · file paths · toolchain locations ·
procedures to invoke on failure · policy declarations · gate declarations.

CONTRACT
  the dispatcher injects metadata into per-node briefs as ambient.
  briefs do NOT re-pass round-level facts that live in metadata.
  if a brief contains the SSH host string · the dispatch pattern is wrong.

PROCEDURES EMIT VERBATIM
  metadata.autonomy.ssh_resilience contains a literal reactivation
  command. on SSH failure · the agent OUTPUTS THAT STRING TO THE USER.
  no paraphrasing. no guessing at credentials. no skipping nodes.
  the procedure is graph-state · not training-state.

POLICIES GATE DECISIONS
  metadata.autonomy.human_window_nodes lists nodes requiring human window
  (synchronous Griffin · stratum push · etc).
  on encountering one autonomously · agent writes GBD-r(N+1) receipt
  with the named successor. no autonomous push.

READ ONCE · CACHE LOCALLY · DON'T RE-READ PER NODE
  metadata is round-level. reading once at orient is sufficient.
  re-reading per-node is the dispatch pattern smell.

depth · /fleet-doctrine §Sidecar-as-ambient-context
register · /stance

💀 *Procedures live in the spec · not the agent.*

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Dispatching agents · brief contract

Briefs are small, structured, and bound. Agents do not need to be re-taught doctrine; they need scope, inputs, and verification gates.

```
brief shape (≤30 lines target)
──────────────────────────────
TASK         imperative verb + concrete outcome
INPUTS       file paths the agent reads (cite specifically; no "go look around")
PRODUCES     file paths the agent writes (must match node.produces)
SCOPE        allowed paths · forbidden paths · single-domain rule
VERIFY       command that confirms success
RECEIPT      .roadmap/round-N/<node-id>.json · structured · ≤30 lines · NO prose
ON-BLOCKED   STOP · output one blocking question · do NOT guess
```

## Receipts · structured JSON, not prose markdown

Every receipt lives at `.roadmap/round-N/<node-id>.json`. Fixed slots:

```json
{
  "node": "<id>",
  "verdict": "GREEN" | "GBD-r<N+1>" | "BLOCKED",
  "artifacts": ["<paths>"],
  "commits": [{"repo": "fleet", "sha": "<hex>"}],
  "verify": {"cmd": "<...>", "exit": 0, "summary": "<one line>"},
  "carriers": [{"id": "<r19-...>", "condition": "<...>"}],
  "notes": "<≤3 lines · only if truly needed>"
}
```

No narration. No tables. No color-field banners. The artifact + commit IS the evidence; the receipt indexes it. Terminal rubric reads JSON, synthesizes once.

If an agent writes a markdown receipt, the dispatch brief failed.

## Bound output explicitly

Every brief includes:

```
Receipt: ≤30 lines structured JSON to .roadmap/round-N/<id>.json.
No prose narration. No diagrams. No quoted doctrine. Voice tokens are pure loss.
Status reply to orchestrator: ≤10 lines.
```

## Decompose before GBD

GBD ("Green-By-Disposition") advances a node when residual work is explicitly dispositioned with named successor owners. It is **last-resort**, not first-resort cover.

Before writing a GBD receipt, ask: what portion of this node IS doable now? Dispatch on that portion. GBD only the residual.

The four GBD conditions (all required):

```
1. every residual has a NAMED round-N+1 owner (specific node-id, not vague)
2. receipt enumerates residuals (per-instance or per-cluster with counts)
3. meta-#8 still applies (no skipping consumer migration via GBD)
4. validator relaxation is VISIBLE in the DAG (modify the node's validator)
```

Anti-pattern: relax validator without naming successor work = forged green.

## P0 motion check · between dispatch ticks

Node throughput is not progress. P0 motion is.

```
every N completions (N = max(3, frontier-width)) · re-read DAG root P0 list.
  any P0 observably moved?
    yes (≥1)              continue · orient · dispatch next frontier
    no · one tick          acknowledge · prefer tractable P0 subsets next
    no · two ticks in a row STOP · surface · do NOT compile next round
                            on top of untouched P0s
```

A round closing with stated P0s untouched is not converged · it is deferred.

## Reporting

Tight, informational. The user sees the DAG come alive without scrolling.

```
on orient
─────────
🔮 dag-name — B2 of 7 │ 5/14 done
B0 init ✅
B1 setup-db ✅ │ setup-auth ✅
B2 [api-routes] [middleware] ←── here
B3 integration │ B4 tests │ B5 term

on dispatch
───────────
B2 DISPATCHED · 2 parallel
🔧 api-routes    → src/api/routes.ts
🔧 middleware    → src/middleware/auth.ts

on batch complete
─────────────────
🟩 B2 ✅ │ next: B3 integration

on terminal
───────────
🟩 DAG COMPLETE — trajectory + successor proposal
```

## At terminal

```
read terminalContext.detectedGaps   remaining work
read terminalContext.rootIntent     what we're building toward
read successorProposal.action:
  converged    → done · tell the human
  continue     → write successor spec from specDraft · roadmap make
  orbit-break  → STOP · surface orbitDiagnosis to human
```

## Chain continuation

```
after writing successor spec:
  git checkout main && git merge <branch>
  roadmap make successor-spec.json --note "chain from <dag_id>"
  roadmap orient — begin next cycle

loop: work → term → successor → merge → make → orient → work
do not stop at "merge first" · complete the loop.
```

## Permissions

```
next moves approved · do not ask permission
merge to main approved
dispatch parallel background sonnet agents for batch nodes
expand plan nodes into subgraphs as encountered
```

## Two loops

```
DAG loop     orient → work batch → advance → orient again
agent loop   produce → inspect output → fix → produce again
             look at what you made · until it's right
```

## Chain

```
called after /roadmap-orient shows work
at terminal → /roadmap-term
chain: orient → auto → spec → term → orient
```
