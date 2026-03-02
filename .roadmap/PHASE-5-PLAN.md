# Phase 5: Châtelet Enrichment (Spec-Kit Intake)

**Status**: Planned (ready to execute)  
**Prerequisite**: Phase 4 complete ✅  
**Branch**: chatelet-p5 (to be created)  

## Overview

Phase 4 delivered a **rough sketch** of the Châtelet architecture:
- Core modules (gitsafe, keepbudget, CLI commands)
- Basic CI gates
- First pack stub
- Acceptance tests (minimal)

Phase 5 will **formalize and enrich** this via spec-kit intake:

```
FR-CHATELET-001.spec.md → constitution → specify → plan → tasks.md → chatelet-enriched.dag.json
```

## Why Spec-Kit?

- **Completeness**: Constitution + specify phases will expose gaps (missing scenarios, edge cases)
- **Traceability**: Every task maps to a spec scenario
- **Parallelism**: Plan phase will identify independent work units
- **Richness**: Full test coverage, docs, production hardening baked in

## Phases

### P5.0: Spec-Kit Intake (1 batch, 1-2 hours)
- Constitution: Clarify FR-CHATELET-001 intent + acceptance scenarios
- Specify: Extract domains (gitsafe, keepbudget, CLI, packs, gates, migration, observability)
- Plan: Identify parallel work batches + dependencies
- Output: tasks-chatelet-001.md + chatelet-enriched.dag.json

### P5.1-P5.N: Execution (8-10 batches, ~2 hours with 5-worker swarm)

**P5.1**: Unit test suites (gitsafe contract, keepbudget validator, CLI commands)  
**P5.2**: Integration tests (keep audit, packs discovery, denied reads, CI gates)  
**P5.3**: Documentation (CHATELET.md, migration playbook, troubleshooting)  
**P5.4**: Production hardening (performance benchmarks, security audit, observability)  
**P5.5**: Pack ecosystem template + boilerplate  
**P5.6**: Acceptance validation + sign-off  

## Acceptance Criteria (Phase 5 Terminal)

- ✅ Spec-kit intake produced tasks.md + DAG
- ✅ All Phase 4 acceptance criteria still pass (backward compat)
- ✅ 90%+ test coverage (unit + integration + CLI)
- ✅ Comprehensive documentation (dev guide, API reference, migration guide)
- ✅ Main branch enforces KeepBudget via CI gates
- ✅ packs/core fully documented and usable standalone
- ✅ Migration path from monolith → Châtelet ready (plan-only mode working)
- ✅ Performance + security audit passed
- ✅ Receipt format + audit trail implemented

## Expected Deliverables

```
.specify/specs/fr-chatelet-001/
├── spec.md (formalized)
├── constitution.md (intent + scenarios)
└── tasks.md (executable nodes)

.roadmap/
└── head.json (chatelet-enriched DAG, 40-50 nodes)

src/lib/gitsafe/
├── index.ts (core module)
└── __tests__/
    ├── contract.test.ts
    ├── integration.test.ts
    └── performance.test.ts

src/cli/commands/
├── chatelet-status.ts
├── packs-list.ts
├── packs-show.ts
├── packs-extract.ts
├── chatelet-migrate.ts
└── __tests__/ (all with CLI envelope + human renderer tests)

docs/
├── CHATELET.md (architecture guide)
├── MIGRATION.md (step-by-step playbook)
├── TROUBLESHOOTING.md (violations + fixes)
└── API.md (CLI command reference)

.chatelet/
├── CHATELET.json (final config, validated)
├── acceptance-results.json
└── performance-benchmarks.json
```

## Next Action

**When ready to execute Phase 5:**
```bash
git branch chatelet-p5
git checkout chatelet-p5

# Run spec-kit intake on FR-CHATELET-001 spec
roadmap import --from speckit fr-chatelet-001 --to chatelet-enriched

# Spawn 5-worker swarm for execution
# Phase 5 runtime: ~2 hours
```

---

**Current State**: Phase 4 complete, Phase 5 planned, ready to formalize via spec-kit.
