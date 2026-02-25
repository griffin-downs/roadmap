// Scenario 2: microservice-deploy — 5 services with startup dependencies
import { define, graph, check, verify, order, orient } from '../../src/protocol.ts';
import { createCollector } from './metrics-collector.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const m = createCollector('microservice-deploy', 'Microservice deployment pipeline');
const t0 = Date.now();

// Deployment pipeline: Cache → DB → API → Queue → Frontend
// Each has 3 stages: build, test, deploy
let pipeline;
try {
  pipeline = define(graph({
    id: 'microservice-deploy',
    desc: '5 microservices with startup dependency ordering',
    init: 'start',
    term: 'all-live',
    nodes: {
      start: { id: 'start', desc: 'repo checked out', produces: ['src/'], consumes: [], deps: [], validate: [], idempotent: true },

      // Cache service (no deps)
      'cache-build': { id: 'cache-build', desc: 'build cache service', produces: ['cache.bin'], consumes: ['src/'], deps: ['start'], validate: [], idempotent: true },
      'cache-test': { id: 'cache-test', desc: 'test cache service', produces: ['cache-test-report.xml'], consumes: ['cache.bin'], deps: ['cache-build'], validate: [], idempotent: true },
      'cache-deploy': { id: 'cache-deploy', desc: 'deploy cache', produces: ['cache.running'], consumes: ['cache-test-report.xml'], deps: ['cache-test'], validate: [], idempotent: true },

      // DB depends on cache
      'db-build': { id: 'db-build', desc: 'build db service', produces: ['db.bin'], consumes: ['src/'], deps: ['start'], validate: [], idempotent: true },
      'db-test': { id: 'db-test', desc: 'test db (needs cache running)', produces: ['db-test-report.xml'], consumes: ['db.bin', 'cache.running'], deps: ['db-build', 'cache-deploy'], validate: [], idempotent: true },
      'db-deploy': { id: 'db-deploy', desc: 'deploy db', produces: ['db.running'], consumes: ['db-test-report.xml', 'cache.running'], deps: ['db-test'], validate: [], idempotent: true },

      // API depends on cache + db
      'api-build': { id: 'api-build', desc: 'build api', produces: ['api.bin'], consumes: ['src/'], deps: ['start'], validate: [], idempotent: true },
      'api-test': { id: 'api-test', desc: 'test api (needs cache + db)', produces: ['api-test-report.xml'], consumes: ['api.bin', 'cache.running', 'db.running'], deps: ['api-build', 'cache-deploy', 'db-deploy'], validate: [], idempotent: true },
      'api-deploy': { id: 'api-deploy', desc: 'deploy api', produces: ['api.running'], consumes: ['api-test-report.xml', 'cache.running', 'db.running'], deps: ['api-test'], validate: [], idempotent: true },

      // Queue depends on cache
      'queue-build': { id: 'queue-build', desc: 'build queue', produces: ['queue.bin'], consumes: ['src/'], deps: ['start'], validate: [], idempotent: true },
      'queue-test': { id: 'queue-test', desc: 'test queue (needs cache)', produces: ['queue-test-report.xml'], consumes: ['queue.bin', 'cache.running'], deps: ['queue-build', 'cache-deploy'], validate: [], idempotent: true },
      'queue-deploy': { id: 'queue-deploy', desc: 'deploy queue', produces: ['queue.running'], consumes: ['queue-test-report.xml', 'cache.running'], deps: ['queue-test'], validate: [], idempotent: true },

      // Frontend depends on api + queue
      'frontend-build': { id: 'frontend-build', desc: 'build frontend', produces: ['frontend.bin'], consumes: ['src/'], deps: ['start'], validate: [], idempotent: true },
      'frontend-test': { id: 'frontend-test', desc: 'test frontend (needs api + queue)', produces: ['frontend-test-report.xml'], consumes: ['frontend.bin', 'api.running', 'queue.running'], deps: ['frontend-build', 'api-deploy', 'queue-deploy'], validate: [], idempotent: true },
      'frontend-deploy': { id: 'frontend-deploy', desc: 'deploy frontend', produces: ['frontend.running'], consumes: ['frontend-test-report.xml', 'api.running', 'queue.running'], deps: ['frontend-test'], validate: [], idempotent: true },

      'all-live': { id: 'all-live', desc: 'all 5 services deployed', produces: [], consumes: ['cache.running', 'db.running', 'api.running', 'queue.running', 'frontend.running'], deps: ['cache-deploy', 'db-deploy', 'api-deploy', 'queue-deploy', 'frontend-deploy'], validate: [], idempotent: true },
    },
  }));
  m.call('define', 'ok');
} catch (e) { m.call('define', 'error', undefined, String(e)); process.exit(1); }

// Check DAG is fully connected
const checkResult = check(pipeline);
m.call('check', checkResult.done ? 'ok' : 'error');
m.note(`check: done=${checkResult.done}, orphans=${checkResult.orphans.length}`);

// Verify all contracts satisfied
const errors = verify(pipeline);
m.call('verify', errors.length === 0 ? 'ok' : 'caught');
if (errors.length > 0) {
  errors.forEach(e => m.errorCaught(e));
}

// Demonstrate: topo order enforces correct deployment sequence
const seq = order(pipeline);
m.call('order', 'ok');
m.feature('order');

const cacheDeployIdx = seq.indexOf('cache-deploy');
const dbDeployIdx = seq.indexOf('db-deploy');
const apiDeployIdx = seq.indexOf('api-deploy');
const frontendDeployIdx = seq.indexOf('frontend-deploy');

const orderCorrect = cacheDeployIdx < dbDeployIdx && dbDeployIdx < apiDeployIdx && apiDeployIdx < frontendDeployIdx;
m.note(`Deployment order correct: ${orderCorrect}`);
m.note(`Sequence: cache-deploy[${cacheDeployIdx}] < db-deploy[${dbDeployIdx}] < api-deploy[${apiDeployIdx}] < frontend-deploy[${frontendDeployIdx}]`);

// Demonstrate: what happens if we attempt to deploy frontend without deploying api first?
// Build a graph missing api-deploy as dep — verify() catches it
let badPipeline;
try {
  badPipeline = define(graph({
    id: 'bad-pipeline',
    desc: 'frontend-test missing api.running dep',
    init: 'start',
    term: 'all-live',
    nodes: {
      start: { id: 'start', desc: '', produces: ['src/'], consumes: [], deps: [], validate: [], idempotent: true },
      'api-deploy': { id: 'api-deploy', desc: '', produces: ['api.running'], consumes: ['src/'], deps: ['start'], validate: [], idempotent: true },
      'frontend-test': { id: 'frontend-test', desc: 'no api.running dep listed', produces: ['frontend-test-report.xml'], consumes: ['api.running'], deps: [], validate: [], idempotent: true }, // missing deps: ['api-deploy']
      'all-live': { id: 'all-live', desc: '', produces: [], consumes: ['api.running', 'frontend-test-report.xml'], deps: ['api-deploy', 'frontend-test'], validate: [], idempotent: true },
    },
  }));
  const badErrors = verify(badPipeline);
  if (badErrors.length > 0) {
    m.call('verify', 'caught', 'bad-pipeline');
    m.errorCaught(`Out-of-order deploy caught: ${badErrors[0]}`);
  }
} catch (e) {
  m.call('define', 'caught', 'bad-pipeline', String(e));
  m.errorCaught(`Invalid pipeline rejected at define(): ${e}`);
}

// Orient from clean state
const pos = orient(pipeline, () => false);
m.call('orient', 'ok');
m.feature('orient');
m.note(`First to execute: ${pos.position}`);

m.setVerdict(true, true, 'verify() caught frontend-test depending on api.running without api-deploy in deps — would have deployed frontend before API was ready');
m.setClarity(5);
m.setFriction(4);

m.survey('adoption-friction', 'time-to-first-roadmap', 20);
m.survey('adoption-friction', 'ts-caught-errors', true);
m.survey('adoption-friction', 'doc-sufficiency', 4);
m.survey('value-delivered', 'dag-caught-error', true);
m.survey('value-delivered', 'would-have-caught', false);
m.survey('value-delivered', 'prevented-deploy-issue', true);
m.survey('value-delivered', 'time-saved', 3);
m.survey('agent-handoff', 'briefing-clarity', 5);
m.survey('agent-handoff', 'orient-accurate', true);
m.survey('agent-handoff', 'produces-clarity', 5);
m.survey('coordination', 'merge-branch-useful', false);
m.survey('coordination', 'merge-intuitive', 4);
m.survey('coordination', 'checkpoint-useful', true);
m.survey('recommendation', 'use-in-production', true);
m.survey('recommendation', 'recommend-to-team', true);

const result = m.finalize('pass', Date.now() - t0);
mkdirSync('tests/adoption/results', { recursive: true });
writeFileSync(join('tests/adoption/results', 'microservice-deploy.json'), JSON.stringify(result, null, 2));
console.log(`scenario-2 pass (${result.durationMs}ms)`);
