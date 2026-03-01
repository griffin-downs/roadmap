# Metaflow Sovereignty

This document records the sovereignty invariant set for the `fr-metaflow-001` DAG
and links each invariant to its acceptance evidence.

## What sovereignty means

Once `.governance/authority.json` exists in a repo, the following contracts hold:

1. Every interactive workflow routes through the metaflow system
2. Every output produces a render receipt under `.roadmap/render/`
3. The authority marker is treeSha-bound to the git tree at last write
4. No `SKIP_*` env var has any behavioral effect
5. `roadmap plan select` must be receipted before `metaflow run`

A repo without `authority.json` is in **UNGOVERNED** state. The only permitted
command in that state is `roadmap metaflow init`.

## Invariant set

| # | Name | Check | Hard/Soft |
|---|------|-------|-----------|
| 1 | authority-present | `.governance/authority.json` exists and `kernel = 'roadmap'` | Hard |
| 2 | flow-registry-valid | All flow files under `.roadmap/flows/` pass schema validation | Hard |
| 3 | treeSha-bound | `authority.json.treeSha` matches `HEAD^{tree}` | Hard |
| 4 | render-receipts-present | At least one file in `.roadmap/render/` | Hard |
| 5 | env-bypass-inert | `SKIP_*` env vars detected but have zero behavioral effect | Informational |
| 6 | plan-select-receipted | `PLAN_SELECTED.json` exists and points to a valid receipt | Hard |

## Implementation modules

| Module | Purpose |
|--------|---------|
| `src/lib/metaflow/authority-schema.ts` | `AuthorityJson` type + `isAuthorityJson` guard |
| `src/lib/metaflow/authority.ts` | `readAuthority`, `writeAuthority`, `getTreeSha`, `verifyTreeSha` |
| `src/lib/metaflow/flow-schema.ts` | `Flow`, `FlowStep` types + guards |
| `src/lib/metaflow/flows.ts` | `loadFlowIndex`, `loadFlow`, `listFlows` |
| `src/lib/metaflow/render-receipt.ts` | `writeRenderReceipt`, `readRenderReceipt`, `lastRenderReceipt` |
| `src/lib/metaflow/cli-sovereignty.ts` | `cmdInit`, `cmdStatus`, `cmdList`, `cmdRun`, `cmdRender`, `cmdVerify` |
| `src/lib/metaflow/guards.ts` | `checkEnvBypass`, `writeBypassReceipt` |
| `src/lib/metaflow/kernel-bridge.ts` | `requirePlanSelectReceipt`, `enforceKernelInvariants` |
| `src/lib/metaflow/verify.ts` | `verifyAll` — runs all 6 checks, returns `VerifyResult` |

## Acceptance evidence

All acceptance scenarios from the spec are covered by the following test suites:

| Test file | Invariants covered |
|-----------|-------------------|
| `tests/metaflow/authority.test.ts` | 1, 3 — write/read/verify round-trip, UNGOVERNED_REPO, AUTHORITY_MALFORMED |
| `tests/metaflow/flows.test.ts` | 2 — valid/missing/malformed flow loading |
| `tests/metaflow/render.test.ts` | 4 — write/read receipt, re-render idempotency |
| `tests/metaflow/cli.test.ts` | 1, 2, 4 — all subcommands in isolation |
| `tests/metaflow/bypass.test.ts` | 5 — SKIP_* detection with zero behavioral effect |
| `tests/metaflow/kernel-bridge.test.ts` | 6 — plan-select receipt gate |
| `tests/metaflow/verify.e2e.test.ts` | 1–6 — all invariants via `verifyAll` |

## File layout

```
.governance/
  authority.json          ← sovereignty marker; absence = UNGOVERNED

.roadmap/
  flows/
    INDEX.json            ← list of registered flow ids
    <id>.json             ← per-flow definition
  receipts/
    PLAN_SELECTED.json    ← pointer to active plan-select receipt
    plan-select-<hash>.json
    bypass-<ts>.json      ← bypass audit records (passed: false)
  render/
    <cmd>-<treeSha>.md    ← human-readable snapshot
    <cmd>-<treeSha>.json  ← JSON envelope (for re-render)
```

## Running verification

```bash
roadmap metaflow verify
```

Returns `ok: true` only when all 6 invariants pass.
