# CLI Output Audit — Tasks

- [P0] co-audit-console-log: Replace all console.log calls in bin/roadmap.ts command functions with json() routing — human text to stderr, JSON envelope to stdout
  - produces: bin/roadmap.ts
  - consumes: src/lib/cli-envelope.ts, src/lib/cli-human.ts, src/lib/render/index.ts
  - validate: shell:npx tsx bin/roadmap.ts chart --note "validate" 2>/dev/null | jq -e '.ok' >/dev/null

- [P1] co-render-models: Build RenderModel for every stateful command missing one — advance, complete, validate, doctor, remaining, status, plan-gallery, plan-select, plan-status, certify
  - depends: co-audit-console-log
  - produces: bin/roadmap.ts
  - consumes: src/lib/cli-human.ts, src/lib/render/index.ts
  - validate: shell:npx tsx bin/roadmap.ts doctor completion 2>/dev/null | jq -e '.render.body' >/dev/null

- [P2] co-stdout-tests: Add tests verifying stdout is clean JSON for chart, doctor, remaining and that render.body is populated for all stateful commands
  - depends: co-render-models
  - produces: tests/cli-output.test.ts
  - consumes: bin/roadmap.ts, src/lib/cli-envelope.ts
  - validate: shell:npx vitest run tests/cli-output.test.ts --reporter=verbose 2>&1 | tail -1 | grep -q 'passed'

- [P2] co-integration-jq: Integration test — pipe orient, chart, doctor, remaining through jq, verify exit 0 and render.body non-empty
  - depends: co-render-models
  - produces: tests/cli-output-integration.test.ts
  - consumes: bin/roadmap.ts
  - validate: shell:npx vitest run tests/cli-output-integration.test.ts --reporter=verbose 2>&1 | tail -1 | grep -q 'passed'
