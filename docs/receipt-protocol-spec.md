# Receipt Protocol Integration

## Problem

Agents claim to follow the roadmap protocol (orient → read → implement → commit → advance) but there's no proof. The DAG says what should happen. Nothing records what did happen. Protocol violations are invisible.

## Solution

Append-only receipt chain (JSONL with SHA linking) emitted at each protocol step. Chain gaps = protocol violations. Agents see gaps immediately. `roadmap receipts --verify` gates on chain integrity.

## Receipt Types

- **OrientReceipt** — emitted by `roadmap orient`. Captures position, level, batch, branch.
- **AdvanceReceipt** — emitted by `roadmap advance`. Captures nodeId, validation results, evidence.
- **IntakeReceipt** — emitted by `roadmap make` on spec intake. Captures spec path, story count.
- **AdversarialReceipt** — emitted per adversarial review pass. Captures pass number, findings.

## Chain Mechanics

Ported from llm-cli pattern:
- `computeReceiptSha(data)` — deterministic SHA256, sorted keys, excludes own sha field
- `validateChain(entries)` — backlink integrity + content integrity
- Append-only JSONL at `.roadmap/receipts.jsonl`
- Each receipt links to previous via `previousSha`

## Protocol Gap Detection

On `roadmap advance`, check receipt chain:
- No orient receipt for current batch → warning
- No commit receipt for produces → warning
- Warnings recorded in trail.jsonl, not blocking (initially)

## CLI

`roadmap receipts` — query chain, show summary
`roadmap receipts --verify` — exit 0 if valid, 1 if broken
`roadmap receipts --verbose` — full chain with timestamps

## Workflow Violations Detected

| Violation | Chain Evidence |
|-----------|---------------|
| Advance without orient | No orient receipt before advance |
| Implement without reading consumes | No read receipt for consumed artifacts |
| Commit files not in produces | Commit receipt lists files outside produces |
| Skip adversarial review | No adversarial receipts before DAG commit |
| Work on wrong batch node | Orient receipt shows different position |

## Scope

- Receipt types + SHA chain (from llm-cli)
- Emission points in orient, advance, make
- Query/verify CLI verb
- Protocol gap warnings on advance
- Integration tests: full orient → advance → verify loop
