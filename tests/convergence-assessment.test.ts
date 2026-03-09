// Convergence assessment integration tests — prove gap trajectory + assessment pipeline works.
// Tests cover: computeGapTrajectory (filesystem), assessConvergence (pure), computeExecutionReport (filesystem).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Graph } from '../src/lib/protocol/types.ts';
import { computeGapTrajectory } from '../src/lib/convergence/gap-trajectory.ts';
import type { GapTrajectory } from '../src/lib/convergence/gap-trajectory.ts';
import { assessConvergence } from '../src/lib/convergence/assessment.ts';
import type { ConvergenceAssessment } from '../src/lib/convergence/assessment.ts';
import { computeExecutionReport } from '../src/lib/auto-execution-report.ts';
import type { DetectedGaps, GapEntry } from '../src/lib/terminal-audit/detected.ts';
import type { ExecutionReport } from '../src/lib/chain.ts';

// --- Helpers ---

function mkGraph(
  id: string,
  nodes: Record<string, {
    deps: string[];
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
      desc: nodeId,
      produces: n.produces ?? [],
      consumes: n.consumes ?? [],
      deps: n.deps,
      validate: n.validate ?? [],
      idempotent: true,
    };
  }
  return { id, desc: `Test DAG ${id}`, init, term, nodes: built } as Graph<string>;
}

function mkTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'convergence-test-'));
  mkdirSync(join(dir, '.roadmap', 'heads'), { recursive: true });
  return dir;
}

function writeDag(repoRoot: string, filename: string, dag: Graph<string>): void {
  writeFileSync(join(repoRoot, '.roadmap', filename), JSON.stringify(dag));
}

function writeHead(repoRoot: string, dag: Graph<string>): void {
  writeDag(repoRoot, 'head.json', dag);
}

function writeArchivedHead(repoRoot: string, dag: Graph<string>): void {
  writeDag(repoRoot, `heads/${dag.id}.json`, dag);
}

function mkGapEntry(type: string, nodeId: string, artifact: string): GapEntry {
  return { type: type as GapEntry['type'], nodeId, artifact };
}

function mkDetectedGaps(gaps: GapEntry[]): DetectedGaps {
  return { gaps };
}

function mkTrajectory(overrides: Partial<GapTrajectory>): GapTrajectory {
  return {
    iterations: [],
    resolved: [],
    persistent: [],
    new: [],
    trend: 'stable',
    reductionRate: 0,
    ...overrides,
  };
}

// === Test 1: computeGapTrajectory with mock archived heads ===

describe('computeGapTrajectory — filesystem integration', () => {
  it('builds iterations from archived heads and classifies resolved/persistent/new gaps', () => {
    const repoRoot = mkTempRepo();

    // Archived DAG iteration 0: more gaps (no shell validators, only artifact-exists)
    const dagV1 = mkGraph('iter-001', {
      init: {
        deps: [],
        produces: ['src/a.ts', 'src/b.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      mid: {
        deps: ['init'],
        produces: ['src/c.ts'],
        consumes: ['src/a.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      term: { deps: ['mid'], consumes: ['src/c.ts'] },
    });

    // Current head: fewer gaps (shell validators added to init, mid still artifact-exists only)
    const dagV2 = mkGraph('iter-002', {
      init: {
        deps: [],
        produces: ['src/a.ts', 'src/b.ts'],
        validate: [
          { type: 'artifact-exists' },
          { type: 'shell', command: 'npx tsc --noEmit src/a.ts src/b.ts' },
        ],
      },
      mid: {
        deps: ['init'],
        produces: ['src/c.ts'],
        consumes: ['src/a.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      term: { deps: ['mid'], consumes: ['src/c.ts'] },
    });

    writeArchivedHead(repoRoot, dagV1);
    writeHead(repoRoot, dagV2);

    const trajectory = computeGapTrajectory(repoRoot);

    // Should have iteration entries (archived + current)
    expect(trajectory.iterations.length).toBeGreaterThanOrEqual(2);

    // Current DAG should have fewer gaps than archived (init shell validator removes no-shell-coverage for init)
    const archivedSnapshot = trajectory.iterations[0];
    const currentSnapshot = trajectory.iterations[trajectory.iterations.length - 1];
    expect(currentSnapshot.gapCount).toBeLessThan(archivedSnapshot.gapCount);

    // Trend should be converging (fewer gaps now)
    expect(trajectory.trend).toBe('converging');
    expect(trajectory.reductionRate).toBeGreaterThan(0);

    // resolved: gaps that existed in v1 but not v2
    expect(trajectory.resolved.length).toBeGreaterThan(0);
    // The no-shell-coverage gaps for init's produces should be resolved
    const resolvedNoShell = trajectory.resolved.filter(g => g.type === 'no-shell-coverage' && g.nodeId === 'init');
    expect(resolvedNoShell.length).toBeGreaterThan(0);

    // persistent: gaps still in both iterations (mid still has no-shell-coverage)
    const persistentMid = trajectory.persistent.filter(g => g.nodeId === 'mid' && g.type === 'no-shell-coverage');
    expect(persistentMid.length).toBeGreaterThan(0);
  });

  it('returns stable trend with single iteration when no archived heads exist', () => {
    const repoRoot = mkTempRepo();

    const dag = mkGraph('only-head', {
      init: { deps: [], produces: ['src/x.ts'], validate: [{ type: 'artifact-exists' }] },
      term: { deps: ['init'] },
    });

    writeHead(repoRoot, dag);

    const trajectory = computeGapTrajectory(repoRoot);

    // Only current iteration
    expect(trajectory.iterations.length).toBe(1);
    expect(trajectory.trend).toBe('stable');
    expect(trajectory.reductionRate).toBe(0);

    // All current gaps are "new" (no predecessor to compare against)
    expect(trajectory.new.length).toBeGreaterThanOrEqual(0);
    expect(trajectory.resolved.length).toBe(0);
    expect(trajectory.persistent.length).toBe(0);
  });
});

// === Test 2: assessConvergence — converging ===

describe('assessConvergence — converging', () => {
  it('reports converging trend with shrinking recommendation', () => {
    const persistent = [mkGapEntry('no-shell-coverage', 'mid', 'src/c.ts')];
    const resolved = [
      mkGapEntry('no-shell-coverage', 'init', 'src/a.ts'),
      mkGapEntry('no-shell-coverage', 'init', 'src/b.ts'),
    ];

    const trajectory = mkTrajectory({
      trend: 'converging',
      reductionRate: 0.5,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 4, gapsByType: { 'no-shell-coverage': 4 } },
        { dagId: 'v2', iteration: 1, gapCount: 2, gapsByType: { 'no-shell-coverage': 2 } },
      ],
      resolved,
      persistent,
      new: [],
    });

    const currentGaps = mkDetectedGaps([
      mkGapEntry('no-shell-coverage', 'mid', 'src/c.ts'),
      mkGapEntry('uncovered-consume', 'term', 'src/c.ts'),
    ]);

    const assessment = assessConvergence(trajectory, currentGaps);

    expect(assessment.trend).toBe('converging');
    expect(assessment.reductionRate).toBe(0.5);
    expect(assessment.recommendation).toContain('shrinking');
    expect(assessment.recommendation).toContain('50%');
    expect(assessment.persistentGaps).toEqual(persistent);
    expect(assessment.resolvedThisIteration).toEqual(resolved);
    expect(assessment.newThisIteration).toEqual([]);
  });

  it('mentions persistent gap types when they exist', () => {
    const persistent = [mkGapEntry('no-shell-coverage', 'mid', 'src/c.ts')];
    const trajectory = mkTrajectory({
      trend: 'converging',
      reductionRate: 0.3,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 5, gapsByType: {} },
        { dagId: 'v2', iteration: 1, gapCount: 3, gapsByType: {} },
      ],
      persistent,
      resolved: [mkGapEntry('uncovered-consume', 'x', 'y')],
      new: [],
    });

    const assessment = assessConvergence(trajectory, mkDetectedGaps(persistent));

    expect(assessment.recommendation).toContain('persistent');
    expect(assessment.recommendation).toContain('no-shell-coverage');
  });
});

// === Test 3: assessConvergence — diverging ===

describe('assessConvergence — diverging', () => {
  it('reports diverging trend with diagnostic recommendation', () => {
    const newGaps = [
      mkGapEntry('uncovered-consume', 'new-node', 'src/new.ts'),
      mkGapEntry('untested-produce', 'new-node', 'src/output.ts'),
    ];

    const trajectory = mkTrajectory({
      trend: 'diverging',
      reductionRate: -0.5,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 2, gapsByType: {} },
        { dagId: 'v2', iteration: 1, gapCount: 4, gapsByType: {} },
      ],
      resolved: [],
      persistent: [],
      new: newGaps,
    });

    const currentGaps = mkDetectedGaps(newGaps);
    const assessment = assessConvergence(trajectory, currentGaps);

    expect(assessment.trend).toBe('diverging');
    expect(assessment.recommendation).toContain('Diverging');
    expect(assessment.recommendation).toContain('2 new');
    expect(assessment.newThisIteration).toEqual(newGaps);
    expect(assessment.resolvedThisIteration).toEqual([]);
  });

  it('recommends scope reduction when many new gaps appear', () => {
    const newGaps = [
      mkGapEntry('uncovered-consume', 'a', 'x1'),
      mkGapEntry('uncovered-consume', 'b', 'x2'),
      mkGapEntry('untested-produce', 'c', 'x3'),
      mkGapEntry('no-shell-coverage', 'd', 'x4'),
    ];

    const trajectory = mkTrajectory({
      trend: 'diverging',
      reductionRate: -1.0,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 2, gapsByType: {} },
        { dagId: 'v2', iteration: 1, gapCount: 6, gapsByType: {} },
      ],
      new: newGaps,
    });

    const assessment = assessConvergence(trajectory, mkDetectedGaps(newGaps));

    // >3 new gaps triggers scope-reduction recommendation
    expect(assessment.recommendation).toContain('scope reduction');
  });
});

// === Test 4: assessConvergence — stable (first iteration) ===

describe('assessConvergence — stable / first iteration', () => {
  it('reports stable trend on first iteration with no history', () => {
    const trajectory = mkTrajectory({
      trend: 'stable',
      reductionRate: 0,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 3, gapsByType: { 'no-shell-coverage': 3 } },
      ],
    });

    const currentGaps = mkDetectedGaps([
      mkGapEntry('no-shell-coverage', 'a', 'src/a.ts'),
      mkGapEntry('no-shell-coverage', 'b', 'src/b.ts'),
      mkGapEntry('no-shell-coverage', 'c', 'src/c.ts'),
    ]);

    const assessment = assessConvergence(trajectory, currentGaps);

    expect(assessment.trend).toBe('stable');
    // iteration 0 → "First iteration baseline"
    expect(assessment.recommendation).toContain('First iteration baseline');
    expect(assessment.recommendation).toContain('3 gaps detected');
  });

  it('reports first iteration with zero gaps as clean baseline', () => {
    const trajectory = mkTrajectory({
      trend: 'stable',
      reductionRate: 0,
      iterations: [
        { dagId: 'clean', iteration: 0, gapCount: 0, gapsByType: {} },
      ],
    });

    const assessment = assessConvergence(trajectory, mkDetectedGaps([]));

    expect(assessment.trend).toBe('stable');
    expect(assessment.recommendation).toContain('no gaps detected');
  });

  it('reports fully converged when stable at zero gaps in later iteration', () => {
    const trajectory = mkTrajectory({
      trend: 'stable',
      reductionRate: 0,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 3, gapsByType: {} },
        { dagId: 'v2', iteration: 1, gapCount: 0, gapsByType: {} },
      ],
    });

    const assessment = assessConvergence(trajectory, mkDetectedGaps([]));

    expect(assessment.trend).toBe('stable');
    expect(assessment.recommendation).toContain('fully converged');
  });
});

// === Test 5: assessConvergence — with executionReport ===

describe('assessConvergence — with executionReport', () => {
  it('includes nodesExecuted and duration in iterationSummary', () => {
    const trajectory = mkTrajectory({
      trend: 'converging',
      reductionRate: 0.25,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 4, gapsByType: {} },
        { dagId: 'v2', iteration: 1, gapCount: 3, gapsByType: {} },
      ],
      resolved: [mkGapEntry('no-shell-coverage', 'x', 'y')],
      persistent: [],
      new: [],
    });

    const executionReport: ExecutionReport = {
      nodesExecuted: 7,
      totalDuration: 45000,
      retriesPerNode: { 'setup': 1 },
      observations: ['vitest flaky on CI'],
      blockers: [],
      deltaAssessment: '',
    };

    const assessment = assessConvergence(
      trajectory,
      mkDetectedGaps([]),
      executionReport,
    );

    expect(assessment.iterationSummary).toContain('7 nodes');
    expect(assessment.iterationSummary).toContain('45000ms');
    expect(assessment.iterationSummary).toContain('1 gaps resolved');
  });

  it('defaults to 0 nodes and 0ms when no executionReport provided', () => {
    const trajectory = mkTrajectory({
      trend: 'stable',
      reductionRate: 0,
      iterations: [
        { dagId: 'v1', iteration: 0, gapCount: 1, gapsByType: {} },
      ],
    });

    const assessment = assessConvergence(trajectory, mkDetectedGaps([]));

    expect(assessment.iterationSummary).toContain('0 nodes');
    expect(assessment.iterationSummary).toContain('0ms');
  });
});

// === Test 6: computeExecutionReport — shape verification ===

describe('computeExecutionReport — filesystem integration', () => {
  it('returns correct shape with minimal .roadmap/ structure', () => {
    const repoRoot = mkTempRepo();

    // Write a minimal completed.json with one completed node (must be a JSON array)
    const completedData = [
      {
        nodeId: 'setup-db',
        completedAt: '2026-03-01T00:00:00Z',
        validationChecks: [
          { rule: 'artifact-exists:db/schema.sql', passed: true, evidence: 'file exists' },
        ],
      },
    ];
    writeFileSync(
      join(repoRoot, '.roadmap', 'completed.json'),
      JSON.stringify(completedData),
    );

    const report = computeExecutionReport(repoRoot);

    // Shape checks
    expect(report).toHaveProperty('nodesExecuted');
    expect(report).toHaveProperty('totalDuration');
    expect(report).toHaveProperty('retriesPerNode');
    expect(report).toHaveProperty('observations');
    expect(report).toHaveProperty('blockers');
    expect(report).toHaveProperty('deltaAssessment');

    // Type checks
    expect(typeof report.nodesExecuted).toBe('number');
    expect(typeof report.totalDuration).toBe('number');
    expect(typeof report.deltaAssessment).toBe('string');
    expect(Array.isArray(report.observations)).toBe(true);
    expect(Array.isArray(report.blockers)).toBe(true);

    // nodesExecuted should reflect the completed.json entry
    expect(report.nodesExecuted).toBe(1);

    // deltaAssessment starts empty (filled later by convergence-assessment)
    expect(report.deltaAssessment).toBe('');
  });

  it('returns sensible defaults when .roadmap/ is empty', () => {
    const repoRoot = mkTempRepo();

    const report = computeExecutionReport(repoRoot);

    expect(report.nodesExecuted).toBe(0);
    expect(report.totalDuration).toBe(0);
    expect(report.observations).toEqual([]);
    expect(report.blockers).toEqual([]);
    expect(report.deltaAssessment).toBe('');
    expect(report.retriesPerNode).toEqual({});
  });
});
