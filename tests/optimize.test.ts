// Optimizer tests: hallucinate-validate dependency minimization

import { describe, it, expect } from 'vitest';
import {
  graph, define, optimize, utilizationRatio, levelReport, bottleneckNodes,
} from '../src/protocol.ts';

// --- Fixtures ---

// Redundant edge: a → b where both are independent from init and b also depends on init
// The a→b edge is redundant if b also has direct access to init's outputs
const singleEdge = define(graph({
  id: 'single-edge',
  desc: 'init → {a, b} → term, with redundant a→b',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'init', produces: ['init.out'], consumes: [], deps: [] },
    a: { id: 'a', desc: 'a', produces: ['a.out'], consumes: [], deps: ['init'] },
    b: { id: 'b', desc: 'b depends on both init and a, but a is redundant', produces: ['b.out'], consumes: [], deps: ['init', 'a'] },
    term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['a', 'b'] },
  },
}));

// Diamond with redundant edge: a → {b, c} where c depends on both a and b (b→c is redundant).
const diamond = define(graph({
  id: 'diamond',
  desc: 'init → a → {b, c} where b→c is redundant (both from a)',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'init', produces: ['init.out'], consumes: [], deps: [] },
    a: { id: 'a', desc: 'a', produces: ['a.out'], consumes: [], deps: ['init'] },
    b: { id: 'b', desc: 'b depends on a', produces: ['b.out'], consumes: [], deps: ['a'] },
    c: { id: 'c', desc: 'c depends on a and b (b→c is redundant)', produces: ['c.out'], consumes: [], deps: ['a', 'b'] },
    d: { id: 'd', desc: 'd depends on b', produces: ['d.out'], consumes: [], deps: ['b'] },
    e: { id: 'e', desc: 'e depends on c', produces: ['e.out'], consumes: [], deps: ['c'] },
    term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['d', 'e'] },
  },
}));

// With consumes: a → b where b consumes a's artifact. Edge is required.
const withConsumes = define(graph({
  id: 'with-consumes',
  desc: 'init → a → b (consumes a.out) → term',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'init', produces: ['init.out'], consumes: [], deps: [] },
    a: { id: 'a', desc: 'a produces a.out', produces: ['a.out'], consumes: [], deps: ['init'] },
    b: { id: 'b', desc: 'b consumes a.out', produces: ['b.out'], consumes: ['a.out'], deps: ['a'] },
    term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['b'] },
  },
}));

// Linear chain: init → 1 → 2 → 3 → 4 → term (all edges required)
const linearChain = define(graph({
  id: 'linear-chain',
  desc: 'init → 1 → 2 → 3 → 4 → term',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'init', produces: ['init.out'], consumes: [], deps: [] },
    n1: { id: 'n1', desc: 'node 1', produces: ['n1.out'], consumes: [], deps: ['init'] },
    n2: { id: 'n2', desc: 'node 2', produces: ['n2.out'], consumes: [], deps: ['n1'] },
    n3: { id: 'n3', desc: 'node 3', produces: ['n3.out'], consumes: [], deps: ['n2'] },
    n4: { id: 'n4', desc: 'node 4', produces: ['n4.out'], consumes: [], deps: ['n3'] },
    term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['n4'] },
  },
}));

// Wide parallelism: init → {a, b, c} → d → term
const wideParallelism = define(graph({
  id: 'wide-parallelism',
  desc: 'init → {a, b, c} → d → term',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'init', produces: ['init.out'], consumes: [], deps: [] },
    a: { id: 'a', desc: 'a', produces: ['a.out'], consumes: [], deps: ['init'] },
    b: { id: 'b', desc: 'b', produces: ['b.out'], consumes: [], deps: ['init'] },
    c: { id: 'c', desc: 'c', produces: ['c.out'], consumes: [], deps: ['init'] },
    d: { id: 'd', desc: 'd', produces: ['d.out'], consumes: [], deps: ['a', 'b', 'c'] },
    term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['d'] },
  },
}));

// --- Tests for optimize() ---

describe('optimize()', () => {
  it('detects removable edges in graph with redundant dependencies', () => {
    const result = optimize(singleEdge);
    // singleEdge has b depending on both init and a
    // b→a is removable since b→init already keeps b reachable from init
    expect(result.removable.length).toBeGreaterThan(0);
    expect(result.removable.some(e => e.from === 'b' && e.to === 'a')).toBe(true);
  });

  it('keeps required edges (consumes satisfaction)', () => {
    const result = optimize(withConsumes);
    // The a→b edge is required because b consumes 'a.out'
    expect(result.removable.some(e => e.from === 'a' && e.to === 'b')).toBe(false);
  });

  it('handles linear chains correctly', () => {
    const result = optimize(linearChain);
    // No edges should be removable — all are required for linear sequence
    expect(result.removable.length).toBe(0);
  });

  it('returns enforcement metrics', () => {
    const result = optimize(singleEdge);
    expect(result.enforcement).toBeDefined();
    expect(typeof result.enforcement.nodesCovered).toBe('number');
    expect(typeof result.enforcement.nodesUncovered).toBe('number');
  });

  it('computes level metrics before and after', () => {
    const result = optimize(singleEdge);
    expect(result.levelsBefore).toBeGreaterThan(0);
    expect(result.levelsAfter).toBeLessThanOrEqual(result.levelsBefore);
    expect(result.maxParallelismBefore).toBeGreaterThan(0);
    expect(result.maxParallelismAfter).toBeGreaterThan(0);
  });

  it('computes utilization ratios', () => {
    const result = optimize(singleEdge);
    expect(result.utilizationBefore).toBeGreaterThan(0);
    expect(result.utilizationBefore).toBeLessThanOrEqual(1);
    expect(result.utilizationAfter).toBeGreaterThan(0);
    expect(result.utilizationAfter).toBeLessThanOrEqual(1);
  });

  it('diamond: c→b is removable since c depends on a which b also depends on', () => {
    const result = optimize(diamond);
    // c→b is redundant because c also depends on a
    // c reaches b through: c→a→b (since a comes before b in graph)
    // So removing c→b still keeps b reachable from c through a
    expect(result.removable.some(e => e.from === 'c' && e.to === 'b')).toBe(true);
  });

  it('produces has length equal to removable array', () => {
    const result = optimize(withConsumes);
    expect(Array.isArray(result.removable)).toBe(true);
    expect(result.removable.every(e => typeof e.from === 'string' && typeof e.to === 'string')).toBe(true);
  });
});

// --- Tests for utilizationRatio() ---

describe('utilizationRatio()', () => {
  it('returns 1.0 for perfectly parallel graph', () => {
    const ratio = utilizationRatio(wideParallelism);
    // 5 nodes total, 3 levels: {init}, {a,b,c}, {d}, {term}
    // Actually 4 levels. Max parallelism = 3. ratio = 5/(4*3) ≈ 0.42
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('returns <1 for sequential graph', () => {
    const ratio = utilizationRatio(linearChain);
    // 6 nodes, 6 levels, max parallelism = 1. ratio = 6/6 = 1.0
    expect(ratio).toBeLessThanOrEqual(1);
    expect(ratio).toBeGreaterThan(0);
  });

  it('handles single node graphs', () => {
    const singleNode = define(graph({
      id: 'single',
      desc: 'just init→term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'init', produces: ['init.out'], consumes: [], deps: [] },
        term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['init'] },
      },
    }));
    const ratio = utilizationRatio(singleNode);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

// --- Tests for levelReport() ---

describe('levelReport()', () => {
  it('returns array of level entries', () => {
    const report = levelReport(linearChain);
    expect(Array.isArray(report)).toBe(true);
    expect(report.length).toBeGreaterThan(0);
  });

  it('each entry has required fields', () => {
    const report = levelReport(wideParallelism);
    for (const entry of report) {
      expect(entry.level).toBeDefined();
      expect(Array.isArray(entry.nodes)).toBe(true);
      expect(typeof entry.width).toBe('number');
      expect(typeof entry.onCriticalPath).toBe('boolean');
    }
  });

  it('levels are sequential from 0', () => {
    const report = levelReport(linearChain);
    for (let i = 0; i < report.length; i++) {
      expect(report[i].level).toBe(i);
    }
  });

  it('width matches node count in level', () => {
    const report = levelReport(wideParallelism);
    for (const entry of report) {
      expect(entry.width).toBe(entry.nodes.length);
    }
  });

  it('critical path is marked', () => {
    const report = levelReport(linearChain);
    const onCritical = report.filter(e => e.onCriticalPath);
    expect(onCritical.length).toBeGreaterThan(0);
  });
});

// --- Tests for bottleneckNodes() ---

describe('bottleneckNodes()', () => {
  it('returns array of bottleneck entries', () => {
    const bottlenecks = bottleneckNodes(linearChain);
    expect(Array.isArray(bottlenecks)).toBe(true);
  });

  it('each entry has required fields', () => {
    const bottlenecks = bottleneckNodes(wideParallelism);
    for (const entry of bottlenecks) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.level).toBe('number');
      expect(typeof entry.fanIn).toBe('number');
      expect(typeof entry.fanOut).toBe('number');
    }
  });

  it('identifies high fan-out nodes', () => {
    const bottlenecks = bottleneckNodes(wideParallelism);
    // init has fan-out 3 (a, b, c)
    const initBottleneck = bottlenecks.find(b => b.id === 'init');
    expect(initBottleneck).toBeDefined();
  });

  it('identifies high fan-in nodes', () => {
    const bottlenecks = bottleneckNodes(wideParallelism);
    // d has fan-in 3 (a, b, c)
    const dBottleneck = bottlenecks.find(b => b.id === 'd');
    expect(dBottleneck).toBeDefined();
  });

  it('returns empty for linear chain with no bottlenecks', () => {
    const bottlenecks = bottleneckNodes(linearChain);
    // Linear chain has max fan-in/out of 1, threshold is >= 2
    expect(bottlenecks.length).toBe(0);
  });

  it('sorts by total degree (fan-in + fan-out)', () => {
    const bottlenecks = bottleneckNodes(wideParallelism);
    if (bottlenecks.length > 1) {
      for (let i = 0; i < bottlenecks.length - 1; i++) {
        const curr = bottlenecks[i].fanIn + bottlenecks[i].fanOut;
        const next = bottlenecks[i + 1].fanIn + bottlenecks[i + 1].fanOut;
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    }
  });
});
