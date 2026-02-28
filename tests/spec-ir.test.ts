import { describe, it, expect } from 'vitest';
import { compileIR, parseIRFile, defaultConfig } from '../src/lib/spec-ir.ts';
import type { SpecIR } from '../src/lib/spec-ir.ts';
import { define } from '../src/protocol.ts';

describe('FR-SPEC-001: spec IR', () => {
  const sampleIR: SpecIR = {
    schema_version: 1,
    engine: { name: 'spec-kit', version: '1.0.0', config_hash: 'abc123' },
    dag_id: 'test-dag',
    dag_desc: 'Test DAG',
    inputs: [{ path: 'tasks.md', sha256: 'deadbeef', role: 'tasks' }],
    tasks: [
      { id: 'setup', desc: 'Init', priority: 0, depends: [], produces: ['config.json'], consumes: [], mode: 'execute', validate: [] },
      { id: 'build', desc: 'Build', priority: 1, depends: ['setup'], produces: ['out.js'], consumes: ['config.json'], mode: 'execute', validate: [] },
    ],
    metadata: { generated: '2026-01-01T00:00:00Z', compile_hash: 'abc123' },
  };

  it('compileIR produces valid DAG from IR', () => {
    const dag = compileIR(sampleIR);
    expect(dag.id).toBe('test-dag');
    expect(dag.init).toBe('setup');
    expect(dag.term).toBe('build');
    expect(Object.keys(dag.nodes)).toContain('setup');
    expect(Object.keys(dag.nodes)).toContain('build');
    define(dag); // should not throw
  });

  it('parseIRFile validates schema version', () => {
    expect(() => parseIRFile(JSON.stringify({ schema_version: 99 }))).toThrow('Unsupported');
  });

  it('parseIRFile rejects empty tasks', () => {
    expect(() => parseIRFile(JSON.stringify({ schema_version: 1, dag_id: 'x', tasks: [] }))).toThrow('no tasks');
  });

  it('parseIRFile rejects missing dag_id', () => {
    expect(() => parseIRFile(JSON.stringify({ schema_version: 1, tasks: [{ id: 'a' }] }))).toThrow('missing dag_id');
  });

  it('defaultConfig produces spec-kit config', () => {
    const config = defaultConfig('my-app');
    expect(config.engine).toBe('spec-kit');
    expect(config.dag_id).toBe('my-app');
    expect(config.inputs.tasks).toContain('my-app');
  });
});
