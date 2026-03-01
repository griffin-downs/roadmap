import { describe, it, expect } from 'vitest';
import type { ValidatorResult, RunnerInfo, CompletionRecord } from '../src/lib/completion/completion-store';

describe('completion-store types', () => {
  it('ValidatorResult has required and optional fields', () => {
    const r: ValidatorResult = {
      id: 'shell:npx tsc',
      passed: true,
      exitCode: 0,
      artifactPaths: [],
    };
    expect(r.id).toBe('shell:npx tsc');
    expect(r.passed).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.artifactPaths).toEqual([]);
    expect(r.stdoutSha).toBeUndefined();
    expect(r.stderrSha).toBeUndefined();
  });

  it('ValidatorResult accepts optional sha fields', () => {
    const r: ValidatorResult = {
      id: 'artifact-exists:foo.ts',
      passed: false,
      exitCode: 1,
      stdoutSha: 'abc123',
      stderrSha: 'def456',
      artifactPaths: ['.roadmap/artifacts/node-x/abc123/out.txt'],
    };
    expect(r.stdoutSha).toBe('abc123');
    expect(r.stderrSha).toBe('def456');
    expect(r.artifactPaths).toHaveLength(1);
  });

  it('RunnerInfo has id and version', () => {
    const runner: RunnerInfo = { id: 'completion-agent', version: '1.0.0' };
    expect(runner.id).toBe('completion-agent');
    expect(runner.version).toBe('1.0.0');
  });

  it('CompletionRecord base fields are compatible with legacy shape', () => {
    // Legacy: only required base fields
    const legacy: CompletionRecord = {
      nodeId: 'some-node',
      completedAt: new Date().toISOString(),
    };
    expect(legacy.nodeId).toBe('some-node');
    expect(legacy.validatorResults).toBeUndefined();
    expect(legacy.runner).toBeUndefined();
    expect(legacy.commitSha).toBeUndefined();
    expect(legacy.treeSha).toBeUndefined();
  });

  it('CompletionRecord accepts all extended fields', () => {
    const record: CompletionRecord = {
      nodeId: 'impl-node',
      completedAt: new Date().toISOString(),
      owner: 'agent-1',
      checkpointId: 'cp-001',
      validatorResults: [
        { id: 'shell:npx tsc', passed: true, exitCode: 0, artifactPaths: [] },
      ],
      runner: { id: 'swarm-worker', version: '2.3.0' },
      commitSha: 'deadbeef',
      treeSha: 'cafebabe',
    };
    expect(record.validatorResults).toHaveLength(1);
    expect(record.runner?.id).toBe('swarm-worker');
    expect(record.commitSha).toBe('deadbeef');
    expect(record.treeSha).toBe('cafebabe');
  });
});
