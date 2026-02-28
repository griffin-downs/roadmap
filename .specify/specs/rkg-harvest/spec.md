# RKG-7/8 Feature Specification

## Feature Specification

### All acceptance scenarios pass (User Stories 1-6)

**Given** a git range with commits not touching .roadmap/
**When** `roadmap intake absorb --from <sha> --to <sha>` runs
**Then** an IntakeRecord is written to .roadmap/intake/<id>.json with deterministic inputHash

**Given** an intake artifact exists at .roadmap/intake/<id>.json
**When** `roadmap plan overlay --from-intake <id>` runs
**Then** .roadmap/overlays/intake-<id>.json is written with candidateNodes and head.json is NOT mutated

**Given** a set of node IDs and a base SHA
**When** `roadmap patch stack --nodes <ids> --base <sha>` runs
**Then** branches rm/stack/<patchId>/<n>-<nodeId> are created and the same inputs produce the same diff on rerun

**Given** a missing plan-select receipt
**When** `roadmap gate merge` runs
**Then** it exits non-zero with MergeGateResult.errors containing actionable fix[] entries

**Given** SKIP_PLAN_GATE=1 is set in the environment
**When** `roadmap env-audit` runs
**Then** it exits non-zero listing the deprecated variable and its kernel.json replacement key

**Given** a regent transcript with cross-index contamination events
**When** `roadmap audit ingest <path>` then `roadmap audit recommend` runs
**Then** frictionScore > 0 and an index-isolation recommendation is emitted with a governance-breach receipt
