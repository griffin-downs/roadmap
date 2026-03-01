# dag-candidate tasks

## Tasks

- [P0] dc-candidate-writer: CandidateEnvelope type + writeCandidateDAG() + loadCandidate() + computeHeadSha() in src/lib/dag-candidate.ts
  - produces: src/lib/dag-candidate.ts
  - validate: shell: npx tsc --noEmit

- [P1] dc-import-candidate: Modify cmdImport to write head.candidate.json via writeCandidateDAG() instead of direct head.json overwrite. Block if candidate exists (--replace-candidate to override).
  - depends: dc-candidate-writer
  - consumes: src/lib/dag-candidate.ts
  - produces: bin/roadmap.ts
  - validate: shell: npx tsc --noEmit

- [P1] dc-expand-candidate: Modify cmdExpand to write candidate via env var ROADMAP_CANDIDATE_PATH instead of direct head.json mutation. Expansion script reads/writes candidate path.
  - depends: dc-candidate-writer
  - consumes: src/lib/dag-candidate.ts
  - produces: bin/roadmap.ts
  - validate: shell: npx tsc --noEmit

- [P1] dc-diff: Implement `roadmap dag diff` command — structural diff between head.json and head.candidate.json. Reports added/removed/changed nodes, batch shifts, conflicts, staleness.
  - depends: dc-candidate-writer
  - consumes: src/lib/dag-candidate.ts
  - produces: bin/roadmap.ts
  - validate: shell: npx tsc --noEmit

- [P2] dc-accept: Implement `roadmap dag accept --note "..."` — stale check, validate, promote candidate to head.json, delete candidate + overlay, write receipt, git commit.
  - depends: dc-import-candidate, dc-expand-candidate, dc-diff
  - consumes: src/lib/dag-candidate.ts
  - produces: bin/roadmap.ts
  - validate: shell: npx tsc --noEmit

- [P2] dc-reject: Implement `roadmap dag reject --note "..."` — delete candidate, write receipt, no head.json change.
  - depends: dc-import-candidate, dc-expand-candidate
  - consumes: src/lib/dag-candidate.ts
  - produces: bin/roadmap.ts
  - validate: shell: npx tsc --noEmit

- [P3] dc-tests: Test suite covering all 8 acceptance scenarios (S1-S8). Unit tests for dag-candidate.ts, integration tests for CLI commands.
  - depends: dc-accept, dc-reject, dc-diff
  - consumes: src/lib/dag-candidate.ts, bin/roadmap.ts
  - produces: tests/dag-candidate.test.ts
  - validate: shell: npx vitest run tests/dag-candidate.test.ts
