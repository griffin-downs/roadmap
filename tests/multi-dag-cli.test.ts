import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { saveDagHead, migrateSingleHead, loadDag, loadAllDags } from '../src/lib/multi-dag.ts';

function makeTmpRepo() {
  const tmp = mkdtempSync(join('/tmp', 'multi-dag-'));
  mkdirSync(join(tmp, '.roadmap'), { recursive: true });
  return tmp;
}

const minimalDAG = {
  id: 'test-dag',
  desc: 'test',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
    term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'], validate: [] },
  },
};

test('saveDagHead writes to heads/ directory', () => {
  const tmp = makeTmpRepo();
  try {
    saveDagHead(tmp, 'test-dag', minimalDAG as any);
    assert(existsSync(join(tmp, '.roadmap', 'heads', 'test-dag.json')));
    const content = JSON.parse(readFileSync(join(tmp, '.roadmap', 'heads', 'test-dag.json'), 'utf-8'));
    assert.strictEqual(content.id, 'test-dag');
  } finally { rmSync(tmp, { recursive: true }); }
});

test('migrateSingleHead moves head.json to heads/', () => {
  const tmp = makeTmpRepo();
  try {
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify(minimalDAG));
    const migrated = migrateSingleHead(tmp);
    assert(migrated);
    assert(!existsSync(join(tmp, '.roadmap', 'head.json')));
    assert(existsSync(join(tmp, '.roadmap', 'heads', 'test-dag.json')));
  } finally { rmSync(tmp, { recursive: true }); }
});

test('loadDag returns specific DAG by id', () => {
  const tmp = makeTmpRepo();
  try {
    saveDagHead(tmp, 'dag-a', { ...minimalDAG, id: 'dag-a' } as any);
    saveDagHead(tmp, 'dag-b', { ...minimalDAG, id: 'dag-b' } as any);
    const dag = loadDag(tmp, 'dag-b');
    assert(dag);
    assert.strictEqual(dag.id, 'dag-b');
  } finally { rmSync(tmp, { recursive: true }); }
});

test('loadAllDags returns all DAGs', () => {
  const tmp = makeTmpRepo();
  try {
    saveDagHead(tmp, 'dag-a', { ...minimalDAG, id: 'dag-a' } as any);
    saveDagHead(tmp, 'dag-b', { ...minimalDAG, id: 'dag-b' } as any);
    const all = loadAllDags(tmp);
    assert.strictEqual(all.size, 2);
  } finally { rmSync(tmp, { recursive: true }); }
});
