// Execution intelligence tests — mineExecution, assessTrajectory, proposeSuccessor.
// All tests use mock data only. No filesystem access.
import { describe, it, expect } from 'vitest';
import type { Graph } from '../src/lib/protocol/types.ts';
import type { Context, HandoffEntry } from '../src/runtime/context.ts';
import type { TrailMetrics } from '../src/lib/trail-metrics.ts';
import { mineExecution } from '../src/runtime/execution-miner.ts';
import type { ExecutionFindings } from '../src/runtime/execution-miner.ts';
import { assessTrajectory } from '../src/runtime/trajectory.ts';
import type { TrajectoryAssessment } from '../src/runtime/trajectory.ts';
import { proposeSuccessor } from '../src/runtime/successor.ts';
import type { ChainLink } from '../src/lib/chain.ts';

// --- Helpers ---

function mkGraph(
  id: string,
  nodes: Record<string, {
    deps: string[];
    desc?: string;
    produces?: string[];
    consumes?: string[];
    validate?: any[];
  }>,
  init = 'init',
  term = 'term',
): Graph<string> {
  const built: Record<string, any> = {};
  for (const [nodeId, n] of Object.entries(nodes)) {
    built[nodeId] = {
      id: nodeId,
      desc: n.desc ?? nodeId,
      produces: n.produces ?? [],
      consumes: n.consumes ?? [],
      deps: n.deps,
      validate: n.validate ?? [],
      idempotent: true,
    };
  }
  return { id, desc: `Test DAG ${id}`, init, term, nodes: built } as Graph<string>;
}

function mkContext(overrides: Partial<{
  handoffs: Map<string, HandoffEntry>;
  scoring: TrailMetrics;
}>): Context {
  const handoffs: Map<string, HandoffEntry> = overrides.handoffs ?? new Map();
  const scoring = overrides.scoring;
  return {
    repoRoot: '/fake/repo',
    completion: {
      evidence: () => [],
      hasPassing: () => false,
    } as any,
    chain: { links: [], iteration: 0, rootIntent: '' },
    handoffs,
    scoring,
  };
}

function handoffEntry(nodeId: string, options: {
  final?: Partial<{ discovered: string[]; blockers: string[]; progress: number }> | null;
  interims?: Array<Partial<{ discovered: string[]; blockers: string[]; progress: number }>>;
}): HandoffEntry {
  const makeInterim = (o: Partial<{ discovered: string[]; blockers: string[]; progress: number }>) => ({
    timestamp: '2026-01-01T00:00:00Z',
    progress: o.progress ?? 1,
    discovered: o.discovered ?? [],
    blockers: o.blockers ?? [],
    currentFile: '',
  });

  const final = options.final !== null && options.final !== undefined
    ? {
        ...makeInterim(options.final),
        summary: 'done',
        keyDecisions: [],
        gotchas: [],
        nextNodeEntry: { consumes: [], stateAssumptions: [] },
      }
    : null;

  return {
    nodeId,
    final,
    interims: (options.interims ?? []).map(makeInterim),
  };
}

function emptyFindings(): ExecutionFindings {
  return {
    unaddressedDiscoveries: [],
    scopeDrift: [],
    weakEvidence: [],
    unresolvedBlockers: [],
    velocitySignals: [],
  };
}

function mkChainLink(iteration: number, observations: string[], blockers: string[] = []): ChainLink {
  return {
    dagId: `dag-${iteration}`,
    iteration,
    predecessorId: iteration === 0 ? null : `dag-${iteration - 1}`,
    completedAt: '2026-01-01T00:00:00Z',
    successorDagId: null,
    executionReport: {
      nodesExecuted: 3,
      observations,
      blockers,
      completedAt: '2026-01-01T00:00:00Z',
    },
  };
}

// --- mineExecution ---

describe('mineExecution', () => {
  it('returns empty findings for clean execution', () => {
    const dag = mkGraph('clean', {
      init: { deps: [] },
      work: { deps: ['init'], produces: ['out.ts'] },
      term: { deps: ['work'] },
    });
    const context = mkContext({});
    const findings = mineExecution(dag, context);
    expect(findings.unaddressedDiscoveries).toHaveLength(0);
    expect(findings.scopeDrift).toHaveLength(0);
    expect(findings.weakEvidence).toHaveLength(0);
    expect(findings.unresolvedBlockers).toHaveLength(0);
    expect(findings.velocitySignals).toHaveLength(0);
  });

  it('detects unaddressed discoveries from handoffs', () => {
    const dag = mkGraph('disc', {
      init: { deps: [] },
      work: { deps: ['init'], desc: 'build the widget', produces: ['widget.ts'] },
      term: { deps: ['work'] },
    });
    // Discovery item "need authentication layer" is not mentioned in any node desc or produces
    const handoffs = new Map<string, HandoffEntry>();
    handoffs.set('work', handoffEntry('work', {
      final: { discovered: ['need authentication layer'], progress: 1 },
    }));
    const context = mkContext({ handoffs });
    const findings = mineExecution(dag, context);
    expect(findings.unaddressedDiscoveries).toHaveLength(1);
    expect(findings.unaddressedDiscoveries[0].item).toBe('need authentication layer');
    expect(findings.unaddressedDiscoveries[0].nodeId).toBe('work');
  });

  it('does not flag discovery that is addressed by a node desc or produces', () => {
    const dag = mkGraph('addr', {
      init: { deps: [] },
      auth: { deps: ['init'], desc: 'implement authentication layer', produces: ['auth.ts'] },
      term: { deps: ['auth'] },
    });
    const handoffs = new Map<string, HandoffEntry>();
    handoffs.set('init', handoffEntry('init', {
      final: { discovered: ['authentication layer'], progress: 1 },
    }));
    const context = mkContext({ handoffs });
    const findings = mineExecution(dag, context);
    expect(findings.unaddressedDiscoveries).toHaveLength(0);
  });

  it('detects weak evidence for nodes with only grep validators', () => {
    const dag = mkGraph('weak', {
      init: { deps: [] },
      check: {
        deps: ['init'],
        produces: ['out.ts'],
        validate: [
          { type: 'shell', command: 'grep -r "export" src/' },
          { type: 'shell', command: 'grep "function" out.ts' },
        ],
      },
      term: { deps: ['check'] },
    });
    const context = mkContext({});
    const findings = mineExecution(dag, context);
    expect(findings.weakEvidence).toHaveLength(1);
    expect(findings.weakEvidence[0].nodeId).toBe('check');
  });

  it('does not flag weak evidence for nodes with non-grep shell validators', () => {
    const dag = mkGraph('strong', {
      init: { deps: [] },
      test: {
        deps: ['init'],
        produces: ['result.ts'],
        validate: [
          { type: 'shell', command: 'npx vitest run' },
        ],
      },
      term: { deps: ['test'] },
    });
    const context = mkContext({});
    const findings = mineExecution(dag, context);
    expect(findings.weakEvidence).toHaveLength(0);
  });

  it('detects scope drift from attribution warnings', () => {
    const dag = mkGraph('drift', {
      init: { deps: [] },
      term: { deps: ['init'] },
    });
    const context = mkContext({});
    const findings = mineExecution(dag, context, [
      'file src/secret.ts changed outside produces of init',
    ]);
    expect(findings.scopeDrift).toHaveLength(1);
    expect(findings.scopeDrift[0].file).toBe('src/secret.ts');
    expect(findings.scopeDrift[0].nodeId).toBe('init');
  });

  it('detects unresolved blockers from final handoff', () => {
    const dag = mkGraph('block', {
      init: { deps: [] },
      work: { deps: ['init'] },
      term: { deps: ['work'] },
    });
    const handoffs = new Map<string, HandoffEntry>();
    handoffs.set('work', handoffEntry('work', {
      final: { blockers: ['waiting for API key'], progress: 1 },
    }));
    const context = mkContext({ handoffs });
    const findings = mineExecution(dag, context);
    expect(findings.unresolvedBlockers).toHaveLength(1);
    expect(findings.unresolvedBlockers[0].blocker).toBe('waiting for API key');
    expect(findings.unresolvedBlockers[0].nodeId).toBe('work');
  });

  it('detects unresolved blockers from interim with progress < 1', () => {
    const dag = mkGraph('interim-block', {
      init: { deps: [] },
      work: { deps: ['init'] },
      term: { deps: ['work'] },
    });
    const handoffs = new Map<string, HandoffEntry>();
    handoffs.set('work', handoffEntry('work', {
      final: null,
      interims: [{ blockers: ['missing dependency'], progress: 0.5 }],
    }));
    const context = mkContext({ handoffs });
    const findings = mineExecution(dag, context);
    expect(findings.unresolvedBlockers).toHaveLength(1);
    expect(findings.unresolvedBlockers[0].blocker).toBe('missing dependency');
  });

  it('detects velocity signals for batches over 2x median', () => {
    const scoring: TrailMetrics = {
      source: 'trail',
      iteration: 0,
      batches: [
        { level: 0, nodes: ['init'], wallClockMs: 1000, nodeMetrics: [], orientCallCount: 0 },
        { level: 1, nodes: ['work'], wallClockMs: 1200, nodeMetrics: [], orientCallCount: 0 },
        { level: 2, nodes: ['slow'], wallClockMs: 9999, nodeMetrics: [], orientCallCount: 0 },
      ],
      orientCallCount: 0,
      completeCallCount: 0,
      entryCount: 3,
    };
    const dag = mkGraph('vel', {
      init: { deps: [] },
      work: { deps: ['init'] },
      slow: { deps: ['work'] },
      term: { deps: ['slow'] },
    });
    const context = mkContext({ scoring });
    const findings = mineExecution(dag, context);
    expect(findings.velocitySignals.length).toBeGreaterThanOrEqual(1);
    expect(findings.velocitySignals[0].level).toBe(2);
  });
});

// --- assessTrajectory ---

describe('assessTrajectory', () => {
  it('returns stable when no findings and no chain history', () => {
    const findings = emptyFindings();
    const result = assessTrajectory(findings, [], 'build the system', 'dag-0');
    expect(result.trend).toBe('stable');
    expect(result.persistentFindings).toHaveLength(0);
  });

  it('returns converging when findings decrease from previous iteration', () => {
    // Three total iterations: 5 findings → 3 findings → 1 finding (current)
    const chainLinks: ChainLink[] = [
      mkChainLink(0, ['issue-alpha', 'issue-beta', 'issue-gamma', 'issue-delta', 'issue-epsilon']),
      mkChainLink(1, ['issue-alpha', 'issue-beta', 'issue-gamma']),
    ];
    // Current has 1 finding (fewer than previous 3)
    const findings: ExecutionFindings = {
      ...emptyFindings(),
      scopeDrift: [{ file: 'leftover.ts' }],
    };
    const result = assessTrajectory(findings, chainLinks, 'build the system', 'dag-2');
    expect(result.trend).toBe('converging');
  });

  it('returns orbiting when persistent findings exist across 3+ iterations', () => {
    // Two prior iterations both had the same finding
    const sharedFinding = 'need-auth';
    const chainLinks: ChainLink[] = [
      mkChainLink(0, [sharedFinding, 'other-issue']),
      mkChainLink(1, [sharedFinding]),
    ];
    // Current iteration still has the same finding as an unaddressed discovery
    const findings: ExecutionFindings = {
      ...emptyFindings(),
      unaddressedDiscoveries: [{ source: 'work', nodeId: 'work', item: sharedFinding }],
    };
    const result = assessTrajectory(findings, chainLinks, 'build auth', 'dag-2');
    expect(result.trend).toBe('orbiting');
    expect(result.persistentFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('populates iterationSummaries for each chain link plus current', () => {
    const chainLinks: ChainLink[] = [mkChainLink(0, ['obs-a'])];
    const findings: ExecutionFindings = {
      ...emptyFindings(),
      scopeDrift: [{ file: 'secret.ts', nodeId: 'init' }],
    };
    const result = assessTrajectory(findings, chainLinks, 'intent', 'dag-1');
    // one historical + one current
    expect(result.iterationSummaries).toHaveLength(2);
  });
});

// --- proposeSuccessor ---

describe('proposeSuccessor', () => {
  const stableAssessment: TrajectoryAssessment = {
    trend: 'stable',
    iterationSummaries: [],
    persistentFindings: [],
    intentDistance: 'flat',
    recommendation: 'Clean.',
  };

  it('returns converged when no findings', () => {
    const dag = mkGraph('dag-0', { init: { deps: [] }, term: { deps: ['init'] } });
    const result = proposeSuccessor(stableAssessment, emptyFindings(), 'build it', dag);
    expect(result.action).toBe('converged');
    expect(result.specDraft).toBeUndefined();
  });

  it('returns continue with specDraft when findings exist and trajectory is converging', () => {
    const assessment: TrajectoryAssessment = {
      trend: 'converging',
      iterationSummaries: [{ iteration: 0, dagId: 'dag-0', nodesExecuted: 3, findingsCount: 5, resolvedFromPrevious: [], newFindings: [] }],
      persistentFindings: [],
      intentDistance: 'decreasing',
      recommendation: 'Keep going.',
    };
    const findings: ExecutionFindings = {
      ...emptyFindings(),
      unaddressedDiscoveries: [{ source: 'work', nodeId: 'work', item: 'need caching layer' }],
    };
    const dag = mkGraph('dag-0', { init: { deps: [] }, work: { deps: ['init'] }, term: { deps: ['work'] } });
    const result = proposeSuccessor(assessment, findings, 'build the system', dag);
    expect(result.action).toBe('continue');
    expect(result.specDraft).toBeDefined();
    expect(result.specDraft!.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.specDraft!.dagId).toContain('dag-0');
  });

  it('returns orbit-break when trajectory is orbiting', () => {
    const assessment: TrajectoryAssessment = {
      trend: 'orbiting',
      iterationSummaries: [],
      persistentFindings: ['stuck-thing'],
      intentDistance: 'flat',
      recommendation: 'Explicitly scope.',
    };
    const findings: ExecutionFindings = {
      ...emptyFindings(),
      unresolvedBlockers: [{ nodeId: 'work', blocker: 'stuck-thing' }],
    };
    const dag = mkGraph('dag-2', { init: { deps: [] }, work: { deps: ['init'] }, term: { deps: ['work'] } });
    const result = proposeSuccessor(assessment, findings, 'build auth', dag);
    expect(result.action).toBe('orbit-break');
    expect(result.orbitDiagnosis).toBeDefined();
    expect(result.specDraft).toBeUndefined();
  });

  it('returns orbit-break when trajectory is diverging', () => {
    const assessment: TrajectoryAssessment = {
      trend: 'diverging',
      iterationSummaries: [],
      persistentFindings: [],
      intentDistance: 'increasing',
      recommendation: 'Redesign.',
    };
    const findings: ExecutionFindings = {
      ...emptyFindings(),
      scopeDrift: [{ file: 'something.ts' }],
    };
    const dag = mkGraph('dag-3', { init: { deps: [] }, term: { deps: ['init'] } });
    const result = proposeSuccessor(assessment, findings, 'build it', dag);
    expect(result.action).toBe('orbit-break');
  });
});
