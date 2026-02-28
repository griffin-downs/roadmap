import { describe, it, expect } from 'vitest';
import { define, graph } from '../src/protocol.ts';
import type { SpecMeta, Graph } from '../src/protocol.ts';

// Minimal 2-node DAG used across tests.
function makeMinimalGraph() {
  return define(graph({
    id: 'spec-meta-test',
    desc: 'minimal DAG for spec meta tests',
    init: 'start',
    term: 'end',
    nodes: {
      start: { id: 'start', desc: 'init node', produces: ['start.txt'], consumes: [], deps: [] },
      end:   { id: 'end',   desc: 'term node', produces: [], consumes: [], deps: ['start'] },
    },
  }));
}

const VALID_SPEC_META: SpecMeta = {
  compiled_sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  engine: { name: 'spec-kit', version: '1.2.3' },
  inputs: [
    { path: 'spec.md', sha256: 'deadbeef'.repeat(8), role: 'primary' },
    { path: 'pre-spec.md', sha256: 'cafebabe'.repeat(8), role: 'context' },
  ],
};

describe('head-spec-meta: FR-SPEC-003 SpecMeta on Graph type', () => {

  describe('backwards compatibility', () => {
    it('Graph without spec field passes define()', () => {
      const g = makeMinimalGraph();
      expect(g.spec).toBeUndefined();
    });

    it('existing Graph shape is unaffected by optional spec field', () => {
      const g = makeMinimalGraph();
      expect(g.id).toBe('spec-meta-test');
      expect(g.init).toBe('start');
      expect(g.term).toBe('end');
      expect(Object.keys(g.nodes)).toEqual(['start', 'end']);
    });
  });

  describe('Graph with spec field', () => {
    it('Graph with valid spec field passes define()', () => {
      const g = define(graph({
        id: 'with-spec',
        desc: 'DAG with spec metadata',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      expect(g.spec).toBeDefined();
      expect(g.spec?.compiled_sha256).toBe(VALID_SPEC_META.compiled_sha256);
    });

    it('spec.engine fields are accessible', () => {
      const g = define(graph({
        id: 'with-spec-engine',
        desc: 'engine check',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      expect(g.spec?.engine.name).toBe('spec-kit');
      expect(g.spec?.engine.version).toBe('1.2.3');
    });

    it('spec.engine.version can be null', () => {
      const meta: SpecMeta = {
        ...VALID_SPEC_META,
        engine: { name: 'unknown-engine', version: null },
      };
      const g = define(graph({
        id: 'null-version',
        desc: 'null engine version',
        init: 'start',
        term: 'end',
        spec: meta,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      expect(g.spec?.engine.version).toBeNull();
    });

    it('spec.inputs array is accessible with correct shape', () => {
      const g = define(graph({
        id: 'with-inputs',
        desc: 'inputs check',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      expect(g.spec?.inputs).toHaveLength(2);
      expect(g.spec?.inputs[0]).toEqual({ path: 'spec.md', sha256: 'deadbeef'.repeat(8), role: 'primary' });
      expect(g.spec?.inputs[1]).toEqual({ path: 'pre-spec.md', sha256: 'cafebabe'.repeat(8), role: 'context' });
    });

    it('spec.inputs can be empty array', () => {
      const meta: SpecMeta = { ...VALID_SPEC_META, inputs: [] };
      const g = define(graph({
        id: 'empty-inputs',
        desc: 'empty inputs',
        init: 'start',
        term: 'end',
        spec: meta,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      expect(g.spec?.inputs).toHaveLength(0);
    });
  });

  describe('SpecMeta type export', () => {
    it('SpecMeta can be used as a standalone type annotation', () => {
      const meta: SpecMeta = {
        compiled_sha256: 'abc123',
        engine: { name: 'test', version: '0.0.1' },
        inputs: [{ path: 'f.md', sha256: 'deadbeef', role: 'primary' }],
      };
      expect(meta.compiled_sha256).toBe('abc123');
    });

    it('Graph type annotation includes spec field', () => {
      type Nodes = 'start' | 'end';
      const g: Graph<Nodes> = define(graph({
        id: 'typed',
        desc: 'typed graph',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      const _spec: SpecMeta | undefined = g.spec;
      expect(_spec).toBeDefined();
    });
  });

  describe('JSON round-trip', () => {
    it('spec field survives JSON serialization', () => {
      const g = define(graph({
        id: 'round-trip',
        desc: 'round trip test',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      const serialized = JSON.stringify(g);
      const parsed = JSON.parse(serialized) as Graph<'start' | 'end'>;

      expect(parsed.spec?.compiled_sha256).toBe(VALID_SPEC_META.compiled_sha256);
      expect(parsed.spec?.engine.name).toBe('spec-kit');
      expect(parsed.spec?.engine.version).toBe('1.2.3');
      expect(parsed.spec?.inputs).toHaveLength(2);
    });

    it('Graph without spec round-trips cleanly (spec absent, not null)', () => {
      const g = makeMinimalGraph();
      const serialized = JSON.stringify(g);
      const parsed = JSON.parse(serialized) as Graph<'start' | 'end'>;
      expect(parsed.spec).toBeUndefined();
    });
  });

  describe('graph() helper with spec', () => {
    it('graph() inference helper accepts spec field', () => {
      const raw = graph({
        id: 'helper-test',
        desc: 'graph() helper',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      });

      expect(raw.spec?.compiled_sha256).toBe(VALID_SPEC_META.compiled_sha256);
    });

    it('define(graph(...)) preserves spec field', () => {
      const g = define(graph({
        id: 'define-with-spec',
        desc: 'define preserves spec',
        init: 'start',
        term: 'end',
        spec: VALID_SPEC_META,
        nodes: {
          start: { id: 'start', desc: 'init', produces: ['a.txt'], consumes: [], deps: [] },
          end:   { id: 'end',   desc: 'term', produces: [], consumes: [], deps: ['start'] },
        },
      }));

      expect(g.spec).toStrictEqual(VALID_SPEC_META);
    });
  });
});
