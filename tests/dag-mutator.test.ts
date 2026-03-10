import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  insertNode, removeNode, modifyNode,
  validateMutation, commitMutation, loadMutationLog,
  MutationError, type MutationRecord,
} from '../src/lib/dag-mutator.ts';
import type { Graph } from '../src/protocol.ts';

// Helper: create a trailAppender that writes receipt to trail.jsonl in the expected format
function makeTrailAppender(repoRoot: string, cmd: string): (receipt: MutationRecord) => void {
  return (receipt: MutationRecord) => {
    const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
    const entry = { ts: receipt.timestamp, cmd, detail: { nodeId: receipt.nodeId, receipt } };
    appendFileSync(trailPath, JSON.stringify(entry) + '\n', 'utf-8');
  };
}

// Helper: write a trail entry with a mutation receipt directly (for gate tests)
function writeTrailReceipt(repoRoot: string, receipt: MutationRecord, cmd = 'dag.insert'): void {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  const entry = { ts: receipt.timestamp, cmd, detail: { nodeId: receipt.nodeId, receipt } };
  appendFileSync(trailPath, JSON.stringify(entry) + '\n', 'utf-8');
}

// Minimal valid DAG for testing
function makeDag(extra: Record<string, any> = {}): Graph<string> {
  return {
    id: 'test-dag',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      middle: { id: 'middle', desc: 'work', produces: ['out.ts'], consumes: [], deps: ['init'], validate: [{ type: 'artifact-exists' }], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['middle'], validate: [], idempotent: true },
      ...extra,
    },
  } as any;
}

function setupRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'dag-mutator-'));
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  return root;
}

describe('dag-mutator', () => {
  let root: string;

  beforeEach(() => { root = setupRepo(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // Test 1: Insert valid node -> DAG valid, receipt recorded
  it('inserts a valid node with receipt', () => {
    const dag = makeDag();
    const { dag: mutated, receipt } = insertNode(dag, {
      id: 'new-node',
      desc: 'new work',
      produces: ['new.ts'],
      consumes: [],
      deps: ['middle'],
    }, 'adding new node');

    expect((mutated.nodes as any)['new-node']).toBeDefined();
    expect(receipt.op).toBe('insert');
    expect(receipt.nodeId).toBe('new-node');
    expect(receipt.note).toBe('adding new node');
    expect(receipt.dagValidation.define).toBe(true);
    expect(receipt.dagValidation.verify).toBe(true);
    // check may warn (node doesn't reach term yet) but insert still succeeds
  });

  // Test 2: Insert node creating cycle -> rejected
  it('rejects insert that creates a cycle', () => {
    // Create a DAG with a mutual dep that will create a cycle
    // init -> A -> term, but A deps on term (cycle: A -> term -> ... but term deps on A already)
    const dag: Graph<string> = {
      id: 'test-dag', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        a: { id: 'a', desc: 'node a', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
      },
    } as any;
    // Insert a node that deps on term AND have 'a' dep on it -> creates cycle: a -> cycle-node -> term -> a
    // But we can't modify 'a' during insert. Instead test via modifyNode creating cycle.
    // For insertNode: insert a node with deps=['a'] is fine (no cycle).
    // A cycle via insert alone is hard since insert doesn't modify existing nodes' deps.
    // Test cycle detection via modifyNode instead — see test 9.
    // For insert: test that define() catches a cycle if we manually create one.
    // Actually, deps: ['term'] with existing term->a->init is fine, no cycle.
    // Let's test the define gate differently: insert a node whose id matches init/term creates structural issues.
    // Better: just test that insertNode with deps on nonexistent is caught (test 3 covers that).
    // Remap this test to verify define() rejects a broken structure.

    // Create cycle by modifying existing node to create one, then verify validateMutation catches it
    const result = JSON.parse(JSON.stringify(dag));
    result.nodes.a.deps = ['term']; // a deps term, term deps a -> cycle
    const validation = validateMutation(dag, result);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e: string) => e.startsWith('define:'))).toBe(true);
  });

  // Test 3: Insert node with missing dep -> rejected
  it('rejects insert with nonexistent dep', () => {
    const dag = makeDag();
    expect(() => insertNode(dag, {
      id: 'orphan',
      desc: 'orphan node',
      produces: [],
      consumes: [],
      deps: ['nonexistent'],
    }, 'bad dep')).toThrow();
  });

  // Test 4: Remove leaf node -> DAG valid, receipt recorded
  it('removes a leaf node with receipt', () => {
    // Add a leaf node that nothing depends on (true leaf)
    const dag = makeDag({
      leaf: { id: 'leaf', desc: 'leaf', produces: [], consumes: [], deps: ['middle'], validate: [], idempotent: true },
    });
    // leaf depends on middle but nothing depends on leaf — it's a true leaf

    const { dag: mutated, receipt } = removeNode(dag, 'leaf', 'removing leaf');
    expect((mutated.nodes as any)['leaf']).toBeUndefined();
    expect(receipt.op).toBe('remove');
    expect(receipt.nodeId).toBe('leaf');
    expect(receipt.before).toBeDefined();
  });

  // Test 5: Remove node with dependents (no cascade) -> rejected
  it('rejects remove when node has dependents without cascade', () => {
    const dag = makeDag();
    expect(() => removeNode(dag, 'middle', 'try remove middle')).toThrow(/depended on by/);
  });

  // Test 6: Remove node with dependents (cascade) -> removes chain
  it('removes node chain with cascade', () => {
    const dag = makeDag({
      extra: { id: 'extra', desc: 'extra', produces: [], consumes: [], deps: ['middle'], validate: [], idempotent: true },
    });
    // term depends on middle, extra depends on middle
    // With cascade, removing middle should also remove term and extra (they only depend on middle)
    // But term is protected — so cascade removes extra and term loses its dep on middle
    // Actually: init/term are protected from removal. term's dep on middle gets cleaned.
    // extra only depends on middle, so it gets cascaded.

    // Let's test with a simpler case: a chain after middle
    const dag2 = makeDag({
      step1: { id: 'step1', desc: 's1', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: true },
      step2: { id: 'step2', desc: 's2', produces: [], consumes: [], deps: ['step1'], validate: [], idempotent: true },
    });
    // term depends on middle, step2 depends on step1
    // Remove step1 with cascade -> step2 (only dep is step1) gets removed too
    const { dag: mutated, receipt } = removeNode(dag2, 'step1', 'cascade remove', { cascade: true });
    expect((mutated.nodes as any)['step1']).toBeUndefined();
    expect((mutated.nodes as any)['step2']).toBeUndefined();
    expect(receipt.op).toBe('remove');
  });

  // Test 7: Remove init/term -> rejected
  it('rejects removing init node', () => {
    const dag = makeDag();
    expect(() => removeNode(dag, 'init', 'try remove init')).toThrow(/Cannot remove init/);
  });

  it('rejects removing term node', () => {
    const dag = makeDag();
    expect(() => removeNode(dag, 'term', 'try remove term')).toThrow(/Cannot remove term/);
  });

  // Test 8: Modify node desc -> DAG valid, receipt recorded
  it('modifies node description with receipt', () => {
    const dag = makeDag();
    const { dag: mutated, receipt } = modifyNode(dag, 'middle', { desc: 'updated work' }, 'update desc');
    expect((mutated.nodes as any)['middle'].desc).toBe('updated work');
    expect(receipt.op).toBe('modify');
    expect(receipt.before).toBeDefined();
    expect(receipt.after).toBeDefined();
    expect((receipt.before as any).desc).toBe('work');
    expect((receipt.after as any).desc).toBe('updated work');
  });

  // Test 9: Modify node deps creating cycle -> rejected
  it('rejects modify that creates cycle', () => {
    const dag = makeDag();
    // Make init depend on term (creates cycle)
    expect(() => modifyNode(dag, 'init', { deps: ['term'] } as any, 'cycle modify')).toThrow(MutationError);
  });

  // Test 10: Modify node produces -> receipt captures before/after
  it('captures before/after for produces change', () => {
    const dag = makeDag();
    const { receipt } = modifyNode(dag, 'middle', { produces: ['new-out.ts'] }, 'change produces');
    expect((receipt.before as any).produces).toEqual(['out.ts']);
    expect((receipt.after as any).produces).toEqual(['new-out.ts']);
  });

  // Test 11: Mutation log persists across operations
  it('persists mutation log across operations', () => {
    const dag = makeDag();
    const { dag: d1, receipt: r1 } = insertNode(dag, {
      id: 'n1', desc: 'first', produces: [], consumes: [], deps: ['init'],
    }, 'first insert');
    commitMutation(root, d1, r1, makeTrailAppender(root, 'dag.insert'));

    const { dag: d2, receipt: r2 } = insertNode(d1, {
      id: 'n2', desc: 'second', produces: [], consumes: [], deps: ['n1'],
    }, 'second insert');
    commitMutation(root, d2, r2, makeTrailAppender(root, 'dag.insert'));

    const log = loadMutationLog(root);
    expect(log.mutations).toHaveLength(2);
    expect(log.mutations[0].nodeId).toBe('n1');
    expect(log.mutations[1].nodeId).toBe('n2');
  });

  // Test 12: Mutation log is append-only
  it('mutation log is append-only', () => {
    const dag = makeDag();
    const { dag: d1, receipt: r1 } = insertNode(dag, {
      id: 'a1', desc: 'a', produces: [], consumes: [], deps: ['init'],
    }, 'first');
    commitMutation(root, d1, r1, makeTrailAppender(root, 'dag.insert'));

    // Read raw trail file
    const raw1 = readFileSync(join(root, '.roadmap/trail.jsonl'), 'utf-8');
    const lines1 = raw1.trim().split('\n');
    expect(lines1).toHaveLength(1);

    const { dag: d2, receipt: r2 } = modifyNode(d1, 'a1', { desc: 'updated' }, 'modify');
    commitMutation(root, d2, r2, makeTrailAppender(root, 'dag.modify'));

    const raw2 = readFileSync(join(root, '.roadmap/trail.jsonl'), 'utf-8');
    const lines2 = raw2.trim().split('\n');
    expect(lines2).toHaveLength(2);
    // First line unchanged
    expect(lines2[0]).toBe(lines1[0]);
  });

  // Test 13: commitMutation writes head.json and receipt to trail.jsonl via appender
  it('commitMutation writes head.json and receipt to trail.jsonl via appender', () => {
    const dag = makeDag();
    const { dag: mutated, receipt } = insertNode(dag, {
      id: 'committed', desc: 'test commit', produces: [], consumes: [], deps: ['init'],
    }, 'commit test');
    commitMutation(root, mutated, receipt, makeTrailAppender(root, 'dag.insert'));

    const headPath = join(root, '.roadmap/head.json');
    expect(existsSync(headPath)).toBe(true);
    const written = JSON.parse(readFileSync(headPath, 'utf-8'));
    expect(written.nodes['committed']).toBeDefined();

    const trailPath = join(root, '.roadmap/trail.jsonl');
    expect(existsSync(trailPath)).toBe(true);
    const log = loadMutationLog(root);
    expect(log.mutations).toHaveLength(1);
    expect(log.mutations[0].nodeId).toBe('committed');
  });

  // Test 14: validateMutation detects cycle
  it('validateMutation returns errors for invalid graph', () => {
    const before = makeDag();
    // Create an after with a cycle: init depends on term
    const after = JSON.parse(JSON.stringify(before));
    after.nodes.init.deps = ['term'];

    const result = validateMutation(before, after);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Test 15: Insert duplicate node -> rejected
  it('rejects inserting duplicate node', () => {
    const dag = makeDag();
    expect(() => insertNode(dag, {
      id: 'middle', desc: 'duplicate', produces: [], consumes: [], deps: ['init'],
    }, 'dup')).toThrow(/already exists/);
  });

  // Test 16: Remove nonexistent node -> rejected
  it('rejects removing nonexistent node', () => {
    const dag = makeDag();
    expect(() => removeNode(dag, 'nonexistent', 'remove ghost')).toThrow(/not found/);
  });

  // Test 17: Modify nonexistent node -> rejected
  it('rejects modifying nonexistent node', () => {
    const dag = makeDag();
    expect(() => modifyNode(dag, 'nonexistent', { desc: 'ghost' }, 'modify ghost')).toThrow(/not found/);
  });

  // Test 18: loadMutationLog on empty repo returns empty
  it('returns empty log when no mutations file exists', () => {
    const log = loadMutationLog(root);
    expect(log.mutations).toEqual([]);
  });
});

// Pre-commit gate: mutation receipt check
import { validateDagOrigin } from '../scripts/validate-dag-origin.ts';

describe('validate-dag-origin mutation receipt gate', () => {
  let root: string;

  beforeEach(() => { root = setupRepo(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function writeOrigin() {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify({
      schemaVersion: 1,
      engine: 'spec-kit',
      version: '1.0.0',
      compile_hash: 'a'.repeat(64),
      spec_sha: 'b'.repeat(64),
      importedAt: '2026-03-03T00:00:00Z',
      dagId: 'test-dag',
    }));
  }

  function writeHead() {
    writeFileSync(join(root, '.roadmap/head.json'), JSON.stringify({ id: 'test-dag', nodes: {} }));
  }

  // Test 14 from spec: Pre-commit gate detects manual edit (stale receipt in trail.jsonl)
  it('detects manual edit when trail.jsonl has stale receipt', () => {
    writeOrigin();
    writeHead();
    // Write a stale mutation receipt (2 minutes ago)
    const staleReceipt: MutationRecord = {
      op: 'insert',
      nodeId: 'x',
      timestamp: new Date(Date.now() - 120_000).toISOString(),
      note: 'old',
      dagValidation: { define: true, verify: true, check: true },
    };
    writeTrailReceipt(root, staleReceipt);

    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('missing-mutation-receipt');
  });

  // Test 15 from spec: Pre-commit gate passes with valid (recent) mutation receipt
  it('passes when recent mutation receipt exists', () => {
    writeOrigin();
    writeHead();
    const freshReceipt: MutationRecord = {
      op: 'insert',
      nodeId: 'x',
      timestamp: new Date().toISOString(),
      note: 'fresh',
      dagValidation: { define: true, verify: true, check: true },
    };
    writeTrailReceipt(root, freshReceipt);

    const result = validateDagOrigin(root);
    expect(result.ok).toBe(true);
  });
});
