#!/usr/bin/env node
// @script mine-cli-usage
// Run 20+ instrumented CLI commands and aggregate statistics

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { CommandInstrument } from '../src/lib/metaflow/command-instrumentation';

const repoRoot = '/home/griffin/src/roadmap';
const instrument = new CommandInstrument('mining-run', repoRoot);

// Define commands to run (mix of real operations)
const commands = [
  { cmd: 'orient', args: ['--note', 'mine-1'] },
  { cmd: 'chart', args: [] },
  { cmd: 'show', args: ['init'] },
  { cmd: 'orient', args: ['--note', 'mine-2'] },
  { cmd: 'orient', args: ['--check'] },
  { cmd: 'chart', args: [] },
  { cmd: 'trail', args: [] },
  { cmd: 'validate', args: ['--note', 'mine-validate'] },
  { cmd: 'orient', args: ['--note', 'mine-3'] },
  { cmd: 'chart', args: [] },
  { cmd: 'show', args: ['init'] },
  { cmd: 'orient', args: ['--note', 'mine-4'] },
  { cmd: 'trail', args: ['--last', '10'] },
  { cmd: 'orient', args: ['--note', 'mine-5'] },
  { cmd: 'chart', args: [] },
  { cmd: 'claim', args: ['init', '--owner', 'test-agent'] },
  { cmd: 'orient', args: [] },
  { cmd: 'trail', args: [] },
  { cmd: 'orient', args: ['--note', 'mine-6'] },
  { cmd: 'chart', args: [] },
  { cmd: 'show', args: ['init'] },
  { cmd: 'trail', args: ['--last', '5'] },
  { cmd: 'orient', args: ['--note', 'mine-7'] },
  { cmd: 'chart', args: [] },
  { cmd: 'validate', args: ['--note', 'mine-validate-2'] },
  { cmd: 'orient', args: ['--note', 'mine-8'] },
  { cmd: 'trail', args: [] },
  { cmd: 'orient', args: ['--note', 'mine-9'] },
  { cmd: 'chart', args: [] },
  { cmd: 'orient', args: ['--note', 'mine-10'] },
];

async function runCommand(cmd: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(join(repoRoot, 'bin/roadmap'), [cmd, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    proc.on('error', () => {
      resolve({ exitCode: 1, stdout, stderr });
    });
  });
}

async function main() {
  console.error(`[mining] Starting ${commands.length} command runs...`);

  for (let i = 0; i < commands.length; i++) {
    const { cmd, args } = commands[i];
    console.error(`[mining] ${i + 1}/${commands.length} — ${cmd} ${args.join(' ')}`);

    const timer = instrument.startExecution(cmd, args, {
      nodeId: 'usage-mine',
      dagId: 'metaflow-cli-quality',
      noteText: args.find((a) => a !== '--note') || undefined,
    });

    try {
      const { exitCode, stdout, stderr } = await runCommand(cmd, args);
      timer.stop(exitCode, stdout);
    } catch (err) {
      timer.stop(1, '');
    }
  }

  console.error(`[mining] ${commands.length} commands executed`);

  // Aggregate statistics by command + flags
  const executions = instrument.getExecutions();
  const cmdMap = new Map<
    string,
    {
      count: number;
      durations: number[];
      exitCodes: Map<number, number>;
      contexts: Set<string>;
    }
  >();

  for (const exec of executions) {
    // Create a key that includes command and its flags for finer granularity
    const flagStr = exec.args.length > 0 ? ' ' + exec.args.join(' ').substring(0, 30) : '';
    const key = exec.cmd + flagStr;
    if (!cmdMap.has(key)) {
      cmdMap.set(key, {
        count: 0,
        durations: [],
        exitCodes: new Map(),
        contexts: new Set(),
      });
    }

    const stats = cmdMap.get(key)!;
    stats.count++;
    stats.durations.push(exec.durationMs);
    stats.exitCodes.set(exec.exitCode, (stats.exitCodes.get(exec.exitCode) || 0) + 1);
    if (exec.nodeId && exec.dagId) {
      stats.contexts.add(JSON.stringify({ nodeId: exec.nodeId, dagId: exec.dagId }));
    }
  }

  const aggregated = Array.from(cmdMap.entries()).map(([fullCmd, stats]) => {
    const sorted = stats.durations.sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    // Parse out base cmd and args
    const parts = fullCmd.split(' ');
    const cmd = parts[0];
    const argsStr = parts.slice(1).join(' ');

    return {
      cmd,
      ...(argsStr && { args: argsStr }),
      count: stats.count,
      avgDurationMs: Math.round(avg),
      medianDurationMs: Math.round(median),
      minDurationMs: Math.min(...stats.durations),
      maxDurationMs: Math.max(...stats.durations),
      exitCodes: Object.fromEntries(stats.exitCodes),
      contexts: Array.from(stats.contexts).map((s) => JSON.parse(s)),
    };
  });

  let totalDuration = 0;
  let errorCount = 0;
  for (const exec of executions) {
    totalDuration += exec.durationMs;
    if (exec.exitCode !== 0) errorCount++;
  }

  const output = {
    timestamp: new Date().toISOString(),
    totalCommands: executions.length,
    commands: aggregated,
    summary: {
      totalDurationMs: totalDuration,
      avgCommandDurationMs: Math.round(totalDuration / executions.length),
      errorCount,
      successRate: (executions.length - errorCount) / executions.length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error('Mining failed:', err);
  process.exit(1);
});
