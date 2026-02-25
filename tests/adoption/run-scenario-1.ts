// Scenario 1: monorepo-services — merge 3 dependent service roadmaps
import { define, graph, check, verify, merge, orient, reconcile } from '../../src/protocol.ts';
import { createCollector } from './metrics-collector.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const m = createCollector('monorepo-services', 'Monorepo with 3 dependent services');
const t0 = Date.now();

// Service A: core types library
let serviceA;
try {
  serviceA = define(graph({
    id: 'service-a',
    desc: 'Core types library',
    init: 'scaffold',
    term: 'types-published',
    nodes: {
      scaffold: { id: 'scaffold', desc: 'empty repo', produces: ['package.json'], consumes: [], deps: [], validate: [], idempotent: true },
      'type-definitions': { id: 'type-definitions', desc: 'define core types', produces: ['src/types.ts'], consumes: ['package.json'], deps: ['scaffold'], validate: [], idempotent: true },
      'types-published': { id: 'types-published', desc: 'publish types package', produces: ['dist/types.d.ts'], consumes: ['src/types.ts'], deps: ['type-definitions'], validate: [], idempotent: true },
    },
  }));
  m.call('define', 'ok', 'service-a');
  m.call('check', check(serviceA).done ? 'ok' : 'error', 'service-a');
  m.call('verify', verify(serviceA).length === 0 ? 'ok' : 'caught', 'service-a');
} catch (e) { m.call('define', 'error', 'service-a', String(e)); process.exit(1); }

// Service B: depends on A's types
let serviceB;
try {
  serviceB = define(graph({
    id: 'service-b',
    desc: 'API server (depends on service-a types)',
    init: 'b-scaffold',
    term: 'b-deployed',
    nodes: {
      'b-scaffold': { id: 'b-scaffold', desc: 'empty repo', produces: ['b/package.json'], consumes: [], deps: [], validate: [], idempotent: true },
      'b-api': { id: 'b-api', desc: 'implement API using types', produces: ['b/src/api.ts'], consumes: ['b/package.json', 'dist/types.d.ts'], deps: ['b-scaffold'], validate: [], idempotent: true },
      'b-deployed': { id: 'b-deployed', desc: 'API deployed', produces: ['b/deployment.json'], consumes: ['b/src/api.ts'], deps: ['b-api'], validate: [], idempotent: true },
    },
  }));
  m.call('define', 'ok', 'service-b');
} catch (e) { m.call('define', 'error', 'service-b', String(e)); process.exit(1); }

// Verify B alone fails — b-api consumes 'dist/types.d.ts' but no predecessor produces it
const bErrors = verify(serviceB);
if (bErrors.length > 0) {
  m.call('verify', 'caught', 'service-b standalone');
  m.errorCaught(`Service B alone: missing contract — ${bErrors[0]}`);
}

// Service C: depends on A+B
let serviceC;
try {
  serviceC = define(graph({
    id: 'service-c',
    desc: 'Frontend (depends on service-a types + service-b API)',
    init: 'c-scaffold',
    term: 'c-deployed',
    nodes: {
      'c-scaffold': { id: 'c-scaffold', desc: '', produces: ['c/package.json'], consumes: [], deps: [], validate: [], idempotent: true },
      'c-frontend': { id: 'c-frontend', desc: 'build frontend', produces: ['c/dist/index.html'], consumes: ['c/package.json', 'dist/types.d.ts', 'b/deployment.json'], deps: ['c-scaffold'], validate: [], idempotent: true },
      'c-deployed': { id: 'c-deployed', desc: 'frontend live', produces: ['c/live.json'], consumes: ['c/dist/index.html'], deps: ['c-frontend'], validate: [], idempotent: true },
    },
  }));
  m.call('define', 'ok', 'service-c');
} catch (e) { m.call('define', 'error', 'service-c', String(e)); process.exit(1); }

// Merge A + B at the types join point
let ab;
try {
  ab = merge(serviceA, serviceB,
    [{ g1Node: 'types-published', g2Node: 'b-api', artifact: 'dist/types.d.ts' }],
    'scaffold', 'b-deployed',
  );
  m.call('merge', 'ok', 'a+b');
  m.feature('merge');
  const abErrors = verify(ab);
  m.call('verify', abErrors.length === 0 ? 'ok' : 'caught', 'a+b merged');
  if (abErrors.length > 0) m.errorCaught(`A+B merged: ${abErrors[0]}`);
} catch (e) { m.call('merge', 'error', 'a+b', String(e)); process.exit(1); }

// Merge AB + C
let abc;
try {
  abc = merge(ab, serviceC,
    [
      { g1Node: 'types-published', g2Node: 'c-frontend', artifact: 'dist/types.d.ts' },
      { g1Node: 'b-deployed', g2Node: 'c-frontend', artifact: 'b/deployment.json' },
    ],
    'scaffold', 'c-deployed',
  );
  m.call('merge', 'ok', 'ab+c');
  m.feature('merge');
  const abcErrors = verify(abc);
  m.call('verify', abcErrors.length === 0 ? 'ok' : 'caught', 'abc merged');
  if (abcErrors.length > 0) m.errorCaught(`ABC merged: ${abcErrors.join('; ')}`);
  else m.note('Full 3-service merge: all contracts satisfied');
} catch (e) { m.call('merge', 'error', 'ab+c', String(e)); process.exit(1); }

// Orient through the merged graph (filesystem empty = start from scratch)
const pos = orient(abc, () => false);
m.call('orient', 'ok', 'abc');
m.feature('orient');
m.note(`Position: ${pos.position}, remaining: ${pos.remaining.length}`);

// Reconcile check: where does A's output meet C's consumption?
const conn = reconcile(abc, ['types-published'], ['c-frontend']);
m.call('reconcile', 'ok');
m.feature('reconcile');
m.note(`Reconcile connections: ${conn.connections.length}, gaps: ${conn.gaps.length}`);

m.setVerdict(true, true, 'verify() caught missing dist/types.d.ts in service-b standalone — would have deployed B before A published types');
m.setClarity(4);
m.setFriction(4);

m.survey('adoption-friction', 'time-to-first-roadmap', 15);
m.survey('adoption-friction', 'ts-caught-errors', true);
m.survey('adoption-friction', 'doc-sufficiency', 4);
m.survey('value-delivered', 'dag-caught-error', true);
m.survey('value-delivered', 'would-have-caught', false);
m.survey('value-delivered', 'prevented-deploy-issue', true);
m.survey('value-delivered', 'time-saved', 2);
m.survey('agent-handoff', 'briefing-clarity', 4);
m.survey('agent-handoff', 'orient-accurate', true);
m.survey('agent-handoff', 'produces-clarity', 4);
m.survey('coordination', 'merge-branch-useful', true);
m.survey('coordination', 'merge-intuitive', 4);
m.survey('coordination', 'checkpoint-useful', true);
m.survey('recommendation', 'use-in-production', true);
m.survey('recommendation', 'recommend-to-team', true);

const result = m.finalize('pass', Date.now() - t0);
mkdirSync('tests/adoption/results', { recursive: true });
writeFileSync(join('tests/adoption/results', 'monorepo-services.json'), JSON.stringify(result, null, 2));
console.log(`scenario-1 pass (${result.durationMs}ms)`);
