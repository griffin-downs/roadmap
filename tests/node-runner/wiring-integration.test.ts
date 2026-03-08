import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectMakeErrors } from '../src/lib/make-validation.ts';
import { getBrief } from '../src/lib/brief.ts';
import { saveFinal, saveInterim } from '../src/lib/agent-dispatch/handoff-journal.ts';
import { saveDagHead, loadDag, migrateSingleHead } from '../src/lib/multi-dag.ts';
import { optimize } from '../src/lib/optimize.ts';
import type { FinalHandoff, InterimHandoff } from '../src/lib/brief.ts';

// -- 1. terminal intent gate enforced (shell not required) --
test('make enforces terminal-intent gate, not terminal-shell', () => {
  const dag = {
    id: 'no-intent', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'], validate: [] },
    },
  };
  const errors = collectMakeErrors(dag);
  assert(errors.some(e => e.gate === 'terminal-intent'), 'Should require intent on terminal');
  assert(!errors.some(e => e.gate === 'terminal-shell'), 'Should NOT require shell on terminal');
});

// -- 2. orient returns briefs --
test('getBrief produces structured brief with description and mode', async () => {
  const dag = {
    id: 'brief-int', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'Setup', produces: ['a.ts'], consumes: [], deps: [], validate: [] },
      term: { id: 'term', desc: 'Done', produces: [], consumes: ['a.ts'], deps: ['init'], validate: [{ type: 'shell', command: 'echo ok' }] },
    },
  } as any;
  const brief = await getBrief(dag, 'init', '/tmp/none');
  assert.strictEqual(brief.position, 'init');
  assert.strictEqual(brief.mode, 'execute');
  assert(brief.description.length > 0);
});

// -- 3. advance writes handoff --
test('saveFinal writes handoff to .roadmap/.handoff/', async () => {
  const tmp = mkdtempSync(join('/tmp', 'wiring-'));
  try {
    const handoff: FinalHandoff = {
      timestamp: new Date().toISOString(),
      progress: 1.0,
      discovered: [],
      blockers: [],
      currentFile: '',
      summary: 'Node done',
      keyDecisions: ['used pattern X'],
      gotchas: [],
      nextNodeEntry: { consumes: ['a.ts'], ready: true },
    };
    await saveFinal(tmp, 'test-node', handoff);
    assert(existsSync(join(tmp, '.roadmap', '.handoff', 'test-node.json')));
    const content = JSON.parse(readFileSync(join(tmp, '.roadmap', '.handoff', 'test-node.json'), 'utf-8'));
    assert.strictEqual(content.summary, 'Node done');
  } finally { rmSync(tmp, { recursive: true }); }
});

// -- 4. intent gate produces structured prompt --
test('intent gates produce assessment prompt', () => {
  const intentChecks = [{ rule: { type: 'intent', statement: 'All wired' }, passed: true }];
  const shellResults = [{ rule: 'shell:echo ok', passed: true }];
  const gates = intentChecks
    .filter(c => c.rule.type === 'intent')
    .map(c => ({
      statement: (c.rule as any).statement,
      shellResults,
      assessmentPrompt: `Evaluate "${(c.rule as any).statement}" — ${shellResults.filter(r => r.passed).length}/${shellResults.length} shell pass`,
    }));
  assert.strictEqual(gates.length, 1);
  assert(gates[0].assessmentPrompt.includes('1/1'));
});

// -- 5. next orient reads handoff via getBrief --
test('getBrief reads predecessor handoff from .roadmap/.handoff/', async () => {
  const tmp = mkdtempSync(join('/tmp', 'wiring-'));
  try {
    // Write a predecessor handoff
    const handoff: FinalHandoff = {
      timestamp: new Date().toISOString(),
      progress: 1.0,
      discovered: [],
      blockers: [],
      currentFile: '',
      summary: 'Predecessor done',
      keyDecisions: [],
      gotchas: [],
      nextNodeEntry: { consumes: ['a.ts'], ready: true },
    };
    await saveFinal(tmp, 'init', handoff);

    // DAG where mid consumes what init produces
    const dag = {
      id: 'handoff-read', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['a.ts'], consumes: [], deps: [], validate: [] },
        mid: { id: 'mid', desc: 'middle', produces: ['b.ts'], consumes: ['a.ts'], deps: ['init'], validate: [] },
        term: { id: 'term', desc: 'end', produces: [], consumes: ['b.ts'], deps: ['mid'], validate: [{ type: 'shell', command: 'echo ok' }] },
      },
    } as any;

    const brief = await getBrief(dag, 'mid', tmp);
    assert(brief.handoff, 'Brief should include predecessor handoff');
    assert.strictEqual(brief.handoff!.summary, 'Predecessor done');
  } finally { rmSync(tmp, { recursive: true }); }
});

// -- 6. multi-dag: saveDagHead + loadDag --
test('multi-dag: save and load', () => {
  const tmp = mkdtempSync(join('/tmp', 'wiring-'));
  try {
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    const dag = { id: 'test', desc: 'test', init: 'init', term: 'term', nodes: {} } as any;
    saveDagHead(tmp, 'test', dag);
    const loaded = loadDag(tmp, 'test');
    assert(loaded);
    assert.strictEqual(loaded.id, 'test');
  } finally { rmSync(tmp, { recursive: true }); }
});

// -- 7. optimize returns metrics --
test('optimize returns parallelism metrics', () => {
  const dag = {
    id: 'opt', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 's', produces: ['a'], consumes: [], deps: [], validate: [] },
      mid: { id: 'mid', desc: 'm', produces: ['b'], consumes: ['a'], deps: ['init'], validate: [] },
      term: { id: 'term', desc: 'e', produces: [], consumes: ['b'], deps: ['mid'], validate: [] },
    },
  } as any;
  const result = optimize(dag);
  assert(typeof result.levelsBefore === 'number');
  assert(typeof result.utilizationBefore === 'number');
  assert(Array.isArray(result.removable));
});
