# Codebase Structure Guide

After `dir-refactor-001` reorganization (2026-03-01)

## Overview

The codebase has been reorganized into semantic domains to reduce cognitive load and improve navigation:

- **Domains**: 15 semantic groupings (protocol, intent, audit, claims, evidence, etc.)
- **File Size**: All code files ≤ 400 lines (max constraint met)
- **Directory Structure**: Most directories ≤ 10 files (see exceptions below)
- **Barrel Exports**: All domains re-export via `index.ts` for backward compatibility

## Directory Map

### Core Infrastructure

**src/lib/protocol/**
- Core DAG types, validation, operations
- Files: types.ts, schema.ts, operations.ts, validation.ts, index.ts
- Exports: `NodeSpec`, `Graph`, `Orientation`, validation functions

**src/lib/core/**
- Core DAG execution operations
- Files: orient-cached.ts, orient-schema.ts, index.ts
- Exports: orientation caching, schema utilities

**src/lib/utils/**
- Utilities: git, cluster, federation, tokens
- Structure: `{git,cluster,federation,tokens}/index.ts` + files
- git/: git.ts, git-index.ts, git-state.schema.ts
- cluster/: cluster.ts, solver.ts, cost-model.ts (split from cluster-solver.ts)
- federation/: federation.ts
- tokens/: token-store.ts, token-index.ts

### Domain Layers

**src/lib/audit/**
- Code and analysis auditing
- Files: trail.ts (renamed from audit.ts), ingest.ts, recommend.ts, index.ts
- Tests: tests/audit/

**src/lib/claims/**
- Claim rendering and validation
- Files: claims.ts, index.ts
- Tests: tests/claims/

**src/lib/evidence/**
- Work proof collection and validation
- Files: schema.ts, collect.ts, index.ts
- Tests: tests/evidence/

**src/lib/intent/**
- Intent expansion, evaluation, gates
- Files: intent-expansion.ts (kept but consider split), intent-evaluator.ts, intent-gate-enrichment.ts, expansion/{detection,gaps,proposals}.ts, index.ts
- Tests: tests/intent/

**src/lib/metaloop/**
- Iteration orchestration and metaloop management
- Files: evidence-integration.ts, index.ts
- Tests: tests/metaloop/

**src/lib/metaflow/**
- Execution phases and orchestration (23 files, internal structure)
- Subdirs: phases/, state/, execution/
- phases/: miner.ts, mine-run.ts, opt-dag.ts, flows.ts, flow-schema.ts
- state/: active-run.ts, session-store.ts
- execution/: wrap.ts, self-insert.ts, receipt-writer.ts, render-receipt.ts, guards.ts, audit/ (detectors)
- Barrel: metaflow/index.ts

**src/lib/render/**
- Output rendering and template management (11 files, internal structure)
- Files: render/*, templates/*, index.ts
- Barrel: render/index.ts

**src/lib/intake/**
- Import, parsing, spec handling (11 files)
- Files: intake.ts, intake-cmd.ts, intake-receipt.ts, intake-cluster.ts, speckit-import.ts, spec-{generator,ir,origin,verifier}.ts, auto-intake.ts, index.ts
- Exports: import engines, spec validation

**src/lib/completion/**
- Work tracking and completion storage
- Files: completion-context.ts, completion-store.ts, completion-tracker.ts, index.ts
- Tests: tests/completion/

**src/lib/exploration/**
- Visual element exploration and interaction helpers
- Files: visibility.ts, text.ts, style.ts, size.ts (split from explore-helpers.ts 735 lines)
- Files: click.ts, type.ts, drag.ts, wait.ts (split from explore-interactions.ts 509 lines)
- Files: runtime.ts (renamed from runtime-explore.ts)
- Exports: observation patterns, interaction helpers

**src/lib/recipes/**
- Instruction/proposal generators
- Subdirs: dispatch/, merge/, patch/, plan/, overlay/, spawn/
- dispatch/: dispatch.ts, dispatch-receipt.ts
- merge/: merge-gate.ts, merge-gate-cmd.ts
- patch/: patch-stack.ts, patch-stack-cmd.ts
- plan/: plan-gate.ts
- overlay/: overlay.ts, overlay-cmd.ts
- spawn/: spawn-plan.ts
- Barrel: recipes/index.ts

**src/lib/config/**
- Configuration, kernel enforcement, rate-card
- Files: kernel-config.ts, kernel-enforcement.ts, rate-card.ts, system-prompt.ts (split from compile-prompts.ts), context-prompt.ts (split), index.ts
- Exports: kernel config, rate calculations, prompt templates

**src/lib/strategies/**
- Specialization and strategic customization
- Files: strategy-overlay.ts, index.ts
- Also references: src/lib/strategy/ and src/lib/sgk/ (specialization kit)

### Validation & Verification

**src/lib/verify/** (split from verify.ts 578 lines)
- graph-algorithms.ts: DAG algorithms, cycle resolution
- orchestrator.ts: orchestration and execution
- index.ts (barrel)

**src/lib/validation/** (if organized)
- validate-dag.ts, validate-node.ts, validate-batch.ts, validation.ts
- Also: invariants/metaloop-evidence.ts

### Utilities Remaining in src/lib Root

⚠️ **Consolidation Opportunity**: 56 utility files still in `src/lib/` root:
- Build/generation: auto-integrate*.ts, build-discoverer.ts, compile-brief.ts, emit-gallery.ts, gallery.ts, install-skills.ts
- Blending/Optimization: blend*.ts, cost-estimator.ts, friction-engine.ts, plan-overlay.ts, plan-selection.ts
- General utilities: algo-report.ts, batch-conflicts.ts, brief.ts, cross-orient.ts, dag-candidate.ts, dependency-resolver.ts, env-audit.ts, escape-detector.ts, expansion-writer.ts, god-engineer-prompt.ts, governance-breach.ts, handoff.ts, hook-scope.ts, judgment-receipt.ts, migrations.ts, propagate.ts, receipts-ux.ts, receipt-types.ts, scaffold.ts, schedule.ts, trail-metrics.ts, ts-sandbox.ts, versioning*.ts

These could be further consolidated into:
- `src/lib/tools/` (build, blend, optimize)
- `src/lib/utilities/` (remaining helpers)

## Size Constraints

**File Size**: All code files ≤ 400 lines ✅
- Max: src/lib/intent/expansion/proposals.ts (364 lines)
- Average: ~180 lines per file
- Exceptions: Test files, data files (.schema.ts, .receipt.json)

**Directory Size**: Most directories ≤ 10 files
- Exception: src/lib root (57 files - see consolidation opportunity above)
- Exception: src/ root (26 files - CLI, IO, tests, protocols)
- Exception: src/lib/intake (11 files - imports/parsing)
- Exception: src/lib/metaflow (11 files - organized into 3 subdirs with 2-6 files each)
- Exception: src/lib/render (11 files - internal organization)

## Barrel Exports

All domains maintain backward compatibility via barrel exports (`index.ts`):

```typescript
// src/lib/index.ts — main entry point
export * from './protocol/index.js';
export * from './audit/index.js';
export * from './claims/index.js';
// ... etc for all domains
```

Existing code using `import { X } from 'roadmap/lib'` continues to work.

## Import Examples

**Old style** (still works):
```typescript
import { NodeSpec } from 'roadmap/lib';
```

**New style** (more explicit):
```typescript
import { NodeSpec } from 'roadmap/lib/protocol';
```

Both patterns work due to barrel exports.

## Testing Organization

Tests follow codebase structure:

```
tests/
  audit/
  claims/
  evidence/
  intent/
  metaloop/
  completion/
  exploration/
  utils/
  ... (one dir per domain)
```

Run tests by domain: `npm run test -- tests/audit/`

## Adding New Files

1. **Identify domain**: Which semantic area does the file belong to?
   - If none fit, consider if it needs its own domain (add to `src/lib/` root)
   - Or if it's a utility that should live with others

2. **Place in appropriate directory**:
   - Domain code → `src/lib/DOMAIN/`
   - Tests → `tests/DOMAIN/`

3. **Update barrel export**: Add to `src/lib/DOMAIN/index.ts`

4. **Keep file size ≤ 400 lines**: If growing beyond, split into focused modules

5. **Update main index**: If new domain, add to `src/lib/index.ts`

## Refactoring History

**dir-refactor-001** (2026-03-01):
- Phase 1: Audit (directory structure, file sizes)
- Phase 2: Core infrastructure (protocol, core, utils → 8 teams)
- Continuation: Remaining domains (recipes, exploration, intake, completion, config, strategies)
- Continuation: File splits (explore-helpers, explore-interactions, cluster-solver, compile-prompts, verify, intent-expansion)
- Continuation: Internal organization (metaflow, render)

**Commits**:
- L02 batch: 7 commits (audit, claims, evidence, intent, metaloop, protocol, core, utils)
- Continuation: 12+ commits (recipes, exploration splits, intake, completion, config, strategies, compile-prompts split, verify split, intent-expansion split, metaflow org)

**Stats**:
- Files moved: ~140
- Files split: 6 (reducing oversized modules)
- Domains created: 15
- Barrel exports: 18
- Tests passing: 279
- tsc: clean

## Future Work

**Phase 2 (Consolidation)**:
- Move 56 utility files from src/lib root into `src/lib/tools/` or `src/lib/utilities/`
- Reduce src root from 26 → 10 files (move CLI, IO, test helpers)
- This would achieve "perfect" directory structure (all dirs ≤ 10 files)

**Phase 3 (Test Organization)**:
- Mirror test structure to match src/ organization exactly
- Consolidate test setup and fixtures

## Notes

- All imports are TypeScript `.ts` files (no need for `.js` extensions in source)
- Barrel exports use `.js` extensions for ESM compatibility (in compiled output)
- Schema files (`.schema.ts`) are data definitions, not included in file size limits
- Generated files are not subject to size/structure constraints
