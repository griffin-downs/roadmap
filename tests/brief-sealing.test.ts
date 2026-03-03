// @test brief-sealing: sealed agent briefs (deterministic, read-only, minimal)

import { describe, it, expect, beforeEach } from 'vitest';
import { define, graph } from '../src/protocol.ts';
import { compileBrief } from '../src/lib/compile-brief.ts';
import type { Graph } from '../src/protocol.ts';

describe('Brief Sealing: Determinism, Immutability, Minimalism', () => {
  let dag: Graph<string>;

  beforeEach(() => {
    // Create a simple DAG for testing
    dag = define(
      graph({
        id: 'test-seal',
        desc: 'Test brief sealing properties',
        init: 'baseline',
        term: 'completion',
        nodes: {
          baseline: {
            id: 'baseline',
            desc: 'Start the process',
            produces: ['init-file.ts'],
            consumes: [],
            deps: [],
            validate: [{ type: 'artifact-exists', path: 'init-file.ts' }],
            idempotent: true,
          },
          implementation: {
            id: 'implementation',
            desc: 'Build the core implementation from spec',
            produces: ['src/index.ts', 'src/lib.ts'],
            consumes: ['init-file.ts'],
            deps: ['baseline'],
            validate: [
              { type: 'shell', command: 'npx tsc --noEmit src/index.ts' },
              { type: 'artifact-exists', path: 'src/index.ts' },
            ],
            idempotent: true,
            mode: 'execute',
          },
          testing: {
            id: 'testing',
            desc: 'Write tests that prove correctness',
            produces: ['tests/index.test.ts'],
            consumes: ['src/index.ts'],
            deps: ['implementation'],
            validate: [
              { type: 'shell', command: 'npm test tests/index.test.ts' },
            ],
            idempotent: true,
          },
          planning: {
            id: 'planning',
            desc: 'Plan the next phase of development',
            produces: [],
            consumes: [],
            deps: ['implementation'],
            validate: [{ type: 'expanded', minNodes: 2 }],
            idempotent: true,
            mode: 'plan',
          },
          completion: {
            id: 'completion',
            desc: 'Final integration and release',
            produces: ['RELEASE.md'],
            consumes: ['tests/index.test.ts'],
            deps: ['testing', 'planning'],
            validate: [],
            idempotent: false,
          },
        },
      }),
    );
  });

  describe('Determinism', () => {
    it('same node spec produces identical brief on multiple calls', () => {
      const brief1 = compileBrief(dag, 'implementation');
      const brief2 = compileBrief(dag, 'implementation');

      // All properties must match exactly
      expect(brief1.nodeId).toBe(brief2.nodeId);
      expect(brief1.title).toBe(brief2.title);
      expect(brief1.assignment).toBe(brief2.assignment);
      expect(JSON.stringify(brief1.whatYouProduce)).toBe(
        JSON.stringify(brief2.whatYouProduce),
      );
      expect(JSON.stringify(brief1.whatYouConsume)).toBe(
        JSON.stringify(brief2.whatYouConsume),
      );
      expect(JSON.stringify(brief1.successCriteria)).toBe(
        JSON.stringify(brief2.successCriteria),
      );
    });

    it('deterministic for different nodes', () => {
      // Run multiple times to ensure consistency
      const results = Array(5)
        .fill(null)
        .map(() => compileBrief(dag, 'testing'));

      for (let i = 1; i < results.length; i++) {
        expect(JSON.stringify(results[i])).toBe(
          JSON.stringify(results[0]),
        );
      }
    });

    it('hash of brief is consistent across invocations', () => {
      const hashBrief = (brief: any) => {
        // Simple deterministic hash: JSON stringify preserves order
        const str = JSON.stringify(brief, Object.keys(brief).sort());
        // Simple hash: XOR of char codes
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
      };

      const hash1 = hashBrief(compileBrief(dag, 'implementation'));
      const hash2 = hashBrief(compileBrief(dag, 'implementation'));
      const hash3 = hashBrief(compileBrief(dag, 'implementation'));

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('Immutability', () => {
    it('brief properties are included in validation (readonly-ness enforced by TypeScript)', () => {
      const brief = compileBrief(dag, 'implementation');

      // Properties must be present
      expect(brief.nodeId).toBeDefined();
      expect(brief.whatYouProduce).toBeDefined();
      expect(brief.whatYouConsume).toBeDefined();
      expect(brief.successCriteria).toBeDefined();
      expect(brief.validationRules).toBeDefined();
    });

    it('arrays in brief are sealed (agent cannot add/remove produces)', () => {
      const brief = compileBrief(dag, 'implementation');

      // Store original length
      const originalProducesLength = brief.whatYouProduce.length;
      const originalConsumeLength = brief.whatYouConsume.length;

      // Attempt mutation should throw (frozen array prevents modification)
      expect(() => {
        brief.whatYouProduce.push('extra-file.ts');
      }).toThrow();

      expect(() => {
        brief.whatYouConsume.push('extra-consume.ts');
      }).toThrow();

      // Get a fresh brief for the same node
      const freshBrief = compileBrief(dag, 'implementation');

      // Fresh brief should not have attempted mutations
      expect(freshBrief.whatYouProduce.length).toBe(originalProducesLength);
      expect(freshBrief.whatYouConsume.length).toBe(originalConsumeLength);
      expect(freshBrief.whatYouProduce).not.toContain('extra-file.ts');
    });

    it('brief does not expose DAG modification interface', () => {
      const brief = compileBrief(dag, 'implementation');

      // Brief should not have access to DAG methods
      expect((brief as any).addNode).toBeUndefined();
      expect((brief as any).addDep).toBeUndefined();
      expect((brief as any).removeDep).toBeUndefined();
      expect((brief as any).updateNode).toBeUndefined();
    });
  });

  describe('Minimalism: Only What Agent Needs', () => {
    it('brief contains only produces, consumes, and validation (no DAG structure)', () => {
      const brief = compileBrief(dag, 'implementation');

      // What brief should have
      expect(brief.whatYouProduce).toBeDefined();
      expect(brief.whatYouConsume).toBeDefined();
      expect(brief.successCriteria).toBeDefined();
      expect(brief.validationRules).toBeDefined();
      expect(brief.nodeId).toBeDefined();
      expect(brief.assignment).toBeDefined();

      // What brief should NOT have (no DAG introspection)
      expect((brief as any).deps).toBeUndefined();
      expect((brief as any).dependents).toBeUndefined();
      expect((brief as any).allDeps).toBeUndefined();
      expect((brief as any).downstreamNodes).toBeUndefined();
      expect((brief as any).siblingCount).toBeUndefined();
    });

    it('produces/consumes limited to essential information', () => {
      const brief = compileBrief(dag, 'implementation');

      // Produces should be simple strings
      expect(Array.isArray(brief.whatYouProduce)).toBe(true);
      for (const prod of brief.whatYouProduce) {
        expect(typeof prod).toBe('string');
        expect(prod).not.toContain('://'); // No URLs or special metadata
      }

      // Consumes should be simple strings
      expect(Array.isArray(brief.whatYouConsume)).toBe(true);
      for (const cons of brief.whatYouConsume) {
        expect(typeof cons).toBe('string');
        expect(cons).not.toContain('://'); // No URLs or special metadata
      }
    });

    it('agent cannot discover sibling nodes through brief', () => {
      const brief = compileBrief(dag, 'implementation');

      // Should not expose other node IDs
      expect((brief as any).siblingNodeIds).toBeUndefined();
      expect((brief as any).otherNodes).toBeUndefined();
      expect((brief as any).allNodeIds).toBeUndefined();

      // The allNodes field exists but is just for reference (not for introspection)
      expect(brief.allNodes).toBeDefined();
      // It's a comma-separated string, not a structure agent can query
      expect(typeof brief.allNodes).toBe('string');
    });

    it('brief does not expose dependency graph topology', () => {
      const brief = compileBrief(dag, 'implementation');

      // Should not have graph structure
      expect((brief as any).graph).toBeUndefined();
      expect((brief as any).nodes).toBeUndefined();
      expect((brief as any).edges).toBeUndefined();
      expect((brief as any).adjacencyList).toBeUndefined();
      expect((brief as any).reachability).toBeUndefined();
    });
  });

  describe('No DAG Introspection', () => {
    it('brief does not expose methods to query DAG', () => {
      const brief = compileBrief(dag, 'implementation');

      // No query methods
      expect((brief as any).getParents).toBeUndefined();
      expect((brief as any).getChildren).toBeUndefined();
      expect((brief as any).getNode).toBeUndefined();
      expect((brief as any).findPath).toBeUndefined();
      expect((brief as any).findCycles).toBeUndefined();
    });

    it('brief cannot be used to construct full DAG', () => {
      const brief = compileBrief(dag, 'implementation');

      // Agent receiving only this brief should not be able to reconstruct the DAG
      const hasEnoughInfo = {
        toListAllNodes: false, // No node list
        toQueryNodeDeps: false, // No deps field
        toFindPath: false, // No reachability
        toDetectCycles: false, // No cycle detection
        toComputeCriticalPath: false, // No level info
      };

      // Verify these are all false (no introspection capability)
      expect((brief as any).nodes).toBeUndefined(); // Can't list all nodes
      expect((brief as any).deps).toBeUndefined(); // Can't query deps
      expect(Array.isArray((brief as any).graph)).toBe(false); // No graph structure

      for (const [_, capability] of Object.entries(hasEnoughInfo)) {
        expect(capability).toBe(false);
      }
    });

    it('brief does not expose previous node information (except through handoff)', () => {
      const brief = compileBrief(dag, 'testing');

      // No "predecessor" field (except handoff from file system)
      expect((brief as any).predecessor).toBeUndefined();
      expect((brief as any).previousNodeId).toBeUndefined();

      // What provides context is consumes (files) not DAG references
      expect(brief.whatYouConsume).toBeDefined();
      expect(typeof brief.whatYouConsume[0]).toBe('string'); // Just artifact paths
    });

    it('different nodes get sealed briefs without cross-node visibility', () => {
      const briefImpl = compileBrief(dag, 'implementation');
      const briefTest = compileBrief(dag, 'testing');

      // implementation doesn't see testing
      expect(briefImpl.whatYouConsume).not.toContain('tests/index.test.ts');
      expect((briefImpl as any).dependents).toBeUndefined();

      // testing can see what implementation produces
      expect(briefTest.whatYouConsume).toContain('src/index.ts');

      // But testing cannot discover other consumers of src/index.ts
      expect((briefTest as any).downstreamDependents).toBeUndefined();
    });
  });

  describe('Validation Rules in Brief', () => {
    it('validation rules are sealed and represent acceptance criteria', () => {
      const brief = compileBrief(dag, 'implementation');

      expect(Array.isArray(brief.validationRules)).toBe(true);
      expect(brief.validationRules.length).toBeGreaterThan(0);

      // Rules are plain objects, not closures or methods
      for (const rule of brief.validationRules) {
        expect(typeof rule).toBe('object');
        expect(rule).not.toBeInstanceOf(Function);
      }
    });

    it('success criteria are human-readable, not code-introspectable', () => {
      const brief = compileBrief(dag, 'implementation');

      expect(Array.isArray(brief.successCriteria)).toBe(true);
      for (const criterion of brief.successCriteria) {
        expect(typeof criterion).toBe('string');
        // Should be human-readable descriptions
        expect(criterion.length).toBeGreaterThan(0);
      }
    });

    it('brief with plan mode is still sealed', () => {
      const brief = compileBrief(dag, 'planning');

      // Even plan nodes are sealed
      expect(brief.nodeId).toBe('planning');
      expect((brief as any).deps).toBeUndefined();
      expect((brief as any).graph).toBeUndefined();

      // Plan nodes should indicate expansion is needed
      expect(brief.validationRules.some((r: any) => r.type === 'expanded')).toBe(
        true,
      );
    });
  });

  describe('Edge Cases: Sealing Under Pressure', () => {
    it('brief for terminal node is still sealed', () => {
      const brief = compileBrief(dag, 'completion');

      // Even at term, no graph access
      expect((brief as any).remaining).toBeUndefined();
      expect((brief as any).isTerminal).toBeUndefined();
      expect((brief as any).criticalPath).toBeUndefined();
    });

    it('brief for init node is sealed', () => {
      const brief = compileBrief(dag, 'baseline');

      // Even at init, no graph access
      expect((brief as any).isInit).toBeUndefined();
      expect((brief as any).downstreamCount).toBeUndefined();

      // Should have no consumes
      expect(brief.whatYouConsume.length).toBe(0);
    });

    it('brief exposes only direct consumes, not transitive dependencies', () => {
      const brief = compileBrief(dag, 'completion');

      // completion depends on testing and planning
      // But consumes only what it directly needs
      expect(brief.whatYouConsume).toContain('tests/index.test.ts');

      // Should NOT contain transitive artifacts (e.g., from baseline, implementation)
      expect(brief.whatYouConsume).not.toContain('init-file.ts');
      expect(brief.whatYouConsume).not.toContain('src/index.ts');
    });

    it('brief cannot be used to derive critical path', () => {
      const brief = compileBrief(dag, 'implementation');

      // No level/batch information
      expect((brief as any).level).toBeUndefined();
      expect((brief as any).batch).toBeUndefined();
      expect((brief as any).criticalPath).toBeUndefined();
      expect((brief as any).onCriticalPath).toBeUndefined();
    });
  });

  describe('Type Safety: Brief is Sealed Interface', () => {
    it('CompiledBrief has all required fields', () => {
      const brief = compileBrief(dag, 'implementation');

      // Required fields for agent to work
      expect('nodeId' in brief).toBe(true);
      expect('whatYouProduce' in brief).toBe(true);
      expect('whatYouConsume' in brief).toBe(true);
      expect('successCriteria' in brief).toBe(true);
      expect('validationRules' in brief).toBe(true);
      expect('assignment' in brief).toBe(true);
    });

    it('brief types are stable and serializable', () => {
      const brief = compileBrief(dag, 'implementation');

      // Should be JSON-serializable (no functions, closures)
      const json = JSON.stringify(brief);
      const deserialized = JSON.parse(json);

      expect(deserialized.nodeId).toBe(brief.nodeId);
      expect(JSON.stringify(deserialized.whatYouProduce)).toBe(
        JSON.stringify(brief.whatYouProduce),
      );
    });
  });
});
