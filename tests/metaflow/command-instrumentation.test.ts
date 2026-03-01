// @test command-instrumentation
// Tests for CommandExecution context fields and instrumentation

import { describe, it, expect } from 'vitest';
import { CommandInstrument, CommandExecution } from '../../src/lib/metaflow/command-instrumentation';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('command-instrumentation with context', () => {
  const testRoot = '/tmp/roadmap-test-runs';
  const runId = `test-run-${Date.now()}`;

  let instrument: CommandInstrument;

  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    instrument = new CommandInstrument(runId, testRoot);
  });

  afterEach(() => {
    try {
      rmSync(join(testRoot, '.roadmap'), { recursive: true, force: true });
    } catch {}
  });

  it('startExecution captures nodeId, dagId, noteText, stderrLines from context', () => {
    const { stop } = instrument.startExecution('orient', ['--note', 'test'], {
      nodeId: 'test-node',
      dagId: 'test-dag',
      noteText: 'test note',
      stderr: ['warning line 1', 'warning line 2'],
    });

    const exec = stop(0, '{"ok": true}');

    expect(exec.nodeId).toBe('test-node');
    expect(exec.dagId).toBe('test-dag');
    expect(exec.noteText).toBe('test note');
    expect(exec.stderrLines).toEqual(['warning line 1', 'warning line 2']);
  });

  it('startExecution works without context', () => {
    const { stop } = instrument.startExecution('orient', ['--note', 'test']);
    const exec = stop(0, '{"ok": true}');

    expect(exec.nodeId).toBeUndefined();
    expect(exec.dagId).toBeUndefined();
    expect(exec.noteText).toBeUndefined();
    expect(exec.stderrLines).toBeUndefined();
  });

  it('startExecution with partial context includes only provided fields', () => {
    const { stop } = instrument.startExecution('chart', [], {
      nodeId: 'partial-node',
    });

    const exec = stop(0, 'chart output');

    expect(exec.nodeId).toBe('partial-node');
    expect(exec.dagId).toBeUndefined();
    expect(exec.noteText).toBeUndefined();
    expect(exec.stderrLines).toBeUndefined();
  });

  it('recordExecution captures context fields', () => {
    const exec = instrument.recordExecution(
      'show',
      ['node-id'],
      0,
      '{"ok": true}',
      150,
      {
        nodeId: 'show-node',
        dagId: 'quality-dag',
        noteText: 'showing node details',
        stderr: ['debug info'],
      }
    );

    expect(exec.nodeId).toBe('show-node');
    expect(exec.dagId).toBe('quality-dag');
    expect(exec.noteText).toBe('showing node details');
    expect(exec.stderrLines).toEqual(['debug info']);
  });

  it('recordExecution works without context', () => {
    const exec = instrument.recordExecution('claim', ['node-id'], 0, 'claim ok', 50);

    expect(exec.nodeId).toBeUndefined();
    expect(exec.dagId).toBeUndefined();
    expect(exec.noteText).toBeUndefined();
    expect(exec.stderrLines).toBeUndefined();
  });

  it('context fields are preserved in execution history', () => {
    const { stop: stop1 } = instrument.startExecution('orient', [], {
      nodeId: 'node-1',
      dagId: 'dag-1',
    });
    stop1(0, 'ok');

    const { stop: stop2 } = instrument.startExecution('chart', [], {
      nodeId: 'node-2',
      dagId: 'dag-1',
    });
    stop2(0, 'ok');

    const executions = instrument.getExecutions();
    expect(executions).toHaveLength(2);
    expect(executions[0].nodeId).toBe('node-1');
    expect(executions[1].nodeId).toBe('node-2');
  });

  it('summarize includes executions with context fields', () => {
    const { stop } = instrument.startExecution('complete', ['node-id'], {
      nodeId: 'complete-node',
      dagId: 'completion-dag',
    });
    stop(0, 'completed');

    const summary = instrument.summarize();
    expect(summary.executions).toHaveLength(1);
    expect(summary.executions[0].nodeId).toBe('complete-node');
    expect(summary.executions[0].dagId).toBe('completion-dag');
  });

  it('context fields coexist with existing fields', () => {
    const { stop } = instrument.startExecution('orient', ['--mf-run', 'mf-123'], {
      nodeId: 'instrument-node',
      stderr: ['error'],
    });
    const exec = stop(1, 'some error occurred');

    expect(exec.mfRunId).toBe('mf-123');
    expect(exec.nodeId).toBe('instrument-node');
    expect(exec.exitCode).toBe(1);
    expect(exec.stderrLines).toEqual(['error']);
    expect(exec.errors).toBeDefined();
  });

  it('empty stderr array is preserved', () => {
    const { stop } = instrument.startExecution('test', [], {
      stderr: [],
    });
    const exec = stop(0, 'ok');

    expect(exec.stderrLines).toEqual([]);
  });

  it('undefined context fields are not included in execution object', () => {
    const { stop } = instrument.startExecution('cmd', [], {
      nodeId: 'node',
    });
    const exec = stop(0, 'ok');

    expect(Object.prototype.hasOwnProperty.call(exec, 'nodeId')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(exec, 'dagId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(exec, 'noteText')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(exec, 'stderrLines')).toBe(false);
  });
});
