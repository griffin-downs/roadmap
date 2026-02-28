import { describe, it, expect } from 'vitest';
import {
  createReceiptEntry,
  verifyReceiptChain,
  type ReceiptChain,
  type ReceiptChainEntry,
} from '../src/lib/receipt-types.ts';

const specMeta = {
  engine: { name: 'spec-kit', version: '1.0.0', config_hash: 'abc123' },
  inputs: [
    { path: '.specify/pre-spec.md', sha256: 'deadbeef01', role: 'pre-spec' as const },
    { path: '.specify/specs/my-dag/spec.md', sha256: 'deadbeef02', role: 'spec' as const },
  ],
  metadata: { compile_hash: 'compilehash99' },
};

const validatorResults = [
  { rule: 'artifact-exists', passed: true, evidence: 'src/lib/foo.ts exists' },
];

describe('createReceiptEntry', () => {
  it('produces a valid entry with all required fields', () => {
    const entry = createReceiptEntry('my-node', 'dagsha256abc', specMeta, validatorResults, 'agent-1');

    expect(entry.node_id).toBe('my-node');
    expect(entry.dag_sha256).toBe('dagsha256abc');
    expect(entry.compiled_sha256).toBe('compilehash99');
    expect(entry.engine).toEqual({ name: 'spec-kit', version: '1.0.0' });
    expect(entry.input_hashes).toHaveLength(2);
    expect(entry.input_hashes[0]).toEqual({
      path: '.specify/pre-spec.md',
      sha256: 'deadbeef01',
      role: 'pre-spec',
    });
    expect(entry.validator_results).toEqual(validatorResults);
    expect(entry.owner).toBe('agent-1');
    // completed_at must be a valid ISO timestamp
    expect(() => new Date(entry.completed_at).toISOString()).not.toThrow();
  });

  it('owner is optional — omits when not provided', () => {
    const entry = createReceiptEntry('node-no-owner', 'dagsha', specMeta, []);
    expect(entry.owner).toBeUndefined();
  });

  it('engine.version is preserved as null when null in specMeta', () => {
    const metaNoVersion = {
      ...specMeta,
      engine: { name: 'custom', version: null, config_hash: null },
    };
    const entry = createReceiptEntry('n', 'sha', metaNoVersion, []);
    expect(entry.engine.version).toBeNull();
  });
});

describe('verifyReceiptChain', () => {
  function makeEntry(nodeId: string, completedAt: string): ReceiptChainEntry {
    return {
      node_id: nodeId,
      completed_at: completedAt,
      compiled_sha256: 'compilehash',
      dag_sha256: 'dagsha',
      engine: { name: 'spec-kit', version: '1.0.0' },
      input_hashes: [],
      validator_results: [],
    };
  }

  it('accepts a valid chain with ordered entries', () => {
    const chain: ReceiptChain = {
      schema_version: 1,
      dag_id: 'my-dag',
      entries: [
        makeEntry('node-a', '2024-01-01T00:00:00.000Z'),
        makeEntry('node-b', '2024-01-02T00:00:00.000Z'),
      ],
    };
    const result = verifyReceiptChain(chain);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts an empty chain', () => {
    const chain: ReceiptChain = {
      schema_version: 1,
      dag_id: 'my-dag',
      entries: [],
    };
    const result = verifyReceiptChain(chain);
    expect(result.valid).toBe(true);
  });

  it('rejects wrong schema_version', () => {
    const chain = {
      schema_version: 2 as unknown as 1,
      dag_id: 'my-dag',
      entries: [],
    };
    const result = verifyReceiptChain(chain as ReceiptChain);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('schema_version'))).toBe(true);
  });

  it('rejects out-of-order timestamps', () => {
    const chain: ReceiptChain = {
      schema_version: 1,
      dag_id: 'my-dag',
      entries: [
        makeEntry('node-b', '2024-01-03T00:00:00.000Z'),
        makeEntry('node-a', '2024-01-01T00:00:00.000Z'), // earlier than previous
      ],
    };
    const result = verifyReceiptChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('out of chronological order'))).toBe(true);
  });

  it('rejects entries with invalid timestamps', () => {
    const chain: ReceiptChain = {
      schema_version: 1,
      dag_id: 'my-dag',
      entries: [makeEntry('node-a', 'not-a-date')],
    };
    const result = verifyReceiptChain(chain);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('invalid completed_at'))).toBe(true);
  });
});
