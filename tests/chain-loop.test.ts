// Chain loop integration tests — prove the asymptotic chain loop holds.
// Each test targets one property of the chain-loop contract.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/lib/protocol/types.ts';
import type { OrientV1 } from '../src/lib/core/orient-schema.ts';
import { detectGaps } from '../src/lib/terminal-audit/detected.ts';
import { CompletionStore } from '../src/runtime/completion.ts';
import { buildTerminalBrief, type TerminalBrief } from '../src/runtime/brief.ts';
import type { Context } from '../src/runtime/context.ts';

// --- Test graph factory ---

function mkGraph(
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
  for (const [id, n] of Object.entries(nodes)) {
    built[id] = {
      id,
      desc: id,
      produces: n.produces ?? [],
      consumes: n.consumes ?? [],
      deps: n.deps,
      validate: n.validate ?? [],
      idempotent: true,
    };
  }
  return { id: 'test-chain', desc: 'Test chain DAG', init, term, nodes: built } as Graph<string>;
}

/** Build a minimal Context for pure buildTerminalBrief calls. */
function mkContext(overrides?: Partial<Context>): Context {
  return {
    repoRoot: '/tmp/chain-loop-test',
    completion: CompletionStore.empty(),
    chain: { links: [], iteration: 0 },
    handoffs: new Map(),
    ...overrides,
  };
}

// === Test 1: detectGaps returns no-shell-coverage for artifact-exists-only nodes ===

describe('detectGaps — structural gap detection', () => {
  it('returns no-shell-coverage when node has only artifact-exists validators', () => {
    const dag = mkGraph({
      init: {
        deps: [],
        produces: ['src/init.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      mid: {
        deps: ['init'],
        produces: ['src/mid.ts'],
        consumes: ['src/init.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      term: { deps: ['mid'], consumes: ['src/mid.ts'] },
    });

    const result = detectGaps(dag);
    const noShell = result.gaps.filter(g => g.type === 'no-shell-coverage');

    // Both init and mid produce files with only artifact-exists → no-shell-coverage
    expect(noShell.length).toBeGreaterThanOrEqual(2);
    expect(noShell.some(g => g.nodeId === 'init')).toBe(true);
    expect(noShell.some(g => g.nodeId === 'mid')).toBe(true);
  });

  it('does NOT flag no-shell-coverage when node has a shell validator', () => {
    const dag = mkGraph({
      init: {
        deps: [],
        produces: ['src/init.ts'],
        validate: [
          { type: 'artifact-exists' },
          { type: 'shell', command: 'npx tsc --noEmit src/init.ts' },
        ],
      },
      term: { deps: ['init'], consumes: ['src/init.ts'] },
    });

    const result = detectGaps(dag);
    const noShell = result.gaps.filter(g => g.type === 'no-shell-coverage');
    expect(noShell.length).toBe(0);
  });

  it('does NOT flag no-shell-coverage when node has no produces', () => {
    const dag = mkGraph({
      init: { deps: [], produces: ['marker'] , validate: [{ type: 'artifact-exists' }] },
      // term has no produces — artifact-exists with no produces doesn't trigger
      term: { deps: ['init'], validate: [{ type: 'artifact-exists' }] },
    });

    const result = detectGaps(dag);
    const noShell = result.gaps.filter(g => g.nodeId === 'term' && g.type === 'no-shell-coverage');
    expect(noShell.length).toBe(0);
  });
});

// === Test 2: detectGaps with completion data — untested-evidence ===

describe('detectGaps — scoring-derived gap detection', () => {
  it('returns untested-evidence when node completed without shell validator evidence', () => {
    const dag = mkGraph({
      init: {
        deps: [],
        produces: ['src/init.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      term: { deps: ['init'] },
    });

    // Node completed with only artifact-exists evidence (no shell results)
    const completion = CompletionStore.fromRecords([{
      nodeId: 'init',
      completedAt: '2026-03-01T00:00:00Z',
      validationChecks: [
        { rule: 'artifact-exists:src/init.ts', passed: true, evidence: 'file exists' },
      ],
    }]);

    const result = detectGaps(dag, { completion });
    const untested = result.gaps.filter(g => g.type === 'untested-evidence');

    expect(untested.length).toBeGreaterThanOrEqual(1);
    expect(untested.some(g => g.nodeId === 'init')).toBe(true);
  });

  it('does NOT return untested-evidence when shell evidence exists', () => {
    const dag = mkGraph({
      init: {
        deps: [],
        produces: ['src/init.ts'],
        validate: [
          { type: 'artifact-exists' },
          { type: 'shell', command: 'npx tsc --noEmit' },
        ],
      },
      term: { deps: ['init'] },
    });

    const completion = CompletionStore.fromRecords([{
      nodeId: 'init',
      completedAt: '2026-03-01T00:00:00Z',
      validationChecks: [
        { rule: 'artifact-exists:src/init.ts', passed: true, evidence: 'file exists' },
        { rule: 'shell:npx tsc --noEmit', passed: true, evidence: 'exit 0' },
      ],
    }]);

    const result = detectGaps(dag, { completion });
    const untested = result.gaps.filter(g => g.type === 'untested-evidence' && g.nodeId === 'init');
    expect(untested.length).toBe(0);
  });

  it('does NOT return untested-evidence for nodes that have not been completed', () => {
    const dag = mkGraph({
      init: {
        deps: [],
        produces: ['src/init.ts'],
        validate: [{ type: 'artifact-exists' }],
      },
      term: { deps: ['init'] },
    });

    // Empty completion store — init hasn't been completed
    const completion = CompletionStore.empty();

    const result = detectGaps(dag, { completion });
    const untested = result.gaps.filter(g => g.type === 'untested-evidence');
    expect(untested.length).toBe(0);
  });
});

// === Test 3: OrientV1 type has chainReady, not complete ===

describe('orient output uses chainReady', () => {
  it('OrientV1 type has chainReady field', () => {
    // Type-level proof: construct a valid OrientV1 with chainReady
    const orientOutput: OrientV1 = {
      schema_version: 1,
      tool: { name: 'roadmap', version: '0.0.1' },
      workspace: { root: '/tmp', node: 'v20', platform: 'linux' },
      inputs: { dag: true },
      position: [],
      level: 0,
      produces: [],
      consumes: [],
      batchRemaining: [],
      batchComplete: true,
      done: 5,
      remaining: 0,
      chainReady: true,
      exit: { code: 0 },
    };

    expect(orientOutput.chainReady).toBe(true);
    // Verify 'complete' is NOT a key on OrientV1 — only chainReady exists
    expect('complete' in orientOutput).toBe(false);
  });

  it('CLI orient emits chainReady field (source verification)', () => {
    // Source-level proof: the cli/orient.ts file sets chainReady, not complete
    const orientSource = readFileSync(
      join(__dirname, '..', 'src', 'cli', 'orient.ts'),
      'utf-8',
    );

    // chainReady is used in the output
    expect(orientSource).toContain('chainReady');

    // 'complete' is never used as an output field key
    // (it may appear in variable names like batchComplete, but not as a standalone output field)
    const lines = orientSource.split('\n');
    const completeOutputLines = lines.filter(
      l => /result\.complete\s*=/.test(l) || /complete:\s*(true|false|pos)/.test(l),
    );
    // The only "complete" references should be batchComplete or complete: false in error paths
    for (const line of completeOutputLines) {
      expect(line).toMatch(/batchComplete|chainReady|false/);
    }
  });
});

// === Test 4: TerminalBrief includes scoring field ===

describe('TerminalBrief scoring field', () => {
  it('TerminalBrief type includes scoring field', () => {
    // Type-level proof: construct a TerminalBrief with scoring
    const tb: TerminalBrief = {
      rootIntent: 'test',
      iteration: 0,
      chainHistory: [],
      completionEvidence: { commitStatus: [], testEvidence: [], auditTrail: [] },
      handoffSummaries: [],
      detectedGaps: { gaps: [] },
      scoring: {
        source: 'trail',
        iteration: 0,
        batches: [],
        orientCallCount: 0,
        completeCallCount: 0,
        entryCount: 0,
      },
    };

    expect(tb.scoring).toBeDefined();
    expect(tb.scoring!.source).toBe('trail');
  });

  it('buildTerminalBrief passes scoring from Context into TerminalBrief', () => {
    const dag = mkGraph({
      init: { deps: [], produces: ['init.marker'] },
      term: { deps: ['init'], consumes: ['init.marker'] },
    });

    const scoring = {
      source: 'trail' as const,
      dagId: 'test-chain',
      iteration: 2,
      batches: [
        {
          level: 0,
          nodes: ['init'],
          wallClockMs: 5000,
          nodeMetrics: [{ nodeId: 'init', durationMs: 5000 }],
          orientCallCount: 3,
        },
      ],
      totalWallClockMs: 5000,
      orientCallCount: 3,
      completeCallCount: 1,
      entryCount: 10,
    };

    const context = mkContext({ scoring });
    const result = buildTerminalBrief(dag, context);

    expect(result.scoring).toBeDefined();
    expect(result.scoring!.source).toBe('trail');
    expect(result.scoring!.iteration).toBe(2);
    expect(result.scoring!.batches).toHaveLength(1);
    expect(result.scoring!.batches[0].wallClockMs).toBe(5000);
  });

  it('buildTerminalBrief handles undefined scoring gracefully', () => {
    const dag = mkGraph({
      init: { deps: [], produces: ['init.marker'] },
      term: { deps: ['init'], consumes: ['init.marker'] },
    });

    const context = mkContext({ scoring: undefined });
    const result = buildTerminalBrief(dag, context);

    // scoring is undefined — should not crash, and field should be absent or undefined
    expect(result.scoring).toBeUndefined();
  });
});

// === Test 5: No done:true in advance output ===

describe('advance output vocabulary', () => {
  it('advance.ts never emits done: true', () => {
    const advanceSource = readFileSync(
      join(__dirname, '..', 'src', 'cli', 'advance.ts'),
      'utf-8',
    );

    // Regex: match `done: true` or `result.done = true` — neither should exist
    const doneTrue = /(?:done:\s*true|result\.done\s*=\s*true)/g;
    const matches = advanceSource.match(doneTrue);
    expect(matches).toBeNull();
  });

  it('advance.ts uses chainReady as the completion signal', () => {
    const advanceSource = readFileSync(
      join(__dirname, '..', 'src', 'cli', 'advance.ts'),
      'utf-8',
    );

    expect(advanceSource).toContain('chainReady');
    // chainReady appears in the result object construction
    expect(advanceSource).toMatch(/result\.chainReady\s*=\s*true|chainReady:\s*true/);
  });

  it('advance.ts emits done: false only when gaps remain and no successor chained', () => {
    const advanceSource = readFileSync(
      join(__dirname, '..', 'src', 'cli', 'advance.ts'),
      'utf-8',
    );

    // done: false appears, guarded by hasGaps && !chained
    const doneFalseLines = advanceSource.split('\n').filter(l => /result\.done\s*=\s*false/.test(l));
    expect(doneFalseLines.length).toBeGreaterThan(0);

    // Verify the context around done = false is the gap+chain guard
    const idx = advanceSource.indexOf('result.done = false');
    expect(idx).toBeGreaterThan(-1);
    // The guard should be nearby (within 10 lines above)
    const before = advanceSource.slice(Math.max(0, idx - 500), idx);
    expect(before).toContain('hasGaps');
    expect(before).toContain('!chained');
  });
});
