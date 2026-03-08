import { describe, it, expect } from 'vitest';
import { runAudit } from '../src/lib/terminal-audit/validator.ts';
import { computeReport } from '../src/lib/terminal-audit/computed.ts';
import { detectGaps } from '../src/lib/terminal-audit/detected.ts';
import { expandGaps } from '../src/lib/terminal-audit/gap-expansion.ts';
import { tasksToDAG, parseTasksMd } from '../src/lib/intake/speckit-import.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';
import type { CompletionRecordWithEvidence } from '../src/lib/evidence/completion-evidence.ts';

function buildDAG(specs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(specs)) {
    nodes[id] = {
      id, desc: 'test', produces: [], consumes: [], deps: [], validate: [], idempotent: true,
      ...spec,
    };
  }
  return { id: 'test', desc: 'test', init: 'init', term: 'term', nodes } as any;
}

function makeRecords(...entries: Array<{ nodeId: string; gitSha?: string; branch?: string; checks?: Array<{ rule: string; passed: boolean; evidence: string }> }>): Map<string, CompletionRecordWithEvidence> {
  const m = new Map<string, CompletionRecordWithEvidence>();
  for (const e of entries) {
    m.set(e.nodeId, {
      nodeId: e.nodeId,
      completedAt: '2026-03-06T00:00:00Z',
      gitSha: e.gitSha,
      branch: e.branch,
      validationChecks: e.checks ?? [],
    });
  }
  return m;
}

// Full pipeline DAG: init → work → term
const pipelineDAG = buildDAG({
  init: { produces: ['init.marker'] },
  work: {
    consumes: ['init.marker'], deps: ['init'],
    produces: ['src/impl.ts'],
    validate: [
      { type: 'artifact-exists', path: 'src/impl.ts' },
      { type: 'shell', command: 'npx tsc --noEmit src/impl.ts' },
    ],
  },
  term: {
    consumes: ['src/impl.ts'], deps: ['work'],
    validate: [{ type: 'artifact-exists', path: 'src/impl.ts' }],
  },
});

describe('E2E: terminal audit full pipeline', () => {
  describe('clean DAG produces informational summary', () => {
    it('returns computed + detected context', () => {
      const records = makeRecords(
        { nodeId: 'init', checks: [] },
        { nodeId: 'work', gitSha: 'abc', checks: [
          { rule: 'artifact-exists:src/impl.ts', passed: true, evidence: 'file exists' },
          { rule: 'shell:npx tsc --noEmit src/impl.ts', passed: true, evidence: 'exit 0' },
        ]},
      );
      const ctx = runAudit(pipelineDAG, records, () => true);
      expect(ctx).toHaveProperty('computed');
      expect(ctx).toHaveProperty('detected');
      expect(ctx.computed.commitStatus.length).toBeGreaterThan(0);
    });
  });

  describe('gappy DAG reports gaps informationally', () => {
    const gappyDAG = buildDAG({
      init: { produces: ['init.marker'] },
      a: { produces: ['src/a.ts'], deps: ['init'] },
      b: { consumes: ['src/a.ts'], deps: ['a'], produces: ['src/b.ts'] },
      term: { consumes: ['src/b.ts'], deps: ['b'] },
    });

    it('gaps detected in summary but do not block', () => {
      const ctx = runAudit(gappyDAG, new Map(), () => true);
      expect(ctx.detected.gaps.length).toBeGreaterThan(0);
      // No passed/prompts/unaddressed fields — just informational
      expect(ctx).not.toHaveProperty('passed');
      expect(ctx).not.toHaveProperty('prompts');
    });
  });

  describe('computed report populated from records', () => {
    it('includes test evidence from completed nodes', () => {
      const records = makeRecords(
        { nodeId: 'work', gitSha: 'sha1', branch: 'feat/x', checks: [
          { rule: 'shell:npx tsc --noEmit src/impl.ts', passed: true, evidence: 'exit 0' },
          { rule: 'artifact-exists:src/impl.ts', passed: true, evidence: 'exists' },
        ]},
      );
      const ctx = runAudit(pipelineDAG, records, () => true);
      expect(ctx.computed.testEvidence).toHaveLength(1);
      expect(ctx.computed.auditTrail).toHaveLength(1);
      expect(ctx.computed.auditTrail[0].gitSha).toBe('sha1');
    });
  });

  describe('speckit import: terminal node clean', () => {
    it('tasksToDAG does not inject propagated validators or intent gate on term', () => {
      const tasks = [
        { id: 'setup', desc: 'Setup', priority: 0, depends: [], produces: ['setup.txt'], consumes: [], mode: 'execute' as const, validate: [{ type: 'shell' as const, command: 'echo ok' }] },
        { id: 'build', desc: 'Build', priority: 1, depends: ['setup'], produces: ['build.txt'], consumes: ['setup.txt'], mode: 'execute' as const, validate: [{ type: 'shell' as const, command: 'echo build' }] },
      ];
      const dag = tasksToDAG(tasks, { dagId: 'test-import' });
      const termNode = dag.nodes[dag.term as keyof typeof dag.nodes] as any;

      // No propagated artifact-exists or shell validators
      const propagated = (termNode.validate ?? []).filter((v: any) => v._propagatedFrom);
      expect(propagated).toHaveLength(0);

      // No intent gate
      const intents = (termNode.validate ?? []).filter((v: any) => v.type === 'intent');
      expect(intents).toHaveLength(0);
    });

    it('terminal audit returns informational summary for DAG from tasksToDAG', () => {
      const tasks = [
        { id: 'setup', desc: 'Setup', priority: 0, depends: [], produces: ['setup.txt'], consumes: [], mode: 'execute' as const, validate: [{ type: 'artifact-exists' as const, path: 'setup.txt' }, { type: 'shell' as const, command: 'cat setup.txt' }] },
        { id: 'build', desc: 'Build', priority: 1, depends: ['setup'], produces: ['build.txt'], consumes: ['setup.txt'], mode: 'execute' as const, validate: [{ type: 'artifact-exists' as const, path: 'build.txt' }, { type: 'shell' as const, command: 'cat build.txt' }] },
      ];
      const dag = tasksToDAG(tasks, { dagId: 'test-audit' });
      const records = makeRecords(
        { nodeId: 'setup', checks: [{ rule: 'shell:cat setup.txt', passed: true, evidence: 'ok' }] },
        { nodeId: 'build', checks: [{ rule: 'shell:cat build.txt', passed: true, evidence: 'ok' }] },
      );
      const ctx = runAudit(dag, records, () => true);
      expect(ctx).toHaveProperty('computed');
      expect(ctx).toHaveProperty('detected');
    });
  });

  describe('gap expansion: terminal node cycle prevention', () => {
    it('skips gaps on terminal node to avoid cycle', () => {
      const dag = buildDAG({
        init: { produces: ['init.marker'] },
        work: { produces: ['src/out.ts'], deps: ['init'], validate: [{ type: 'shell', command: 'echo ok' }] },
        term: {
          produces: ['.roadmap/tasks/done.json'],
          deps: ['work'],
          validate: [{ type: 'artifact-exists', path: '.roadmap/tasks/done.json' }],
        },
      });

      const detected = detectGaps(dag, []);
      const termGaps = detected.gaps.filter(g => g.nodeId === 'term');

      const result = expandGaps(dag, detected, '/tmp/nonexistent');
      for (const fix of result.fixNodes) {
        expect(fix.deps).not.toContain('term');
      }
      if (termGaps.length === detected.gaps.length) {
        expect(result.expanded).toBe(false);
      }
    });
  });
});
