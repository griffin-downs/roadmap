// @module metaflow/command-instrumentation
// @exports CommandInstrument, CommandExecution, InstrumentationSummary, extractMfRun
// @entry roadmap/metaflow

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CommandExecution {
  cmd: string;
  args: string[];
  startTime: number;
  endTime: number;
  durationMs: number;
  exitCode: number;
  outputSize: number;
  outputStructure: 'json' | 'text' | 'mixed' | 'envelope';
  envelopeOk?: boolean;
  mfRunId?: string;
  errors?: string[];
  timestamp: string;
  nodeId?: string;
  dagId?: string;
  noteText?: string;
  stderrLines?: string[];
}

export interface InstrumentationSummary {
  runId: string;
  timestamp: string;
  commands: number;
  totalDurationMs: number;
  byStructure: Record<string, number>;
  byExitCode: Record<number, number>;
  executions: CommandExecution[];
}

/**
 * Extract --mf-run <runId> from an args array.
 * Returns the runId and the args with --mf-run removed.
 */
export function extractMfRun(args: string[]): { mfRunId: string | undefined; cleanArgs: string[] } {
  const idx = args.indexOf('--mf-run');
  if (idx === -1) return { mfRunId: undefined, cleanArgs: args };

  const mfRunId = args[idx + 1];
  const cleanArgs = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { mfRunId, cleanArgs };
}

/**
 * Classify output as envelope (valid CLI envelope JSON), json, text, or mixed.
 */
function classifyOutput(output: string): { structure: CommandExecution['outputStructure']; envelopeOk?: boolean } {
  const trimmed = output.trim();
  if (!trimmed) return { structure: 'text' };

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && 'schema_version' in parsed && 'ok' in parsed && 'cmd' in parsed) {
      return { structure: 'envelope', envelopeOk: parsed.ok };
    }
    return { structure: 'json' };
  } catch { /* not pure JSON */ }

  // Check for JSON embedded in other output (mixed)
  const lines = trimmed.split('\n');
  const hasJsonLine = lines.some(l => /^\s*[{\[]/.test(l));
  if (hasJsonLine) return { structure: 'mixed' };

  return { structure: 'text' };
}

export class CommandInstrument {
  private runId: string;
  private runDir: string;
  private executions: CommandExecution[] = [];

  constructor(runId: string, repoRoot: string) {
    this.runId = runId;
    this.runDir = join(repoRoot, '.roadmap', 'runs', runId);
    mkdirSync(this.runDir, { recursive: true });
  }

  /** Start a timed execution. Returns a stop function. */
  startExecution(cmd: string, args: string[], context?: {
    nodeId?: string;
    dagId?: string;
    noteText?: string;
    stderr?: string[];
  }): { stop: (exitCode: number, output: string) => CommandExecution } {
    const { mfRunId, cleanArgs } = extractMfRun(args);
    const startTime = Date.now();

    return {
      stop: (exitCode: number, output: string): CommandExecution => {
        const endTime = Date.now();
        const { structure, envelopeOk } = classifyOutput(output);

        const execution: CommandExecution = {
          cmd,
          args: cleanArgs,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          exitCode,
          outputSize: output.length,
          outputStructure: structure,
          timestamp: new Date(startTime).toISOString(),
        };

        if (envelopeOk !== undefined) execution.envelopeOk = envelopeOk;
        if (mfRunId) execution.mfRunId = mfRunId;
        if (context?.nodeId) execution.nodeId = context.nodeId;
        if (context?.dagId) execution.dagId = context.dagId;
        if (context?.noteText) execution.noteText = context.noteText;
        if (context?.stderr) execution.stderrLines = context.stderr;
        if (exitCode !== 0) {
          const errLines = output.split('\n').filter(l => /error|fail/i.test(l)).slice(0, 5);
          if (errLines.length > 0) execution.errors = errLines;
        }

        this.executions.push(execution);
        return execution;
      },
    };
  }

  /** Record a completed execution (when start/stop timing is external). */
  recordExecution(cmd: string, args: string[], exitCode: number, output: string, durationMs?: number, context?: {
    nodeId?: string;
    dagId?: string;
    noteText?: string;
    stderr?: string[];
  }): CommandExecution {
    const { mfRunId, cleanArgs } = extractMfRun(args);
    const now = Date.now();
    const { structure, envelopeOk } = classifyOutput(output);

    const execution: CommandExecution = {
      cmd,
      args: cleanArgs,
      startTime: durationMs != null ? now - durationMs : now,
      endTime: now,
      durationMs: durationMs ?? 0,
      exitCode,
      outputSize: output.length,
      outputStructure: structure,
      timestamp: new Date().toISOString(),
    };

    if (envelopeOk !== undefined) execution.envelopeOk = envelopeOk;
    if (mfRunId) execution.mfRunId = mfRunId;
    if (context?.nodeId) execution.nodeId = context.nodeId;
    if (context?.dagId) execution.dagId = context.dagId;
    if (context?.noteText) execution.noteText = context.noteText;
    if (context?.stderr) execution.stderrLines = context.stderr;
    if (exitCode !== 0) {
      const errLines = output.split('\n').filter(l => /error|fail/i.test(l)).slice(0, 5);
      if (errLines.length > 0) execution.errors = errLines;
    }

    this.executions.push(execution);
    return execution;
  }

  /** Build summary statistics. */
  summarize(): InstrumentationSummary {
    const byStructure: Record<string, number> = {};
    const byExitCode: Record<number, number> = {};
    let totalDurationMs = 0;

    for (const exec of this.executions) {
      byStructure[exec.outputStructure] = (byStructure[exec.outputStructure] ?? 0) + 1;
      byExitCode[exec.exitCode] = (byExitCode[exec.exitCode] ?? 0) + 1;
      totalDurationMs += exec.durationMs;
    }

    return {
      runId: this.runId,
      timestamp: new Date().toISOString(),
      commands: this.executions.length,
      totalDurationMs,
      byStructure,
      byExitCode,
      executions: this.executions,
    };
  }

  /** Flush mining data to the run directory. */
  saveMining(): string {
    const summary = this.summarize();
    const path = join(this.runDir, 'mining.json');
    writeFileSync(path, JSON.stringify(summary, null, 2) + '\n');
    return path;
  }

  /** Get recorded executions (read-only). */
  getExecutions(): readonly CommandExecution[] {
    return this.executions;
  }
}
