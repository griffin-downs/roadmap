// Adversarial hardening phase — cycle 2 from bootstrap-complete state.
//
// Two lanes:
//   Adversarial (spec-first): test files specifying correct behavior, may expose known bugs.
//   Constructive (fix-driven): protocol.ts fixes + decision docs satisfying adversarial specs.
//
// Reconcile point: adv-property → consumer-integration (forward produces meets backward consumes).
//
// Validate: tsc --noEmit
// Run:      node --experimental-strip-types roadmap.ts

import { define, check, verify, reconcile, graph } from './src/protocol.ts';

const roadmap = define(graph({
  id: 'roadmap-adversarial',
  desc: 'DAG expansion protocol — adversarial hardening: spec-first bugs, property tests, consumer validation',
  init: 'init',
  term: 'term',
  nodes: {
    init: {
      id: 'init',
      desc: 'Library core + seed tests + self-referential roadmap + expansion skill',
      produces: ['src/protocol.ts', 'tests/protocol.test.ts', 'roadmap.ts', 'SKILL.md'],
      consumes: [],
      deps: [],
    },

    // --- SESSION ENTRY GATE ---
    // reorient produces a gitignored receipt. Always missing at session start.
    // orient() positions here first. boot.ts creates the receipt after checks pass.
    // All pending work nodes depend on this — nothing executes without a valid boot.

    reorient: {
      id: 'reorient',
      desc: 'Session entry gate: run boot.ts, verify orientation, confirm position, choose mode',
      produces: ['.boot/session-receipt.json'],
      consumes: [],
      deps: ['adv-reconcile', 'adv-orient'],
    },

    // --- ADVERSARIAL LANE (spec-first) ---

    'adv-reconcile': {
      id: 'adv-reconcile',
      desc: 'Adversarial spec: reconcile gap.missing = unmet consumes only, not surplus produces',
      produces: ['tests/adv-reconcile.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-orient': {
      id: 'adv-orient',
      desc: 'Adversarial spec: orient empty-produces stalls permanently — specify correct behavior',
      produces: ['tests/adv-orient.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-property': {
      id: 'adv-property',
      desc: 'Property-based: for all valid graphs, order()→orient() consistent, check()→verify() agree',
      produces: ['tests/adv-property.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['reorient'],
    },
    'adv-types': {
      id: 'adv-types',
      desc: 'Type-level: invalid dep refs, id/key mismatch, unknown nodes are tsc errors',
      produces: ['tests/adv-types.test-d.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['reorient'],
    },

    // --- CONSTRUCTIVE LANE (fix-driven) ---

    'fix-reconcile': {
      id: 'fix-reconcile',
      desc: 'Fix reconcile gap: missing = bn.consumes.filter(c => !fn.produces.includes(c))',
      produces: ['docs/decisions/reconcile-gap.md'],
      consumes: ['src/protocol.ts', 'tests/adv-reconcile.test.ts'],
      deps: ['adv-reconcile', 'reorient'],
    },
    'fix-orient': {
      id: 'fix-orient',
      desc: 'Fix orient empty-produces: !node.produces.length || node.produces.every(exists)',
      produces: ['docs/decisions/orient-empty-produces.md'],
      consumes: ['src/protocol.ts', 'tests/adv-orient.test.ts'],
      deps: ['adv-orient', 'reorient'],
    },

    // --- CONSUMER VALIDATION ---

    'consumer-integration': {
      id: 'consumer-integration',
      desc: 'Consumer smoke test: install from path, write minimal roadmap.ts, orient() from real filesystem',
      produces: ['tests/consumer-integration.test.ts'],
      consumes: [
        'src/protocol.ts',
        'roadmap.ts',
        'SKILL.md',
        'tests/adv-property.test.ts',
        'docs/decisions/reconcile-gap.md',
        'docs/decisions/orient-empty-produces.md',
      ],
      deps: ['fix-reconcile', 'fix-orient', 'adv-property'],
    },

    'phase-1-term': {
      id: 'phase-1-term',
      desc: 'Phase 1 complete: adversarially hardened protocol core (bugs fixed, contracts proven)',
      produces: [],
      consumes: [
        'tests/adv-reconcile.test.ts',
        'tests/adv-orient.test.ts',
        'tests/adv-property.test.ts',
        'tests/adv-types.test-d.ts',
        'tests/consumer-integration.test.ts',
      ],
      deps: ['consumer-integration', 'adv-types'],
    },

    // --- PHASE 2: DAG merge operations ---

    'merge-spec': {
      id: 'merge-spec',
      desc: 'Spec: merge(g1, g2, connections) combines DAGs at reconcile() join points — init/term unification strategy',
      produces: ['docs/decisions/merge-design.md'],
      consumes: ['src/protocol.ts', 'docs/decisions/reconcile-gap.md'],
      deps: ['phase-1-term'],
    },

    'adv-merge': {
      id: 'adv-merge',
      desc: 'Adversarial spec: merge() preserves structure (no cycles), unifies nodes correctly, consumes satisfied',
      produces: ['tests/adv-merge.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-1-term'],
    },

    'merge-impl': {
      id: 'merge-impl',
      desc: 'Implement merge(g1, g2): validate inputs, reconcile(), add structural edges, define() + verify() merged graph',
      produces: ['src/protocol.ts'],
      consumes: ['tests/adv-merge.test.ts', 'docs/decisions/merge-design.md'],
      deps: ['adv-merge', 'merge-spec'],
    },

    'phase-2-term': {
      id: 'phase-2-term',
      desc: 'Phase 2 complete: DAG merge operations enable recursive expansion + multi-repo coordination',
      produces: [],
      consumes: ['tests/adv-merge.test.ts', 'docs/decisions/merge-design.md'],
      deps: ['merge-impl'],
    },

    // --- PHASE 3: Branch operations ---

    'branch-spec': {
      id: 'branch-spec',
      desc: 'Spec: branch(g, from) extracts subgraph from node to term, creates variant DAG for parallel development',
      produces: ['docs/decisions/branch-design.md'],
      consumes: ['src/protocol.ts', 'docs/decisions/merge-design.md'],
      deps: ['phase-2-term'],
    },

    'adv-branch': {
      id: 'adv-branch',
      desc: 'Adversarial spec: branch() preserves structure (acyclic), includes all reachable nodes to term, consumes satisfied',
      produces: ['tests/adv-branch.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-2-term'],
    },

    'branch-impl': {
      id: 'branch-impl',
      desc: 'Implement branch(g, from): extract subgraph, set new init/term, validate via define() + verify()',
      produces: ['src/protocol.ts'],
      consumes: ['tests/adv-branch.test.ts', 'docs/decisions/branch-design.md'],
      deps: ['adv-branch', 'branch-spec'],
    },

    'phase-3-term': {
      id: 'phase-3-term',
      desc: 'Phase 3 complete: branch operations enable parallel development + variant exploration',
      produces: [],
      consumes: ['tests/adv-branch.test.ts', 'docs/decisions/branch-design.md'],
      deps: ['branch-impl'],
    },

    // --- PHASE 4: Ecosystem readiness (v0.2.0) ---

    'skill-finalize': {
      id: 'skill-finalize',
      desc: 'Finalize SKILL.md: protocol spec + merge/branch examples, expansion workflow',
      produces: ['SKILL.md'],
      consumes: ['src/protocol.ts', 'docs/decisions/merge-design.md', 'docs/decisions/branch-design.md'],
      deps: ['phase-3-term'],
    },

    'readme-write': {
      id: 'readme-write',
      desc: 'Write README.md: what/why/how, 3+ end-to-end examples, installation, API reference',
      produces: ['README.md'],
      consumes: ['SKILL.md', 'src/protocol.ts'],
      deps: ['phase-3-term'],
    },

    'example-create': {
      id: 'example-create',
      desc: 'Create real consumer example: example/simple-project-roadmap.ts + integration test',
      produces: ['example/simple-project-roadmap.ts', 'example/test.ts'],
      consumes: ['README.md'],
      deps: ['readme-write'],
    },

    'release-prepare': {
      id: 'release-prepare',
      desc: 'Add CHANGELOG.md, update package.json version to 0.2.0, prepare npm publish',
      produces: ['CHANGELOG.md', 'package.json'],
      consumes: [],
      deps: ['example-create', 'skill-finalize'],
    },

    'v0.2.0-term': {
      id: 'v0.2.0-term',
      desc: 'v0.2.0 ready: published npm package, documented API, real consumer examples',
      produces: [],
      consumes: ['README.md', 'SKILL.md', 'CHANGELOG.md'],
      deps: ['release-prepare'],
    },

    // --- PHASE 4.5: Governance hardening (autonomous-agent ready) ---

    'spec-system': {
      id: 'spec-system',
      desc: 'Formalize adversarial spec system: when/how/why, integration with implementation',
      produces: ['SPEC.md'],
      consumes: ['tests/adv-reconcile.test.ts', 'tests/adv-orient.test.ts'],
      deps: ['v0.2.0-term'],
    },

    'briefing-files': {
      id: 'briefing-files',
      desc: 'Create .briefing.json per node: what to build, which files matter, pattern to follow',
      produces: ['.briefing/adv-reconcile.json', '.briefing/fix-reconcile.json', '.briefing/merge-spec.json'],
      consumes: [],
      deps: ['spec-system'],
    },

    'test-org-guide': {
      id: 'test-org-guide',
      desc: 'Test organization guide: how to read adv-* suites progressively, pattern matching',
      produces: ['docs/test-organization.md'],
      consumes: [],
      deps: ['spec-system'],
    },

    'condense-docs': {
      id: 'condense-docs',
      desc: 'Refactor SKILL.md + README for reference density (60 lines each, no marketing prose)',
      produces: ['SKILL.md', 'README.md'],
      consumes: [],
      deps: ['spec-system'],
    },

    'phase-4.5-term': {
      id: 'phase-4.5-term',
      desc: 'Phase 4.5 complete: governance documentation, formalized spec system, node briefings, agent autonomy',
      produces: [],
      consumes: ['SPEC.md', 'docs/test-organization.md'],
      deps: ['briefing-files', 'test-org-guide', 'condense-docs'],
    },

    // --- PHASE 5: Operational hardening (v0.2.1 groundwork) ---

    'git-state-spec': {
      id: 'git-state-spec',
      desc: 'Spec: git-state.json schema — phase annotation, branch, head commit, dirty files',
      produces: ['docs/decisions/git-state-spec.md', 'src/git-state.schema.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-4.5-term'],
    },

    'git-state-impl': {
      id: 'git-state-impl',
      desc: 'Implement: post-commit hook + session-start hook → write .regent/git-state.json',
      produces: ['hooks/post-commit.ts', 'hooks/session-start.ts'],
      consumes: ['src/git-state.schema.ts'],
      deps: ['git-state-spec'],
    },

    'git-state-orient': {
      id: 'git-state-orient',
      desc: 'Extend orient() to read .regent/git-state.json cache (O(1) vs O(N) git ops)',
      produces: ['src/protocol.ts', 'tests/git-state-caching.test.ts'],
      consumes: ['hooks/post-commit.ts', 'src/git-state.schema.ts'],
      deps: ['git-state-impl'],
    },

    'bootstrap-gen-spec': {
      id: 'bootstrap-gen-spec',
      desc: 'Spec: consumer bootstrap template generation — minimal roadmap.ts + boot harness',
      produces: ['docs/decisions/bootstrap-gen-design.md'],
      consumes: ['src/protocol.ts', 'SKILL.md'],
      deps: ['phase-4.5-term'],
    },

    'bootstrap-gen-impl': {
      id: 'bootstrap-gen-impl',
      desc: 'Implement: generate consumer-bootstrap.ts from roadmap.ts definition',
      produces: ['src/generate-bootstrap.ts', 'example/consumer-bootstrap.ts'],
      consumes: ['docs/decisions/bootstrap-gen-design.md'],
      deps: ['bootstrap-gen-spec'],
    },

    'bootstrap-test': {
      id: 'bootstrap-test',
      desc: 'Test: generated bootstrap runs orient(), consumes/produces correct, deps link correctly',
      produces: ['tests/bootstrap-gen.test.ts'],
      consumes: ['example/consumer-bootstrap.ts', 'src/generate-bootstrap.ts'],
      deps: ['bootstrap-gen-impl'],
    },

    'multi-repo-pattern': {
      id: 'multi-repo-pattern',
      desc: 'Doc + example: merge(fusion_roadmap, cockpit_roadmap, ...) multi-repo coordination',
      produces: ['docs/multi-repo-coordination.md', 'example/multi-repo-merge.ts', 'tests/multi-repo.test.ts'],
      consumes: ['src/protocol.ts', 'docs/decisions/merge-design.md'],
      deps: ['phase-4.5-term'],
    },

    'phase-5-term': {
      id: 'phase-5-term',
      desc: 'Phase 5 complete: operational hardening — efficient orientation, consumer automation, multi-repo patterns',
      produces: [],
      consumes: [
        'src/git-state.schema.ts',
        'src/protocol.ts',
        'tests/git-state-caching.test.ts',
        'example/consumer-bootstrap.ts',
        'tests/bootstrap-gen.test.ts',
        'example/multi-repo-merge.ts',
      ],
      deps: ['git-state-orient', 'bootstrap-test', 'multi-repo-pattern'],
    },

    // --- PHASE 6: Governance layer (session lifecycle + audit) ---

    'checkpoint-spec': {
      id: 'checkpoint-spec',
      desc: 'Spec: checkpoint/restore session state — node ID, remaining, artifacts metadata',
      produces: ['docs/decisions/checkpoint-restore-design.md', 'src/checkpoint.schema.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-5-term'],
    },

    'checkpoint-impl': {
      id: 'checkpoint-impl',
      desc: 'Implement: checkpoint(g, pos) → .boot/checkpoint-{ts}.json, restore(cp) → (g, pos)',
      produces: ['src/checkpoint.ts'],
      consumes: ['src/checkpoint.schema.ts'],
      deps: ['checkpoint-spec'],
    },

    'audit-spec': {
      id: 'audit-spec',
      desc: 'Spec: immutable audit trail — .boot/audit.jsonl, fields: timestamp/nodeId/executor/evidence',
      produces: ['docs/decisions/audit-trail-design.md', 'AUDIT.md'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-5-term'],
    },

    'audit-impl': {
      id: 'audit-impl',
      desc: 'Implement: audit(nodeId, executor, evidence) → append to audit.jsonl, validate completions',
      produces: ['src/audit.ts', 'tests/audit.test.ts'],
      consumes: ['docs/decisions/audit-trail-design.md'],
      deps: ['audit-spec'],
    },

    'regent-integration': {
      id: 'regent-integration',
      desc: 'Regent integration: roadmap-aware agent template, orient() on boot, position in audit',
      produces: ['.claude/agents/roadmap-agent-template.md', 'tests/regent-integration.test.ts'],
      consumes: ['src/checkpoint.ts', 'src/audit.ts', 'src/protocol.ts'],
      deps: ['checkpoint-impl', 'audit-impl'],
    },

    'phase-6-term': {
      id: 'phase-6-term',
      desc: 'Phase 6 complete: governance layer — checkpoint/restore, audit trails, regent integration enabled',
      produces: [],
      consumes: [
        'src/checkpoint.ts',
        'src/audit.ts',
        'AUDIT.md',
        '.claude/agents/roadmap-agent-template.md',
      ],
      deps: ['regent-integration'],
    },

    term: {
      id: 'term',
      desc: 'v0.3.0-governance-ready: operational hardening + audit/checkpoint foundation for multi-agent coordination',
      produces: [],
      consumes: [],
      deps: ['phase-6-term'],
    },
  },
}));

// --- Checks ---

const status = check(roadmap);
if (!status.done) {
  console.error('check: not reconciled', status.orphans);
  process.exit(1);
}

const errors = verify(roadmap);
if (errors.length) {
  console.error('verify:', errors);
  process.exit(1);
}

console.log('check: done');
console.log('verify: all contracts satisfied');

// --- Frontier reconciliation (show phase boundaries) ---

const { connections, gaps } = reconcile(
  roadmap,
  ['phase-4.5-term'],
  ['phase-5-term'],
);
console.log('reconcile: phase 4.5→5 frontier', connections.map(c => `${c.forward}→${c.backward} via ${c.artifact}`));
console.log('reconcile: gaps', gaps.map(g => `${g.between.join('↔')} missing ${g.missing.join(', ')}`));

export default roadmap;
export type NodeId = keyof typeof roadmap.nodes;
export type Artifact = (typeof roadmap.nodes)[NodeId]['produces'][number];
