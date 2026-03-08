import { test } from 'node:test';
import assert from 'node:assert';
import { getBrief } from '../src/lib/brief.ts';

const dag = {
  id: 'next-brief-test',
  desc: 'test',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'Start here', produces: ['a.ts'], consumes: [], deps: [], validate: [] },
    mid: { id: 'mid', desc: 'Build middleware', produces: ['b.ts'], consumes: ['a.ts'], deps: ['init'], validate: [] },
    term: { id: 'term', desc: 'Finish', produces: [], consumes: ['b.ts'], deps: ['mid'], validate: [{ type: 'shell', command: 'echo ok' }] },
  },
} as any;

test('getBrief can produce next brief after advance', async () => {
  // Simulate: after advancing init, remaining is [mid], get brief for mid
  const nextBrief = await getBrief(dag, 'mid', '/tmp/nonexistent');
  assert.strictEqual(nextBrief.position, 'mid');
  assert.strictEqual(nextBrief.mode, 'execute');
  assert.deepStrictEqual(nextBrief.produces, ['b.ts']);
  assert.deepStrictEqual(nextBrief.consumes, ['a.ts']);
  assert(nextBrief.description.includes('Build middleware'));
});

test('getBrief for first node has no handoff', async () => {
  const brief = await getBrief(dag, 'init', '/tmp/nonexistent');
  assert.strictEqual(brief.handoff, undefined);
});
