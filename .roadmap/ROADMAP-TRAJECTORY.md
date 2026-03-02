# Roadmap Trajectory: Phases 1-5

## Phase 1: Metaflows Audit & Analysis ✅
**What**: CLI quality hardening through 3 parallel audit flows  
**Nodes**: 16 (audit-initial → p50/p95 → failure detection → recovery → reports)  
**Workers**: 5  
**Output**: Mining baseline (P50=176ms), discoverability audit (46/100), audit reports  
**Key Finding**: 80% workflow abandon rate, 100% error-without-retry rate  

## Phase 2: Metaflows Optimization ✅
**What**: Apply optimizations from Phase 1 findings  
**Nodes**: 6 (3 parallel: audit-recovery, state-coherence, performance-hardening)  
**Workers**: 5  
**Output**: P50 -28%, P95 -22%, 5 validation gaps closed, 0 corruption detected  
**Key Achievement**: Deployed to production, live, SLO targets met  

## Phase 3: Metaflows Deployment & Synthesis ✅
**What**: Validate deployment, collect metrics, synthesize all 3 phases  
**Nodes**: 7 (validation → deployment → metrics → integration → synthesis → terminal)  
**Workers**: 5  
**Output**: Post-deployment metrics confirmed, 3-phase aggregate report, synthesis complete  
**Key Milestone**: Metaflows optimization program delivered  

## Phase 4: Châtelet Architecture (Keep/Packs) ✅
**What**: Refactor monolith into minimal keep + discoverable packs  
**Nodes**: 17 (init → infrastructure → core modules → CLI commands → gates → packs → acceptance)  
**Workers**: 5  
**Output**: 
- Keep: 250-file budget, 25k LOC max, gated on main
- Packs: Protocol (26%), Intake (7%), Metaflow (41%), Stubs (26%)
- CLI: chatelet-status, packs list/show/extract, migration-planner
- CI gates: keep-budget enforcement, pack-manifest validation
- gitSafe: read-only bounded git access (listRefs, readBlob, lsTree, diffPaths)

**Key Radical Shift**: From monolithic optimization → declarative agent-queryable system

## Phase 5: Châtelet Enrichment via Spec-Kit (Planned)
**What**: Formalize Phase 4 sketch into production-ready system via spec-kit intake  
**Nodes**: ~40-50 (constitution → specify → plan → tasks → execution)  
**Batches**: 8-10 (unit tests → integration tests → docs → hardening → templates → validation)  
**Workers**: 5  
**Expected Output**:
- 90%+ test coverage (unit + integration + CLI)
- Comprehensive docs (CHATELET.md, migration playbook, troubleshooting)
- Performance + security audits
- Pack ecosystem template + boilerplate
- Full receipt + audit trail implementation

**Key Enrichment**: Rough sketch → production-grade system  

---

## Vision Across All Phases

| Phase | Focus | Paradigm | Output |
|-------|-------|----------|--------|
| **1-2-3** | CLI Quality | Optimization of monolith | Latency -28%, live in production |
| **4** | Architecture | Refactor into keep/packs | Declarative, agent-queryable |
| **5** | Formalization | Spec-kit enrichment | Production-ready, 90% test coverage |

---

## The Progression

**Phase 1-3**: "Make the CLI fast and reliable"  
→ Result: Optimized monolith, deployed, metrics confirmed

**Phase 4**: "Rearchitect for agents and humans"  
→ Result: Keep is minimal, packs are discoverable, gitSafe is bounded

**Phase 5**: "Formalize it properly"  
→ Result: Production-grade system, full test coverage, comprehensive docs

---

## Next Opportunity After Phase 5

**Phase 6+: Pack Ecosystem Expansion**
- Separate `@roadmap/protocol` → `packs/protocol/`
- Separate `@roadmap/intake` → `packs/intake/`
- Separate `@roadmap/metaflow` → `packs/metaflow/`
- Build domain-specific packs (spec-kit, donjon, regent, etc.)
- LLM agents can work on packs in parallel without coordination

---

**Timeline**: Phase 1-4 complete (6 hours swarm time), Phase 5 ready (2 hours swarm time)

**State**: Châtelet architecture rough sketch in place. Ready for spec-kit intake to formalize.
