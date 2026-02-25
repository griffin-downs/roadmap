/**
 * Add Phase 11: Adoption Audit & Release Readiness
 * Run: node --experimental-strip-types .roadmap/add-phase-11.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify } from '../src/protocol.ts';

const headPath = join(import.meta.dirname, 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// Phase 11 node structure
const scenarios = [
  'monorepo-services',
  'microservice-deploy',
  'library-ecosystem',
  'ci-cd-pipeline',
  'compliance-audit',
  'team-workflow',
  'feature-rollout',
  'db-migration',
  'perf-optimization',
  'legacy-refactor'
];

// 1. adoption-scenario-setup: Create test harnesses
dag.nodes['adoption-scenario-setup'] = {
  id: 'adoption-scenario-setup',
  desc: 'Setup: Create test harnesses for 10 adoption scenarios (template, metrics collector, survey)',
  produces: [
    'tests/adoption/harness-template.ts',
    'tests/adoption/metrics-collector.ts',
    'tests/adoption/survey-form.json',
    '.roadmap/adoption-scenarios.json'
  ],
  consumes: ['src/protocol.ts'],
  deps: ['phase-9-term', 'phase-10-term'],
  validate: [
    { type: 'artifact-exists', target: 'tests/adoption/harness-template.ts' },
    { type: 'artifact-exists', target: '.roadmap/adoption-scenarios.json' }
  ],
  idempotent: true
};

// 2. adoption-scenario-exec-[1-10]: Run each scenario
scenarios.forEach((scenario, i) => {
  const nodeId = `adoption-scenario-${i + 1}`;
  const prevId = i === 0 ? 'adoption-scenario-setup' : `adoption-scenario-${i}`;

  dag.nodes[nodeId] = {
    id: nodeId,
    desc: `Execute adoption scenario: ${scenario}`,
    produces: [`tests/adoption/results/${scenario}.json`],
    consumes: [
      'tests/adoption/harness-template.ts',
      'tests/adoption/metrics-collector.ts',
      '.roadmap/adoption-scenarios.json'
    ],
    deps: [prevId],
    validate: [
      { type: 'artifact-exists', target: `tests/adoption/results/${scenario}.json` }
    ],
    idempotent: false
  };
});

// 3. survey-analysis: Aggregate results
dag.nodes['survey-analysis'] = {
  id: 'survey-analysis',
  desc: 'Analyze: Aggregate metrics across 10 scenarios, produce adoption-survey-results.md with findings',
  produces: [
    'docs/adoption-survey-results.md',
    'docs/adoption-metrics.json'
  ],
  consumes: scenarios.map(s => `tests/adoption/results/${s}.json`),
  deps: ['adoption-scenario-10'],
  validate: [
    { type: 'artifact-exists', target: 'docs/adoption-survey-results.md' }
  ],
  idempotent: true
};

// 4. release-readiness-assessment: Manual review + GO/NO-GO decision
dag.nodes['release-readiness-assessment'] = {
  id: 'release-readiness-assessment',
  desc: 'Assess: Review adoption results, verify success criteria, make GO/NO-GO release decision',
  produces: [
    'docs/adoption-audit.md',
    'docs/release-decision.json'
  ],
  consumes: [
    'docs/adoption-survey-results.md',
    'docs/adoption-metrics.json'
  ],
  deps: ['survey-analysis'],
  validate: [
    { type: 'artifact-exists', target: 'docs/adoption-audit.md' }
  ],
  idempotent: false
};

// 5. phase-11-term: Phase complete
dag.nodes['phase-11-term'] = {
  id: 'phase-11-term',
  desc: 'Phase 11 complete: Adoption-verified release-ready (10 scenarios, survey complete, GO decision)',
  produces: [],
  consumes: [
    'docs/adoption-audit.md',
    'tests/adoption/results/monorepo-services.json'
  ],
  deps: ['release-readiness-assessment'],
  validate: [],
  idempotent: false
};

// 6. Update term node to depend on phase-11-term
dag.nodes['term'].desc = 'v0.4.0-adoption-ready: All phases complete, adoption-verified, release-ready';
dag.nodes['term'].deps = ['phase-11-term'];

// Validate
const checkResult = check(dag);
if (!checkResult.done) {
  console.error('❌ DAG validation failed:', checkResult.orphans);
  process.exit(1);
}

const verifyErrors = verify(dag);
if (verifyErrors.length > 0) {
  console.error('❌ Contract violations:', verifyErrors);
  process.exit(1);
}

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✓ Phase 11 added: adoption audit + release readiness');
console.log('✓ 10 scenarios (monorepo → legacy refactor)');
console.log('✓ DAG acyclic, connected, contracts satisfied');
console.log('✓ New term: v0.4.0-adoption-ready');
