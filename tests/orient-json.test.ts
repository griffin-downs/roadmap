import { describe, it, expect } from 'vitest';
import { roadmapCliJson } from './cli-helper.ts';

describe('orient --json (v1 machine envelope)', () => {
  it('emits schema_version 1', () => {
    const r = roadmapCliJson('orient --json --check');
    expect(r.schema_version).toBe(1);
  });

  it('includes tool metadata', () => {
    const r = roadmapCliJson('orient --json --check');
    expect(r.tool.name).toBe('roadmap');
    expect(typeof r.tool.version).toBe('string');
    expect(r.tool.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('includes workspace info', () => {
    const r = roadmapCliJson('orient --json --check');
    expect(typeof r.workspace.root).toBe('string');
    expect(r.workspace.root.length).toBeGreaterThan(0);
    expect(typeof r.workspace.node).toBe('string');
    expect(r.workspace.node).toMatch(/^v\d+/);
    expect(typeof r.workspace.platform).toBe('string');
    expect(typeof r.workspace.dag_id).toBe('string');
    expect(r.workspace.dag_id.length).toBeGreaterThan(0);
  });

  it('includes inputs.dag = false when --dag not passed', () => {
    const r = roadmapCliJson('orient --json --check');
    expect(r.inputs.dag).toBe(false);
    expect(r.dag).toBeUndefined();
  });

  it('includes position fields from orient', () => {
    const r = roadmapCliJson('orient --json --check');
    expect(Array.isArray(r.position)).toBe(true);
    expect(typeof r.level).toBe('number');
    expect(Array.isArray(r.produces)).toBe(true);
    expect(Array.isArray(r.consumes)).toBe(true);
    expect(Array.isArray(r.batchRemaining)).toBe(true);
    expect(typeof r.batchComplete).toBe('boolean');
    expect(typeof r.done).toBe('number');
    expect(typeof r.remaining).toBe('number');
    expect(typeof r.complete).toBe('boolean');
  });

  it('includes exit.code 0', () => {
    const r = roadmapCliJson('orient --json --check');
    expect(r.exit.code).toBe(0);
  });

  it('default orient output is unchanged (no schema_version)', () => {
    const r = roadmapCliJson('orient --check');
    expect(r.schema_version).toBeUndefined();
    expect(r.exit).toBeUndefined();
    expect(r).toHaveProperty('position');
    expect(r).toHaveProperty('level');
  });
});

describe('orient --json --dag (full DAG structure)', () => {
  it('includes dag object with nodes, edges, toposort', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(r.inputs.dag).toBe(true);
    expect(r.dag).toBeDefined();
    expect(Array.isArray(r.dag.nodes)).toBe(true);
    expect(Array.isArray(r.dag.edges)).toBe(true);
    expect(Array.isArray(r.dag.toposort)).toBe(true);
  });

  it('dag.nodes have required fields', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    // Use first non-init/term node from whatever DAG is active
    const node = r.dag.nodes.find((n: any) => n.id !== 'init' && n.id !== 'term');
    expect(node).toBeDefined();
    expect(typeof node.desc).toBe('string');
    expect(typeof node.mode).toBe('string');
    expect(Array.isArray(node.produces)).toBe(true);
    expect(Array.isArray(node.consumes)).toBe(true);
    expect(Array.isArray(node.deps)).toBe(true);
    expect(['satisfied', 'pending', 'blocked', 'done', 'retired', 'in-progress']).toContain(node.status);
    expect(Array.isArray(node.validate)).toBe(true);
  });

  it('dag.edges are explicit with from/to/kind', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(r.dag.edges.length).toBeGreaterThan(0);
    const edge = r.dag.edges[0];
    expect(typeof edge.from).toBe('string');
    expect(typeof edge.to).toBe('string');
    expect(edge.kind).toBe('dep');
  });

  it('dag.toposort covers all nodes', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(r.dag.toposort.length).toBe(r.dag.node_count);
  });

  it('dag.blocked is array of blocked nodes', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(Array.isArray(r.dag.blocked)).toBe(true);
    // At term, nothing should be blocked
    if (r.complete) {
      expect(r.dag.blocked.length).toBe(0);
    }
  });

  it('dag.executable lists actionable node IDs', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(Array.isArray(r.dag.executable)).toBe(true);
  });

  it('node_count matches nodes array length', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(r.dag.node_count).toBe(r.dag.nodes.length);
  });

  it('dag.id and dag.desc match DAG metadata', () => {
    const r = roadmapCliJson('orient --json --dag --check');
    expect(typeof r.dag.id).toBe('string');
    expect(typeof r.dag.desc).toBe('string');
    expect(r.dag.id.length).toBeGreaterThan(0);
  });
});
