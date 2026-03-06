---
name: report-validation
description: Agent playbook — structured report validation gate behavior
test-source: test/report-validation-meta.test.ts
graph-source: (none)
compiled: false
inv-ids:
  - INV-REPORT-001
  - INV-REPORT-002
  - INV-REPORT-003
  - INV-REPORT-004
  - INV-REPORT-005
---

# Report Validation Gate — Agent Playbook

Tests agent-observable behavior of the structured report validation gate.
The intent gate on terminal nodes requires a completion report with 6 named
sections. This playbook verifies the gate rejects malformed reports with
actionable section-level errors and accepts well-formed reports.

## Invariants

| ID | Statement |
|----|-----------|
| INV-REPORT-001 | Report must contain all 6 required section headers |
| INV-REPORT-002 | Each section must be non-empty (header present but no content = reject) |
| INV-REPORT-003 | Freeform text without section headers is rejected |
| INV-REPORT-004 | Valid structured report passes the intent gate |
| INV-REPORT-005 | Rejection error names specific missing/empty sections |

## Setup

Scaffold a temp repo with a report-gated terminal node.

<!-- RESULT: pass -->
```skill
rm -rf $RUN_DIR/repo && mkdir -p $RUN_DIR/repo && cd $RUN_DIR/repo && git init -b main && git commit --allow-empty -m "init" && mkdir -p .roadmap && echo '{"id":"pb","desc":"playbook DAG","init":"init","term":"term","nodes":{"init":{"id":"init","desc":"root","produces":[],"consumes":[],"deps":[],"validate":[],"idempotent":true},"term":{"id":"term","desc":"report-gated terminal","produces":[],"consumes":[],"deps":["init"],"validate":[{"type":"intent","statement":"Work complete","confidence":0.8,"evaluator":"self","prompt":["Provide a completion report:\n1. COMMIT STATUS: Are all produces committed?\n2. TEST EVIDENCE: What tests ran?\n3. UNVALIDATED ASSUMPTIONS: What has no validator?\n4. FAILURE SURFACE: What would break?\n5. SCOPE DECISIONS: What was excluded?\n6. AUDIT TRAIL: What artifacts exist?"]}],"idempotent":true}},"version":"0.3.0","protocolVersion":"0.3.0"}' > .roadmap/head.json && echo '[]' > .roadmap/completed.json && echo '{"schemaVersion":1,"engine":"spec-kit","version":"1.0.0","compile_hash":"h","spec_sha":"s","importedAt":"2026-01-01","dagId":"pb"}' > .roadmap/spec-origin.json && echo '{"passed":true}'
```

## Step 1: Advance init

<!-- RESULT: pass -->
```skill
cd $RUN_DIR/repo && npx tsx /home/griffin/src/.dev/roadmap/bin/roadmap.ts advance init --note "playbook" 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(JSON.stringify({passed:d.ok===true,completed:d.data?.completed}))"
```

## Step 2: INV-REPORT-003 — Freeform prose rejected

Agent provides confident judgment but freeform answer without section headers.
Gate must reject with "report validation failed".

<!-- RESULT: fail -->
```skill
cd $RUN_DIR/repo && echo '[{"statement":"Work complete","confidence":0.95,"reasoning":"done","promptAnswers":["Everything is done and all tests pass."]}]' > $RUN_DIR/freeform.json && npx tsx /home/griffin/src/.dev/roadmap/bin/roadmap.ts advance term --evaluate-file $RUN_DIR/freeform.json --note "freeform" 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const err=JSON.stringify(d); const hasSectionError=err.includes('report validation failed'); console.log(JSON.stringify({passed:hasSectionError,detail:d.error?.checks?.[0]?.evidence??'no evidence'}))"
```

## Step 3: INV-REPORT-001 + INV-REPORT-005 — Missing sections named

Agent provides only 2 of 6 sections. Error must name the 4 missing sections.

<!-- RESULT: fail -->
```skill
cd $RUN_DIR/repo && echo '[{"statement":"Work complete","confidence":0.95,"reasoning":"done","promptAnswers":["1. COMMIT STATUS: done.\n2. TEST EVIDENCE: passed."]}]' > $RUN_DIR/partial.json && npx tsx /home/griffin/src/.dev/roadmap/bin/roadmap.ts advance term --evaluate-file $RUN_DIR/partial.json --note "partial" 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const err=JSON.stringify(d); const names=['UNVALIDATED ASSUMPTIONS','FAILURE SURFACE','SCOPE DECISIONS','AUDIT TRAIL']; const allNamed=names.every(n=>err.includes(n)); console.log(JSON.stringify({passed:allNamed,missing:names.filter(n=>!err.includes(n))}))"
```

## Step 4: INV-REPORT-002 — Empty section rejected

All 6 headers present but FAILURE SURFACE has no content after the colon.

<!-- RESULT: fail -->
```skill
cd $RUN_DIR/repo && echo '[{"statement":"Work complete","confidence":0.95,"reasoning":"done","promptAnswers":["1. COMMIT STATUS: done.\n2. TEST EVIDENCE: passed.\n3. UNVALIDATED ASSUMPTIONS: none.\n4. FAILURE SURFACE:\n5. SCOPE DECISIONS: none.\n6. AUDIT TRAIL: logs."]}]' > $RUN_DIR/empty-section.json && npx tsx /home/griffin/src/.dev/roadmap/bin/roadmap.ts advance term --evaluate-file $RUN_DIR/empty-section.json --note "empty-section" 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const err=JSON.stringify(d); const hasEmpty=err.includes('empty') && err.includes('FAILURE SURFACE'); console.log(JSON.stringify({passed:hasEmpty,detail:d.error?.checks?.[0]?.evidence??'no evidence'}))"
```

## Step 5: INV-REPORT-004 — Valid report accepted

Agent provides a well-formed report with all 6 sections non-empty.

<!-- RESULT: pass -->
```skill
cd $RUN_DIR/repo && echo '[{"statement":"Work complete","confidence":0.95,"reasoning":"All sections present","promptAnswers":["1. COMMIT STATUS: All committed at abc123.\n2. TEST EVIDENCE: 29/29 vitest pass.\n3. UNVALIDATED ASSUMPTIONS: None.\n4. FAILURE SURFACE: Empty string to validateReport.\n5. SCOPE DECISIONS: Deferred telemetry.\n6. AUDIT TRAIL: trail.jsonl, completed.json."]}]' > $RUN_DIR/valid.json && npx tsx /home/griffin/src/.dev/roadmap/bin/roadmap.ts advance term --evaluate-file $RUN_DIR/valid.json --note "valid" 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(JSON.stringify({passed:d.ok===true,completed:d.data?.completed}))"
```
