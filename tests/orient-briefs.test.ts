import { test } from 'node:test';
import assert from 'node:assert';
import { getBrief } from '../src/lib/brief.ts';

// Minimal DAG for testing briefs
const dag = {
  id: 'brief-test',
  desc: 'test',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'Initialize the project', produces: ['init.marker'], consumes: [], deps: [], validate: [] },
    mid: { id: 'mid', desc: 'Build the middle layer', produces: ['mid.ts'], consumes: ['init.marker'], deps: ['init'], validate: [] },
    term: { id: 'term', desc: 'Finalize everything', produces: [], consumes: ['mid.ts'], deps: ['mid'], validate: [{ type: 'shell', command: 'echo ok' }] },
  },
} as any;

test('getBrief returns structured brief for a node', async () => {
  const brief = await getBrief(dag, 'init', '/tmp/nonexistent');
  assert.strictEqual(brief.position, 'init');
  assert.strictEqual(brief.mode, 'execute');
  assert.deepStrictEqual(brief.produces, ['init.marker']);
  assert(brief.description.length > 0);
  assert(brief.pattern.length > 0);
  assert(typeof brief.remaining === 'number');
});

test('getBrief for mid node includes consumes', async () => {
  const brief = await getBrief(dag, 'mid', '/tmp/nonexistent');
  assert.strictEqual(brief.position, 'mid');
  assert.deepStrictEqual(brief.consumes, ['init.marker']);
  assert.deepStrictEqual(brief.produces, ['mid.ts']);
});

test('getBrief for terminal node works', async () => {
  const brief = await getBrief(dag, 'term', '/tmp/nonexistent');
  assert.strictEqual(brief.position, 'term');
  assert.deepStrictEqual(brief.produces, []);
});
