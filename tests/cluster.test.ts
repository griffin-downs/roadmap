import { describe, it, expect } from 'vitest';
import { define, graph } from '../src/protocol.ts';
import { buildClusters } from '../src/lib/utils/cluster/cluster.ts';
import { buildClustersSolver } from '../src/lib/utils/cluster/cluster-solver.ts';
import type { Graph, ValidationRule } from '../src/protocol.ts';

// --- Helpers ---

function node(id: string, overrides: Partial<{ produces: string[]; consumes: string[]; deps: string[]; validate: ValidationRule[]; idempotent: boolean; ambient: string[] }> = {}) {
  return {
    id, desc: id,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: overrides.idempotent ?? true,
    ...(overrides.ambient ? { ambient: overrides.ambient } : {}),
  };
}

// Linear chain: init → a → b → c → term (a produces x, b consumes x produces y, c consumes y)
function chainDag() {
  return define(graph({
    id: 'chain', desc: 'linear chain', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      a: node('a', { produces: ['x.ts'] }),
      b: node('b', { produces: ['y.ts'], consumes: ['x.ts'], deps: ['a'] }),
      c: node('c', { produces: ['z.ts'], consumes: ['y.ts'], deps: ['b'] }),
      term: node('term', { consumes: ['z.ts'], deps: ['c'] }),
    },
  }));
}

// Two independent chains: init → (a→b) + (c→d) → term
function parallelDag() {
  return define(graph({
    id: 'parallel', desc: 'two chains', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      a: node('a', { produces: ['alpha.ts'], deps: ['init'] }),
      b: node('b', { produces: ['alpha-out.ts'], consumes: ['alpha.ts'], deps: ['a'] }),
      c: node('c', { produces: ['beta.ts'], deps: ['init'] }),
      d: node('d', { produces: ['beta-out.ts'], consumes: ['beta.ts'], deps: ['c'] }),
      term: node('term', { consumes: ['alpha-out.ts', 'beta-out.ts'], deps: ['b', 'd'] }),
    },
  }));
}

// Dag with ambient-only sharing (no produces/consumes edge)
function ambientDag() {
  return define(graph({
    id: 'ambient', desc: 'ambient sharing', init: 'init', term: 'term',
    nodes: {
      init: node('init', { produces: ['spec.md'] }),
      a: node('a', { produces: ['out-a.ts'], deps: ['init'], ambient: ['spec.md'] }),
      b: node('b', { produces: ['out-b.ts'], deps: ['init'], ambient: ['spec.md'] }),
      term: node('term', { consumes: ['out-a.ts', 'out-b.ts'], deps: ['a', 'b'] }),
    },
  }));
}

// --- Deterministic output ---

describe('deterministic clustering', () => {
  it('same DAG → same clusters on repeated calls', () => {
    const dag = parallelDag();
    const r1 = buildClusters(dag);
    const r2 = buildClusters(dag);
    expect(r1.clusters.map(c => c.id)).toEqual(r2.clusters.map(c => c.id));
    expect(r1.clusters.map(c => c.nodes)).toEqual(r2.clusters.map(c => c.nodes));
  });

  it('clusterCount matches clusters array length', () => {
    const dag = parallelDag();
    const result = buildClusters(dag);
    expect(result.clusterCount).toBe(result.clusters.length);
  });
});

// --- Bipartite union-find ---

describe('bipartite union-find', () => {
  it('chains coupled nodes into same cluster via produces/consumes', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    // a→b→c share artifacts: all in one cluster
    expect(result.clusterCount).toBe(1);
    expect(result.clusters[0].nodes).toContain('a');
    expect(result.clusters[0].nodes).toContain('b');
    expect(result.clusters[0].nodes).toContain('c');
  });

  it('separates independent chains into different clusters', () => {
    const dag = parallelDag();
    const result = buildClusters(dag);
    expect(result.clusterCount).toBe(2);
    const clusterA = result.clusters.find(c => c.nodes.includes('a'))!;
    const clusterC = result.clusters.find(c => c.nodes.includes('c'))!;
    expect(clusterA.nodes).toContain('b');
    expect(clusterA.nodes).not.toContain('c');
    expect(clusterC.nodes).toContain('d');
    expect(clusterC.nodes).not.toContain('a');
  });
});

// --- Ambient exclusion ---

describe('ambient exclusion', () => {
  it('nodes sharing only ambient context are not clustered together', () => {
    const dag = ambientDag();
    const result = buildClusters(dag);
    // a and b share no produces/consumes edge, only ambient spec.md
    expect(result.clusterCount).toBe(2);
    const clusterA = result.clusters.find(c => c.nodes.includes('a'))!;
    expect(clusterA.nodes).not.toContain('b');
  });
});

// --- Internal order ---

describe('internalOrder', () => {
  it('follows data-flow order (topo sort) within cluster', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    const cluster = result.clusters[0];
    const idxA = cluster.internalOrder.indexOf('a');
    const idxB = cluster.internalOrder.indexOf('b');
    const idxC = cluster.internalOrder.indexOf('c');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });
});

// --- Per-cluster produces/consumes ---

describe('per-cluster produces/consumes', () => {
  it('produces lists all artifacts produced by cluster nodes', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    expect(result.clusters[0].produces).toContain('x.ts');
    expect(result.clusters[0].produces).toContain('y.ts');
    expect(result.clusters[0].produces).toContain('z.ts');
  });

  it('consumes lists all artifacts consumed by cluster nodes', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    expect(result.clusters[0].consumes).toContain('x.ts');
    expect(result.clusters[0].consumes).toContain('y.ts');
  });

  it('context is union of produces and consumes', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    const cluster = result.clusters[0];
    const expected = new Set([...cluster.produces, ...cluster.consumes]);
    expect(new Set(cluster.context)).toEqual(expected);
  });
});

// --- Cross-cluster dependencies ---

describe('crossClusterDeps', () => {
  it('detects no cross-cluster deps in independent chains', () => {
    const dag = parallelDag();
    const result = buildClusters(dag);
    for (const c of result.clusters) {
      expect(c.crossClusterDeps).toEqual([]);
    }
  });

  it('detects cross-cluster deps when clusters share artifacts', () => {
    // a produces x, b consumes x produces y (same cluster)
    // c consumes y (but c is in same cluster as a,b via chain)
    // Use a DAG where cluster boundary is forced by --max-size
    const dag = chainDag();
    const result = buildClusters(dag, { maxSize: 2 });
    // With maxSize=2, the chain a→b→c splits
    const hasXCluster = result.clusters.some(c => c.crossClusterDeps.length > 0);
    expect(hasXCluster).toBe(true);
  });

  it('via lists the specific artifacts crossing the boundary', () => {
    const dag = chainDag();
    const result = buildClusters(dag, { maxSize: 2 });
    const withDeps = result.clusters.find(c => c.crossClusterDeps.length > 0);
    if (withDeps) {
      for (const dep of withDeps.crossClusterDeps) {
        expect(dep.via.length).toBeGreaterThan(0);
        expect(dep.cluster).toBeDefined();
      }
    }
  });
});

// --- maxParallelClusters ---

describe('maxParallelClusters', () => {
  it('equals cluster count when all clusters are independent', () => {
    const dag = parallelDag();
    const result = buildClusters(dag);
    expect(result.maxParallelClusters).toBe(result.clusterCount);
  });

  it('is less than clusterCount when clusters have dependencies', () => {
    const dag = chainDag();
    const result = buildClusters(dag, { maxSize: 1 });
    // 3 nodes forced into 3 clusters with chain dependencies
    expect(result.clusterCount).toBe(3);
    expect(result.maxParallelClusters).toBeLessThanOrEqual(result.clusterCount);
    expect(result.maxParallelClusters).toBeGreaterThan(0);
  });
});

// --- max-size splitting ---

describe('max-size splitting', () => {
  it('no cluster exceeds maxSize', () => {
    const dag = chainDag();
    const result = buildClusters(dag, { maxSize: 2 });
    for (const c of result.clusters) {
      expect(c.nodes.length).toBeLessThanOrEqual(2);
    }
  });

  it('split preserves topo order within fragments', () => {
    const dag = chainDag();
    const result = buildClusters(dag, { maxSize: 2 });
    // Each split fragment should maintain data-flow order
    for (const c of result.clusters) {
      expect(c.internalOrder).toEqual(c.nodes);
    }
  });
});

// --- Coupling score ---

describe('coupling', () => {
  it('is positive for clusters with internal data-flow edges', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    expect(result.clusters[0].coupling).toBeGreaterThan(0);
  });

  it('is zero for single-node clusters', () => {
    const dag = chainDag();
    const result = buildClusters(dag, { maxSize: 1 });
    for (const c of result.clusters) {
      if (c.nodes.length === 1) {
        expect(c.coupling).toBe(0);
      }
    }
  });
});

// --- Critical flag ---

describe('critical flag', () => {
  it('marks cluster containing critical-path nodes', () => {
    const dag = chainDag();
    const result = buildClusters(dag);
    // Linear chain: all nodes are on critical path
    expect(result.clusters[0].critical).toBe(true);
  });
});

// --- Hub exclusion (--exclude-hubs) ---

// Hub DAG: types.ts produced by 'types' node, consumed by a, b, c, d.
// a→b and c→d are two real data-flow chains that should cluster separately.
function hubDag() {
  return define(graph({
    id: 'hub', desc: 'hub file DAG', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      types: node('types', { produces: ['shared/types.ts'], deps: ['init'] }),
      a: node('a', { produces: ['src/a.ts'], consumes: ['shared/types.ts'], deps: ['types'] }),
      b: node('b', { produces: ['src/b.ts'], consumes: ['shared/types.ts', 'src/a.ts'], deps: ['types', 'a'] }),
      c: node('c', { produces: ['src/c.ts'], consumes: ['shared/types.ts'], deps: ['types'] }),
      d: node('d', { produces: ['src/d.ts'], consumes: ['shared/types.ts', 'src/c.ts'], deps: ['types', 'c'] }),
      term: node('term', { consumes: ['src/b.ts', 'src/d.ts'], deps: ['b', 'd'] }),
    },
  }));
}

describe('hub exclusion', () => {
  it('without --exclude-hubs, hub file merges all consumers into one cluster', () => {
    const dag = hubDag();
    const result = buildClusters(dag);
    // types→a→b and types→c→d all share types.ts — one mega-cluster
    const megaCluster = result.clusters.find(c => c.nodes.includes('a') && c.nodes.includes('c'));
    expect(megaCluster).toBeDefined();
  });

  it('with --exclude-hubs 3, hub file is excluded and chains separate', () => {
    const dag = hubDag();
    const result = buildClusters(dag, { excludeHubs: 3 });
    // shared/types.ts consumed by 4 nodes (a, b, c, d) — hub at threshold 3
    // Without hub edge: a→b cluster, c→d cluster, types singleton
    expect(result.clusterCount).toBeGreaterThan(1);
    const clusterA = result.clusters.find(c => c.nodes.includes('a'))!;
    expect(clusterA.nodes).toContain('b');
    expect(clusterA.nodes).not.toContain('c');
    expect(clusterA.nodes).not.toContain('d');
  });

  it('reports detected hub files in result', () => {
    const dag = hubDag();
    const result = buildClusters(dag, { excludeHubs: 3 });
    expect(result.hubFiles).toBeDefined();
    expect(result.hubFiles!.length).toBeGreaterThan(0);
    const typesHub = result.hubFiles!.find(h => h.path === 'shared/types.ts');
    expect(typesHub).toBeDefined();
    expect(typesHub!.consumers).toBe(4);
  });

  it('hub files sorted by consumer count descending', () => {
    const dag = hubDag();
    const result = buildClusters(dag, { excludeHubs: 3 });
    if (result.hubFiles && result.hubFiles.length > 1) {
      for (let i = 1; i < result.hubFiles.length; i++) {
        expect(result.hubFiles[i - 1].consumers).toBeGreaterThanOrEqual(result.hubFiles[i].consumers);
      }
    }
  });

  it('threshold exactly at boundary: 4 consumers with threshold 4 → excluded', () => {
    const dag = hubDag();
    const result = buildClusters(dag, { excludeHubs: 4 });
    // shared/types.ts has exactly 4 consumers — should be excluded
    expect(result.hubFiles).toBeDefined();
    expect(result.hubFiles!.some(h => h.path === 'shared/types.ts')).toBe(true);
  });

  it('threshold above consumer count → no hubs detected, single cluster', () => {
    const dag = hubDag();
    const result = buildClusters(dag, { excludeHubs: 5 });
    // shared/types.ts has 4 consumers, threshold 5 → not a hub
    expect(result.hubFiles).toBeUndefined();
    const megaCluster = result.clusters.find(c => c.nodes.includes('a') && c.nodes.includes('c'));
    expect(megaCluster).toBeDefined();
  });

  it('composes with --max-size: hubs excluded first, then size splits', () => {
    const dag = hubDag();
    const result = buildClusters(dag, { excludeHubs: 3, maxSize: 2 });
    // Hubs excluded → separate clusters → then maxSize caps each at 2
    for (const c of result.clusters) {
      expect(c.nodes.length).toBeLessThanOrEqual(2);
    }
    expect(result.hubFiles).toBeDefined();
  });

  it('no hubFiles field when --exclude-hubs not used', () => {
    const dag = hubDag();
    const result = buildClusters(dag);
    expect(result.hubFiles).toBeUndefined();
  });

  it('deterministic: same DAG + same threshold → same clusters', () => {
    const dag = hubDag();
    const r1 = buildClusters(dag, { excludeHubs: 3 });
    const r2 = buildClusters(dag, { excludeHubs: 3 });
    expect(r1.clusters.map(c => c.id)).toEqual(r2.clusters.map(c => c.id));
    expect(r1.clusters.map(c => c.nodes)).toEqual(r2.clusters.map(c => c.nodes));
    expect(r1.hubFiles).toEqual(r2.hubFiles);
  });
});

// --- Edge cases ---

describe('edge cases', () => {
  it('handles DAG with only init and term', () => {
    const dag = define(graph({
      id: 'empty', desc: 'empty', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'] }),
      },
    }));
    const result = buildClusters(dag);
    expect(result.clusterCount).toBe(0);
    expect(result.maxParallelClusters).toBe(0);
  });

  it('handles single non-structural node', () => {
    const dag = define(graph({
      id: 'single', desc: 'single', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        a: node('a', { produces: ['x.ts'], deps: ['init'] }),
        term: node('term', { consumes: ['x.ts'], deps: ['a'] }),
      },
    }));
    const result = buildClusters(dag);
    expect(result.clusterCount).toBe(1);
    expect(result.clusters[0].nodes).toEqual(['a']);
  });

  it('agentCount equals clusterCount', () => {
    const dag = parallelDag();
    const result = buildClusters(dag);
    expect(result.agentCount).toBe(result.clusterCount);
  });
});

// ============================================================
// Constraint solver (min-cut / KL bisection)
// ============================================================

// Star topology: one hub node produces shared artifact consumed by many leaves.
// Without max-size: all in one cluster (connected via hub affinity).
// With max-size 2: KL splits leaves from hub while preserving coherence.
function starDag() {
  return define(graph({
    id: 'star', desc: 'star topology', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      hub: node('hub', { produces: ['hub.ts'], deps: ['init'] }),
      leaf1: node('leaf1', { produces: ['l1.ts'], consumes: ['hub.ts'], deps: ['hub'] }),
      leaf2: node('leaf2', { produces: ['l2.ts'], consumes: ['hub.ts'], deps: ['hub'] }),
      leaf3: node('leaf3', { produces: ['l3.ts'], consumes: ['hub.ts'], deps: ['hub'] }),
      term: node('term', { consumes: ['l1.ts', 'l2.ts', 'l3.ts'], deps: ['leaf1', 'leaf2', 'leaf3'] }),
    },
  }));
}

// Bipartite: two separate chains that share no artifacts
function bipartiteDag() {
  return define(graph({
    id: 'bipartite', desc: 'bipartite', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      a1: node('a1', { produces: ['a1.ts'], deps: ['init'] }),
      a2: node('a2', { produces: ['a2.ts'], consumes: ['a1.ts'], deps: ['a1'] }),
      b1: node('b1', { produces: ['b1.ts'], deps: ['init'] }),
      b2: node('b2', { produces: ['b2.ts'], consumes: ['b1.ts'], deps: ['b1'] }),
      term: node('term', { consumes: ['a2.ts', 'b2.ts'], deps: ['a2', 'b2'] }),
    },
  }));
}

describe('solver: output shape', () => {
  it('returns solver: min-cut and cutWeight', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag);
    expect(result.solver).toBe('min-cut');
    expect(typeof result.cutWeight).toBe('number');
    expect(result.cutWeight).toBeGreaterThanOrEqual(0);
  });

  it('ClusterResult shape matches union-find (same fields)', () => {
    const dag = parallelDag();
    const result = buildClustersSolver(dag);
    for (const c of result.clusters) {
      expect(Array.isArray(c.nodes)).toBe(true);
      expect(Array.isArray(c.internalOrder)).toBe(true);
      expect(Array.isArray(c.produces)).toBe(true);
      expect(Array.isArray(c.consumes)).toBe(true);
      expect(Array.isArray(c.crossClusterDeps)).toBe(true);
      expect(typeof c.coupling).toBe('number');
      expect(typeof c.critical).toBe('boolean');
    }
  });

  it('solver dispatch via buildClusters --useSolver', () => {
    const dag = chainDag();
    const result = buildClusters(dag, { useSolver: true });
    expect(result.solver).toBe('min-cut');
    expect(result.cutWeight).toBeDefined();
  });
});

describe('solver: chain topology', () => {
  it('linear chain → single cluster (all nodes connected)', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag);
    expect(result.clusterCount).toBe(1);
    expect(result.clusters[0].nodes).toContain('a');
    expect(result.clusters[0].nodes).toContain('b');
    expect(result.clusters[0].nodes).toContain('c');
  });

  it('cutWeight is 0 for single cluster', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag);
    expect(result.cutWeight).toBe(0);
  });

  it('with max-size 2: splits chain, cutWeight > 0', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag, { maxSize: 2 });
    for (const c of result.clusters) expect(c.nodes.length).toBeLessThanOrEqual(2);
    expect(result.cutWeight).toBeGreaterThan(0);
  });

  it('internalOrder follows topo order within each cluster', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag, { maxSize: 2 });
    for (const c of result.clusters) {
      expect(c.internalOrder).toEqual(c.nodes);
    }
  });
});

describe('solver: bipartite topology', () => {
  it('two independent chains → two clusters', () => {
    const dag = bipartiteDag();
    const result = buildClustersSolver(dag);
    expect(result.clusterCount).toBe(2);
    const clusterA = result.clusters.find(c => c.nodes.includes('a1'))!;
    const clusterB = result.clusters.find(c => c.nodes.includes('b1'))!;
    expect(clusterA.nodes).toContain('a2');
    expect(clusterA.nodes).not.toContain('b1');
    expect(clusterB.nodes).toContain('b2');
    expect(clusterB.nodes).not.toContain('a1');
  });

  it('cutWeight is 0 for disconnected bipartite (no cross-cluster edges)', () => {
    const dag = bipartiteDag();
    const result = buildClustersSolver(dag);
    expect(result.cutWeight).toBe(0);
  });
});

describe('solver: star topology', () => {
  it('no max-size: all leaf nodes grouped with hub (connected via hub.ts)', () => {
    const dag = starDag();
    const result = buildClustersSolver(dag);
    expect(result.clusterCount).toBe(1);
    expect(result.clusters[0].nodes).toContain('hub');
    expect(result.clusters[0].nodes).toContain('leaf1');
  });

  it('max-size enforced: no cluster exceeds limit', () => {
    const dag = starDag();
    const result = buildClustersSolver(dag, { maxSize: 2 });
    for (const c of result.clusters) expect(c.nodes.length).toBeLessThanOrEqual(2);
  });
});

describe('solver: determinism', () => {
  it('same DAG + no max-size → same clusters on repeated calls', () => {
    const dag = hubDag();
    const r1 = buildClustersSolver(dag);
    const r2 = buildClustersSolver(dag);
    expect(r1.clusters.map(c => c.id)).toEqual(r2.clusters.map(c => c.id));
    expect(r1.clusters.map(c => c.nodes.sort())).toEqual(r2.clusters.map(c => c.nodes.sort()));
    expect(r1.cutWeight).toBe(r2.cutWeight);
  });

  it('same DAG + max-size → same clusters on repeated calls', () => {
    const dag = hubDag();
    const r1 = buildClustersSolver(dag, { maxSize: 3 });
    const r2 = buildClustersSolver(dag, { maxSize: 3 });
    expect(r1.clusters.map(c => c.id)).toEqual(r2.clusters.map(c => c.id));
    expect(r1.cutWeight).toBe(r2.cutWeight);
  });
});

describe('solver: max-size enforcement', () => {
  it('max-size 1: every node in its own cluster', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag, { maxSize: 1 });
    expect(result.clusterCount).toBe(3); // a, b, c
    for (const c of result.clusters) expect(c.nodes.length).toBe(1);
  });

  it('clusterCount matches clusters array length', () => {
    const dag = parallelDag();
    const result = buildClustersSolver(dag, { maxSize: 1 });
    expect(result.clusterCount).toBe(result.clusters.length);
  });
});

describe('solver: acyclicity guarantee', () => {
  it('cluster dependency graph has no cycles', () => {
    const dag = chainDag();
    const result = buildClustersSolver(dag, { maxSize: 2 });
    // Build cluster dep graph, verify acyclicity
    const clusterIds = result.clusters.map(c => c.id);
    const adj = new Map<string, string[]>(clusterIds.map(id => [id, []]));
    for (const c of result.clusters) {
      for (const dep of c.crossClusterDeps) adj.get(c.id)!.push(dep.cluster);
    }
    const visited = new Set<string>(), inStack = new Set<string>();
    function hasCycle(id: string): boolean {
      if (inStack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id); inStack.add(id);
      for (const neighbor of adj.get(id) ?? []) {
        if (hasCycle(neighbor)) return true;
      }
      inStack.delete(id);
      return false;
    }
    const cycleFound = clusterIds.some(id => hasCycle(id));
    expect(cycleFound).toBe(false);
  });
});

describe('solver: empty and single-node DAGs', () => {
  it('only init and term: empty result', () => {
    const dag = define(graph({
      id: 'empty', desc: 'empty', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'] }),
      },
    }));
    const result = buildClustersSolver(dag);
    expect(result.clusterCount).toBe(0);
    expect(result.cutWeight).toBe(0);
  });

  it('single non-structural node: one cluster', () => {
    const dag = define(graph({
      id: 'single', desc: 'single', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        a: node('a', { produces: ['x.ts'], deps: ['init'] }),
        term: node('term', { consumes: ['x.ts'], deps: ['a'] }),
      },
    }));
    const result = buildClustersSolver(dag);
    expect(result.clusterCount).toBe(1);
    expect(result.clusters[0].nodes).toEqual(['a']);
    expect(result.cutWeight).toBe(0);
  });
});
