# Design Brief: spec-threading-feature

## Problem

Init and terminal intent gates operate independently. Init gate validates plan clarity (structural: vague produces, unresolvable consumes, missing validate). Terminal gate validates DAG invariants (structural: expandOnFail present on terminals). Neither produces a machine-readable contract that links **what init discovered** to **what terminal should verify at runtime**.

Consequence: a plan can pass init clarity check, execute to completion, and pass terminal structural check — while the actual built artifact diverges from the clarified intent. The bookend gates are structurally sound but semantically disconnected.

## Proposed Solution

**spec-clarified.json** — a machine-readable contract produced by init gate, consumed by terminal gate.

### Data Flow

```
PlanClarityGap[] (from validatePlanClarity)
  |
  v
generateClarifiedSpec(dag, gaps)        -- src/lib/spec-generator.ts
  |
  v
spec-clarified.json                     -- artifact, consumes/produces boundary
  |
  v
explore-validate-contract.ts            -- scripts/, reads spec + connects CDP
  |
  v
ObservationResult[]                     -- from explore-helpers.ts
  |
  v
verifyObservationsAgainstContract()     -- src/lib/spec-verifier.ts
  |
  v
VerificationResult { passed, matched, failed, failures[] }
```

### Contract Schema (SpecClarifiedJson)

```typescript
interface SpecFeature {
  id: string;                          // e.g. "crud-add"
  selector?: string;                   // CSS selector for UI observation
  observation: 'visible' | 'interactive' | 'contrast' | 'count' | 'text';
  expected?: string | number;          // e.g. minRatio: 4.5 for contrast
  evidence: string;                    // provenance: why this feature matters
}

interface SpecClarifiedJson {
  features: SpecFeature[];
  gaps: PlanClarityGap[];             // unresolved gaps (should be empty at term)
  confidence: number;                  // 0.0-1.0
  generated: string;                   // ISO-8601
}
```

### Type Locations

New types go in `src/protocol.ts` (canonical type source):
- `SpecFeature`
- `SpecClarifiedJson`
- `VerificationResult`

## New Modules

| File | Purpose | Exports |
|------|---------|---------|
| `src/lib/spec-generator.ts` | Gap-to-feature conversion | `generateClarifiedSpec()` |
| `src/lib/spec-verifier.ts` | Observation-to-contract matching | `verifyObservationsAgainstContract()` |
| `src/lib/validate-terminal-gate-spec.ts` | Wire spec verifier into terminal gate | `validateTerminalGateSpec()` |
| `scripts/explore-validate-contract.ts` | Explore script template | (CLI script) |

## Acceptance Scenarios

### S1: Spec Generation

**Given** a DAG with PlanClarityGap[] containing VagueProduces for "database"
**When** `generateClarifiedSpec(dag, gaps)` is called
**Then** spec-clarified.json contains concrete SpecFeature entries with selectors derived from the clarified produces (e.g. "auth.ts" -> selector heuristic for auth UI)
**And** confidence reflects gap resolution quality

### S2: Contract Verification — Pass

**Given** a spec-clarified.json with 3 features (visible input, interactive checkbox, contrast ratio)
**When** `verifyObservationsAgainstContract(spec, observations)` is called with matching ObservationResult[]
**Then** result.passed === true, result.matched === 3, result.failed === 0

### S3: Contract Verification — Fail

**Given** a spec-clarified.json with features
**When** observations fail to match (selector not found, contrast below threshold)
**Then** result.passed === false, result.failures[] contains { id, expected, actual, evidence }

### S4: E2E — Vague Plan to Verified Output

**Given** a vague plan with unclear produces
**When** init gate extracts clarity gaps, generates spec, terminal gate verifies
**Then** the full pipeline produces a VerificationResult
**And** failing verification triggers expansion (via existing expandOnFail mechanism)

### S5: Terminal Integration

**Given** terminal gate node consumes spec-clarified.json
**When** roadmap propagate runs
**Then** spec-clarified.json is auto-required as input (artifact-exists derived)

### S6: Unmatched Observations

**Given** spec features that have no corresponding observation result
**When** verifyObservationsAgainstContract runs
**Then** unmatched features appear in failures with reason "no-observation"

## Risks

1. **Selector heuristic quality**: Mapping file paths to CSS selectors is inherently lossy. A file like `auth.ts` doesn't directly imply a selector. Mitigation: allow manual selector override in the spec feature, use file-path-based heuristics only as fallback.

2. **Observation type coverage**: Current explore-helpers support 9 observation types (visibility, text, style, size, count, attribute, class, contrast, overflow). The SpecFeature.observation enum must be a subset of these. Gap: no "interactive" observation type exists in explore-helpers — it checks visibility, not interactability.

3. **Confidence propagation**: The spec's confidence score is set at generation time. If downstream work improves the plan but doesn't regenerate the spec, confidence is stale. Mitigation: regenerate spec on re-expansion.

4. **CDP dependency for verification**: explore-validate-contract.ts requires a running app with CDP. Pure unit tests must mock the observation layer. The E2E test needs a test harness or mock CDP.

## Open Questions

1. Should `generateClarifiedSpec` be idempotent? If run twice on the same gaps, should it produce identical output? (Proposed: yes, deterministic from inputs.)

2. Should spec-clarified.json be committed to git or treated as ephemeral build artifact? (Proposed: committed — it's the contract boundary between bookends, needs to be auditable.)

3. Should the spec verifier support partial pass (some features pass, some fail) or is it all-or-nothing? (Proposed: partial — report matched/failed counts, let caller decide threshold.)

## Suggested Sub-Tasks (Expansion Nodes)

The `.roadmap/spec-threading.json` already defines 8 execute nodes. Verified against FR doc:

| Node | Purpose | Produces | Dependencies |
|------|---------|----------|-------------|
| `clarify-to-contract` | generateClarifiedSpec() + SpecClarifiedJson types | spec-clarified.json | init |
| `spec-contract-tests` | Unit tests for spec generation | tests/spec-contract.test.ts | clarify-to-contract |
| `verify-against-contract` | verifyObservationsAgainstContract() | src/lib/spec-verifier.ts | clarify-to-contract |
| `verifier-tests` | Unit tests for spec verification | tests/spec-verifier.test.ts | verify-against-contract |
| `explore-script-template` | CDP explore script reading spec | scripts/explore-validate-contract.ts | verify-against-contract |
| `terminal-gate-update` | Wire spec verifier into terminal gate | src/lib/validate-terminal-gate-spec.ts | verify-against-contract |
| `e2e-spec-threading` | Full pipeline test | tests/spec-threading-e2e.test.ts | clarify-to-contract, verify-against-contract, terminal-gate-update |
| `spec-docs` | FR doc update (already exists, needs update) | docs/FR-SPEC-THREADING.md | clarify-to-contract, verify-against-contract |

**Recommendation**: Expand `spec-threading-feature` using `.roadmap/spec-threading.json` as the expansion script input. The 8 nodes satisfy `minNodes: 8` from the expanded validation rule. DAG structure is sound — no cycles, proper consumes/produces threading, test nodes gate on shell validators.

### Parallelism

Batch structure from the spec-threading.json DAG:
- **Batch 0**: init
- **Batch 1**: clarify-to-contract (sole dependency on init)
- **Batch 2**: spec-contract-tests, verify-against-contract (parallel, both depend on batch 1)
- **Batch 3**: verifier-tests, explore-script-template, terminal-gate-update (parallel, all depend on batch 2)
- **Batch 4**: e2e-spec-threading, spec-docs (parallel, depend on batches 1-3)
- **Batch 5**: term

Max parallelism: 3 (batch 3). Total critical path: 5 batches.
