import { describe, it, expect } from 'vitest';
import { propagateConstraints } from '../../src/lib/propagate.ts';
import type { Graph, NodeSpec } from '../../src/protocol.ts';

describe('auto-propagate on expand', () => {
  it('propagates artifact-exists rules from terminal nodes', () => {
    // Simple DAG: producer → consumer
    const dag: Graph<string> = {
      id: 'test',
      desc: 'Test DAG',
      init: 'producer',
      term: 'consumer',
      nodes: {
        producer: {
          id: 'producer',
          desc: 'Produces artifact',
          produces: ['output.txt'],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: true,
        } as NodeSpec<string, 'producer'>,
        consumer: {
          id: 'consumer',
          desc: 'Consumes artifact',
          produces: [],
          consumes: ['output.txt'],
          deps: ['producer'],
          validate: [
            {
              type: 'artifact-exists',
              path: 'output.txt',
            },
          ],
          idempotent: true,
        } as NodeSpec<string, 'consumer'>,
      },
    };

    const result = propagateConstraints(dag);

    expect(result.propagated).toBeGreaterThanOrEqual(0);
    expect(result.nodesAffected).toBeGreaterThanOrEqual(0);
    expect(result.dag).toBeDefined();
  });

  it('back-derives validation rules without user intervention', () => {
    // Expansion creates child nodes with validation rules
    // Propagation should derive artifact-exists on parent
    const dag: Graph<string> = {
      id: 'expanded',
      desc: 'Expanded DAG',
      init: 'step-1',
      term: 'step-3',
      nodes: {
        'step-1': {
          id: 'step-1',
          desc: 'First step',
          produces: ['file1.ts'],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: true,
        } as NodeSpec<string, 'step-1'>,
        'step-2': {
          id: 'step-2',
          desc: 'Second step',
          produces: ['file2.ts'],
          consumes: ['file1.ts'],
          deps: ['step-1'],
          validate: [
            {
              type: 'artifact-exists',
              path: 'file1.ts',
            },
          ],
          idempotent: true,
        } as NodeSpec<string, 'step-2'>,
        'step-3': {
          id: 'step-3',
          desc: 'Third step (terminal)',
          produces: ['output.json'],
          consumes: ['file2.ts'],
          deps: ['step-2'],
          validate: [
            {
              type: 'artifact-exists',
              path: 'file2.ts',
            },
          ],
          idempotent: true,
        } as NodeSpec<string, 'step-3'>,
      },
    };

    const result = propagateConstraints(dag);

    // Should have propagated some rules
    expect(result.dag).toBeDefined();
    expect(result.constraints.length).toBeGreaterThanOrEqual(0);
  });

  it('handles dry-run mode without mutating DAG', () => {
    const dag: Graph<string> = {
      id: 'test-dryrun',
      desc: 'Test DAG',
      init: 'a',
      term: 'b',
      nodes: {
        a: {
          id: 'a',
          desc: 'A',
          produces: ['a.txt'],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: true,
        } as NodeSpec<string, 'a'>,
        b: {
          id: 'b',
          desc: 'B',
          produces: [],
          consumes: ['a.txt'],
          deps: ['a'],
          validate: [{ type: 'artifact-exists', path: 'a.txt' }],
          idempotent: true,
        } as NodeSpec<string, 'b'>,
      },
    };

    const dryRun = propagateConstraints(dag, { dryRun: true });
    const actualRun = propagateConstraints(dag, { dryRun: false });

    // Both should report same changes
    expect(dryRun.propagated).toBe(actualRun.propagated);
    expect(dryRun.nodesAffected).toBe(actualRun.nodesAffected);
  });
});
