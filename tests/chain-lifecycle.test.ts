import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendLink,
  loadChain,
  currentIteration,
  archiveHead,
  getRootIntent,
  parseExecutionReport,
} from '../src/lib/chain.ts';
import type { ChainLink, ExecutionReport } from '../src/lib/chain.ts';
import { buildTerminalBrief } from '../src/lib/terminal-brief.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// --- Helpers ---

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'chain-lifecycle-'));
}

function ensureRoadmapDir(root: string): void {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
}

function writeHead(root: string, content: Record<string, unknown>): void {
  ensureRoadmapDir(root);
  writeFileSync(join(root, '.roadmap', 'head.json'), JSON.stringify(content, null, 2));
}

function makeLink(overrides: Partial<ChainLink> = {}): ChainLink {
  return {
    dagId: 'dag-001',
    iteration: 0,
    predecessorId: null,
    completedAt: '2026-03-01T00:00:00Z',
    successorDagId: null,
    ...overrides,
  };
}

function makeExecutionReport(overrides: Partial<ExecutionReport> = {}): ExecutionReport {
  return {
    nodesExecuted: 5,
    totalDuration: 12000,
    retriesPerNode: { 'node-a': 1, 'node-b': 0 },
    observations: ['All nodes completed', 'No blockers'],
    blockers: [],
    deltaAssessment: 'Full convergence achieved',
    ...overrides,
  };
}

function buildDAG(specs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(specs)) {
    nodes[id] = {
      id,
      desc: 'test node',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
      ...spec,
    };
  }
  return { id: 'test-dag', desc: 'Test DAG for lifecycle', init: 'init', term: 'term', nodes } as any;
}

// --- Tests ---

describe('Chain storage: appendLink, loadChain, currentIteration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadChain returns empty array on empty dir', () => {
    expect(loadChain(tmpDir)).toEqual([]);
  });

  it('currentIteration returns 0 on empty dir', () => {
    expect(currentIteration(tmpDir)).toBe(0);
  });

  it('appendLink then loadChain returns the link', () => {
    const link = makeLink();
    appendLink(tmpDir, link);
    const chain = loadChain(tmpDir);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toEqual(link);
  });

  it('appending two links returns chain of length 2', () => {
    const link1 = makeLink({ dagId: 'dag-001', iteration: 0 });
    const link2 = makeLink({ dagId: 'dag-002', iteration: 1, predecessorId: 'dag-001' });
    appendLink(tmpDir, link1);
    appendLink(tmpDir, link2);
    const chain = loadChain(tmpDir);
    expect(chain).toHaveLength(2);
    expect(chain[0].dagId).toBe('dag-001');
    expect(chain[1].dagId).toBe('dag-002');
  });

  it('currentIteration returns max iteration number', () => {
    appendLink(tmpDir, makeLink({ iteration: 0 }));
    appendLink(tmpDir, makeLink({ iteration: 3 }));
    appendLink(tmpDir, makeLink({ iteration: 1 }));
    expect(currentIteration(tmpDir)).toBe(3);
  });
});

describe('archiveHead', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('archives head.json to heads/<dagId>.json and creates head-index.json', () => {
    writeHead(tmpDir, { id: 'test-dag', desc: 'test description' });
    archiveHead(tmpDir);

    // head.json removed
    expect(existsSync(join(tmpDir, '.roadmap', 'head.json'))).toBe(false);

    // heads/test-dag.json exists with original content
    const archivePath = join(tmpDir, '.roadmap', 'heads', 'test-dag.json');
    expect(existsSync(archivePath)).toBe(true);
    const archived = JSON.parse(readFileSync(archivePath, 'utf-8'));
    expect(archived.id).toBe('test-dag');
    expect(archived.desc).toBe('test description');

    // head-index.json has entry
    const indexPath = join(tmpDir, '.roadmap', 'head-index.json');
    expect(existsSync(indexPath)).toBe(true);
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index).toHaveLength(1);
    expect(index[0].dagId).toBe('test-dag');
    expect(index[0].predecessor).toBeNull();
  });

  it('second archiveHead links predecessor correctly', () => {
    // First archive
    writeHead(tmpDir, { id: 'dag-alpha', desc: 'first' });
    archiveHead(tmpDir);

    // Second archive
    writeHead(tmpDir, { id: 'dag-beta', desc: 'second' });
    archiveHead(tmpDir);

    const index = JSON.parse(readFileSync(join(tmpDir, '.roadmap', 'head-index.json'), 'utf-8'));
    expect(index).toHaveLength(2);
    expect(index[0].dagId).toBe('dag-alpha');
    expect(index[0].predecessor).toBeNull();
    expect(index[1].dagId).toBe('dag-beta');
    expect(index[1].predecessor).toBe('dag-alpha');
  });

  it('throws when head.json does not exist', () => {
    ensureRoadmapDir(tmpDir);
    expect(() => archiveHead(tmpDir)).toThrow(/No head\.json found/);
  });
});

describe('getRootIntent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns current head.json desc when no chain exists', () => {
    writeHead(tmpDir, { id: 'current-dag', desc: 'Build the authentication system' });
    expect(getRootIntent(tmpDir)).toBe('Build the authentication system');
  });

  it('returns archived head desc for iteration 0 when chain exists', () => {
    // Set up: archive the first head, then add a chain entry for it
    writeHead(tmpDir, { id: 'root-dag', desc: 'Original root intent' });
    archiveHead(tmpDir);

    // Add chain entry linking to the archived head
    appendLink(tmpDir, makeLink({ dagId: 'root-dag', iteration: 0 }));

    // getRootIntent should walk chain to iteration 0 and read archived desc
    expect(getRootIntent(tmpDir)).toBe('Original root intent');
  });

  it('throws when no head.json and no chain entries', () => {
    ensureRoadmapDir(tmpDir);
    expect(() => getRootIntent(tmpDir)).toThrow(/No head\.json and no chain entries/);
  });
});

describe('parseExecutionReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid ExecutionReport from file', () => {
    const report = makeExecutionReport({ tokensConsumed: 50000 });
    const filePath = join(tmpDir, 'report.json');
    writeFileSync(filePath, JSON.stringify(report));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.nodesExecuted).toBe(5);
    expect(parsed.totalDuration).toBe(12000);
    expect(parsed.retriesPerNode).toEqual({ 'node-a': 1, 'node-b': 0 });
    expect(parsed.observations).toEqual(['All nodes completed', 'No blockers']);
    expect(parsed.blockers).toEqual([]);
    expect(parsed.deltaAssessment).toBe('Full convergence achieved');
    expect(parsed.tokensConsumed).toBe(50000);
  });

  it('parses report without optional tokensConsumed', () => {
    const report = makeExecutionReport();
    const filePath = join(tmpDir, 'report.json');
    writeFileSync(filePath, JSON.stringify(report));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.tokensConsumed).toBeUndefined();
  });

  it('throws on missing required field (nodesExecuted)', () => {
    const filePath = join(tmpDir, 'bad.json');
    writeFileSync(filePath, JSON.stringify({
      totalDuration: 100,
      retriesPerNode: {},
      observations: [],
      blockers: [],
      deltaAssessment: 'ok',
    }));
    expect(() => parseExecutionReport(filePath)).toThrow(/nodesExecuted must be a number/);
  });

  it('throws on missing required field (observations not array)', () => {
    const filePath = join(tmpDir, 'bad2.json');
    writeFileSync(filePath, JSON.stringify({
      nodesExecuted: 1,
      totalDuration: 100,
      retriesPerNode: {},
      observations: 'not-an-array',
      blockers: [],
      deltaAssessment: 'ok',
    }));
    expect(() => parseExecutionReport(filePath)).toThrow(/observations must be an array/);
  });

  it('throws on non-existent file', () => {
    expect(() => parseExecutionReport(join(tmpDir, 'nope.json'))).toThrow(/file not found/);
  });
});

describe('buildTerminalBrief', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aggregates all six context layers', () => {
    // Set up: simple 2-node DAG
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });

    // Write head.json (for getRootIntent fallback)
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG for lifecycle' });

    // Write completed.json with completion records
    const completedPath = join(tmpDir, '.roadmap', 'completed.json');
    writeFileSync(completedPath, JSON.stringify([
      { nodeId: 'init', completedAt: '2026-03-01T00:00:00Z', validationChecks: [] },
    ]));

    // Write a handoff file
    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    mkdirSync(handoffDir, { recursive: true });
    writeFileSync(join(handoffDir, 'init-setup.json'), JSON.stringify({
      summary: 'Initialized project structure',
      keyDecisions: ['Used TypeScript'],
      gotchas: ['Requires Node 20+'],
      timestamp: '2026-03-01T00:00:00Z',
    }));

    const brief = buildTerminalBrief(dag, tmpDir);

    // Layer 1: rootIntent
    expect(brief.rootIntent).toBe('Test DAG for lifecycle');

    // Layer 2: iteration
    expect(brief.iteration).toBe(0);

    // Layer 3: chainHistory
    expect(brief.chainHistory).toEqual([]);

    // Layer 4: completionEvidence
    expect(brief.completionEvidence).toBeInstanceOf(Map);
    expect(brief.completionEvidence.has('init')).toBe(true);

    // Layer 5: handoffSummaries
    expect(brief.handoffSummaries).toHaveLength(1);
    expect(brief.handoffSummaries[0].nodeId).toBe('init-setup');
    expect(brief.handoffSummaries[0].summary).toBe('Initialized project structure');
    expect(brief.handoffSummaries[0].keyDecisions).toEqual(['Used TypeScript']);
    expect(brief.handoffSummaries[0].gotchas).toEqual(['Requires Node 20+']);
  });

  it('excludes interim handoff files', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test' });

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    mkdirSync(handoffDir, { recursive: true });
    writeFileSync(join(handoffDir, 'setup.json'), JSON.stringify({
      summary: 'Setup done',
      timestamp: '2026-03-01T00:00:00Z',
    }));
    // Interim file should be excluded (contains '-interim-' in name)
    writeFileSync(join(handoffDir, 'setup-interim-2026-03-01T00-00-00.json'), JSON.stringify({
      summary: 'Interim checkpoint',
      timestamp: '2026-03-01T00:30:00Z',
    }));

    const brief = buildTerminalBrief(dag, tmpDir);
    expect(brief.handoffSummaries).toHaveLength(1);
    expect(brief.handoffSummaries[0].nodeId).toBe('setup');
  });

  it('passes through executionReport when provided', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test' });

    const report = makeExecutionReport();
    const brief = buildTerminalBrief(dag, tmpDir, report);
    expect(brief.executionReport).toBeDefined();
    expect(brief.executionReport!.nodesExecuted).toBe(5);
  });
});

describe('ExecutionReport roundtrip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('write → parse preserves all fields', () => {
    const original = makeExecutionReport({ tokensConsumed: 75000 });
    const filePath = join(tmpDir, 'roundtrip.json');
    writeFileSync(filePath, JSON.stringify(original));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.nodesExecuted).toBe(original.nodesExecuted);
    expect(parsed.totalDuration).toBe(original.totalDuration);
    expect(parsed.retriesPerNode).toEqual(original.retriesPerNode);
    expect(parsed.tokensConsumed).toBe(original.tokensConsumed);
    expect(parsed.observations).toEqual(original.observations);
    expect(parsed.blockers).toEqual(original.blockers);
    expect(parsed.deltaAssessment).toBe(original.deltaAssessment);
  });

  it('roundtrip without optional tokensConsumed preserves undefined', () => {
    const original = makeExecutionReport();
    delete (original as any).tokensConsumed;
    const filePath = join(tmpDir, 'roundtrip-no-tokens.json');
    writeFileSync(filePath, JSON.stringify(original));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.tokensConsumed).toBeUndefined();
  });
});
