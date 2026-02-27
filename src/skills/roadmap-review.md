<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-review

Three-pass adversarial review of a proposed DAG. Run before committing any roadmap structure changes (`.roadmap/head.json`, batch definitions, phase transitions).

## Arguments
- `dag` (required): Path to the DAG file under review (typically `.roadmap/head.json`).
- `intent` (required): The stated intent from `orient --note` — what this DAG is supposed to accomplish.

## Steps

### Pass 1 — Assumption challenge (fool lens)
1. What dependency is assumed but unstated?
2. What breaks if the second batch fails — does batch 3 still make sense?
3. Where is the single point of failure?
4. What is the weakest link the author does not see?

### Pass 2 — Structural review (inquisitor lens)
1. Are acceptance criteria testable and falsifiable? Cite each one.
2. Are dependencies acyclic? Trace the graph.
3. Is scope bounded per batch? Flag any batch that could expand unboundedly.
4. Does every node have at least one acceptance criterion? Does every dependency edge have a rationale?

### Pass 3 — Deviation check (griffinProxy lens)
1. Does this DAG match the stated intent from `orient --note`?
2. Has scope crept beyond the original ask?
3. Are there nodes that serve a future need but are not required by the current intent?
4. Would the user recognize this DAG as what they asked for?

### Verdict
Synthesize the three passes into one of:
- **proceed**: all three passes clean. Write the DAG.
- **conditional**: risks noted but bounded. Write the DAG, record the risks as comments in `head.json`.
- **reject**: structural problem or intent mismatch. Do not write. Reframe the problem with the user before continuing.

## Contract
- **All three passes run. No skipping.** Present all three inline, then synthesize.
- **Every finding must include evidence.** Node IDs, dependency edges, quoted acceptance criteria. No finding without a referent.
- **Reject blocks the DAG commit.** If any pass produces a structural problem or intent mismatch, the DAG is not written. Reframe with the user.
- **This review runs before writing, not after.** Reviewing a committed DAG is an audit; this skill is a gate.
