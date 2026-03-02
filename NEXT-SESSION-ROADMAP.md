# Next Session: Brief Quality Enforcement Mining Run

## Current State

✅ **dispatch-system-001**: Complete (9/9 nodes)
- Sealed brief orchestration system delivered
- Completion record sync fixed
- Orchestrator auto-writes records

✅ **roadmap-audit-enforcement-001**: Built but not executed
- Candidate DAG ready at `.roadmap/head.candidate.json`
- 7 agent briefs generated in `.dispatch/brief-*.json`
- Dispatch orchestrator at `.dispatch/audit-enforcement-orchestrator.sh`
- Purpose: Audit roadmap protocol/validation/batch-logic

## What Changed

**Insight:** Vague briefs waste agent tokens (discovery, debate, exploration).

**Root Cause:** Spec-kit imports produce `produces: []`, `consumes: []` → agents need to infer scope.

**Solution:** Fix the spec→brief pipeline, not just patch individual DAGs.

## Next Session Tasks

### Immediate (Next Session Start)

1. **Accept roadmap-audit-enforcement-001 candidate DAG**
   ```bash
   roadmap dag accept --note "accept mining DAG for brief quality audit"
   ```

2. **Import brief-quality-enforcement-001 spec**
   ```bash
   roadmap spec init --id brief-quality-enforcement-001
   # Move .specify/brief-quality-enforcement-001.md to .specify/specs/brief-quality-enforcement-001/spec.md
   roadmap spec generate
   roadmap spec compile
   roadmap import --spec-compiled .roadmap/spec/spec-compiled.json --id brief-quality-enforcement-001
   ```

3. **Dispatch brief-quality-enforcement-001 mining run**
   - This will audit brief quality standards
   - Implement quality validator
   - Wire into spec→brief pipeline
   - Validate all current specs

### Key Files for Next Session

| File | Purpose |
|------|---------|
| `.specify/brief-quality-enforcement-001.md` | Spec for brief quality improvement |
| `.roadmap/head.candidate.json` | roadmap-audit-enforcement-001 candidate (ready to accept) |
| `.dispatch/brief-*.json` | 7 pre-generated agent briefs (ready to run) |

### Success Metrics

After next session:
- ✅ Brief Quality Schema v2 defined
- ✅ Brief quality validator implemented
- ✅ Validator wired into spec→brief pipeline
- ✅ All specs validated against quality standard
- ✅ Documentation complete (BRIEF-QUALITY-STANDARD.md)
- ✅ Future specs automatically produce crisp briefs

## Context Handoff

**What works:**
- Dispatch-system-001 (orchestration engine)
- Spec-kit intake (spec → import → DAG)
- Completion record syncing (claim bug fixed)
- Autonomous agent briefs (generated successfully)

**What needs fixing:**
- Spec→brief quality (vague briefs waste tokens)
- Brief schema (no explicit standard)
- Spec import validation (no quality gate)

**How to continue:**
1. Accept audit-enforcement-001 DAG (infrastructure test)
2. Dispatch brief-quality-enforcement-001 (root cause fix)
3. System will improve itself automatically

## Low-Context Preamble for Next Session

```
Last session:
- Fixed dispatch-system-001 (9/9 nodes complete)
- Built roadmap-audit-enforcement-001 DAG (ready to dispatch)
- Discovered root cause: specs produce vague briefs

Next:
- Accept audit-enforcement-001 and dispatch (tests system)
- Import brief-quality-enforcement-001 spec
- Dispatch mining run to fix spec→brief pipeline
- Result: Future specs produce token-efficient briefs automatically
```

## Commands Ready to Run

```bash
# 1. Accept and dispatch audit-enforcement-001
roadmap dag accept --note "accept mining DAG"
roadmap orient --assign --owners w1,w2,w3,w4,w5,w6,w7 --note "dispatch audit mining run"

# 2. Set up brief-quality-enforcement-001
cd .specify/specs && mkdir -p brief-quality-enforcement-001
mv ../brief-quality-enforcement-001.md brief-quality-enforcement-001/spec.md
cd ../.. && roadmap spec init --id brief-quality-enforcement-001
roadmap spec generate && roadmap spec compile
roadmap import --spec-compiled .roadmap/spec/spec-compiled.json --id brief-quality-enforcement-001

# 3. Dispatch quality enforcement run
roadmap dag accept --note "accept brief-quality-enforcement-001"
# ... then dispatch agents
```

---

**End of Session Roadmap. Ready to continue next session.**
