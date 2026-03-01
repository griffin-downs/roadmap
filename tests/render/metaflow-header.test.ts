import { describe, it, expect } from 'vitest';
import { renderMetaflowHeader } from '../../src/lib/render/metaflow-header.ts';
import type { ActiveRun } from '../../src/lib/metaflow/state/active-run.ts';
import type { StepId } from '../../src/lib/metaflow/types.ts';
import type { RenderOpts } from '../../src/lib/render/types.ts';

const run: ActiveRun = {
  schema_version: 1,
  runId: 'mf_20260301_010000Z_abc123' as ActiveRun['runId'],
  stage: 'execute',
  startedAt: '2026-03-01T01:00:00Z',
  sessionIds: ['s1'],
};

const stepId = 'si-test-0001' as StepId;
const treeSha = 'abcdef1234567890abcdef1234567890abcdef12';
const opts: RenderOpts = { tty: false, width: 34, color: false, emoji: false };

describe('renderMetaflowHeader', () => {
  it('contains runId', () => {
    const out = renderMetaflowHeader(run, stepId, treeSha, opts);
    expect(out).toContain(run.runId);
  });

  it('contains StepId', () => {
    const out = renderMetaflowHeader(run, stepId, treeSha, opts);
    expect(out).toContain(stepId);
  });

  it('contains sha[:12]', () => {
    const out = renderMetaflowHeader(run, stepId, treeSha, opts);
    expect(out).toContain(treeSha.slice(0, 12));
    expect(out).not.toContain(treeSha); // full sha should not appear
  });

  it('contains border chars', () => {
    const out = renderMetaflowHeader(run, stepId, treeSha, opts);
    expect(out).toContain('━');
  });

  it('is deterministic across two calls with same input', () => {
    const a = renderMetaflowHeader(run, stepId, treeSha, opts);
    const b = renderMetaflowHeader(run, stepId, treeSha, opts);
    expect(a).toBe(b);
  });

  it('respects opts.width', () => {
    const narrow = renderMetaflowHeader(run, stepId, treeSha, { ...opts, width: 20 });
    const wide = renderMetaflowHeader(run, stepId, treeSha, { ...opts, width: 60 });
    const narrowBorder = narrow.split('\n')[0];
    const wideBorder = wide.split('\n')[0];
    expect(narrowBorder.length).toBe(20);
    expect(wideBorder.length).toBe(60);
  });
});
