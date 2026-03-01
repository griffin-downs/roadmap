#!/usr/bin/env npx tsx
// Usage mining: run 20+ CLI commands via CommandInstrument, produce mining-run.json + trail-sequences.json

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/home/griffin/src/roadmap';
const CLI = join(ROOT, 'bin/roadmap');
const OUT = join(ROOT, '.roadmap/cli-quality');

interface CmdSpec { cmd: string; args: string[]; expectExit?: number }

// 20+ distinct CLI invocations covering orient, chart, show, claim, validate, trail, parallel, help, describe
const commands: CmdSpec[] = [
  { cmd: 'orient', args: ['--note', 'mine-run-1'] },
  { cmd: 'orient', args: ['--note', 'mine-run-2'] },
  { cmd: 'orient', args: ['--check'] },
  { cmd: 'orient', args: ['--note', 'mine-run-3', '--json'] },
  { cmd: 'chart', args: [] },
  { cmd: 'chart', args: ['--deps'] },
  { cmd: 'chart', args: ['--critical-path'] },
  { cmd: 'show', args: ['init', '--note', 'mine-show-init'] },
  { cmd: 'show', args: ['usage-mine', '--note', 'mine-show-self'] },
  { cmd: 'show', args: ['term', '--note', 'mine-show-term'] },
  { cmd: 'show', args: ['--batch', '--note', 'mine-show-batch'] },
  { cmd: 'validate', args: ['init', '--note', 'mine-validate-init'] },
  { cmd: 'validate', args: ['usage-mine', '--note', 'mine-validate-self'] },
  { cmd: 'trail', args: ['--last', '5'] },
  { cmd: 'trail', args: ['--last', '10'] },
  { cmd: 'trail', args: ['--last', '20'] },
  { cmd: 'parallel', args: ['--note', 'mine-parallel'] },
  { cmd: 'parallel', args: ['--graph', '--note', 'mine-parallel-graph'] },
  { cmd: 'help', args: [] },
  { cmd: 'describe', args: ['--note', 'mine-describe'] },
  { cmd: 'claim', args: ['--list', '--note', 'mine-claim-list'] },
  { cmd: 'retire', args: ['--list', '--note', 'mine-retire-list'] },
  { cmd: 'orient', args: ['--note', 'mine-run-4'] },
  { cmd: 'orient', args: ['--note', 'mine-run-5'] },
  { cmd: 'orient', args: ['--ready', '--note', 'mine-ready'] },
  { cmd: 'orient', args: ['--next', '--note', 'mine-next'] },
  { cmd: 'orient', args: ['--staged', '--note', 'mine-staged'] },
  { cmd: 'validate', args: ['--note', 'mine-validate-all'] },
  { cmd: 'iter-id', args: ['--note', 'mine-iter-id'] },
  { cmd: 'report', args: ['--note', 'mine-report'] },
];

interface Execution {
  cmd: string;
  args: string;
  count: number;
  avgDurationMs: number;
  medianDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  exitCodes: Record<string, number>;
  contexts: { nodeId: string; dagId: string }[];
}

const executions: { cmd: string; args: string; durationMs: number; exitCode: number; outputSize: number; outputStructure: string }[] = [];

for (const spec of commands) {
  const fullArgs = [spec.cmd, ...spec.args];
  const start = Date.now();
  let exitCode = 0;
  let stdout = '';
  try {
    stdout = execSync(`${CLI} ${fullArgs.join(' ')}`, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e: any) {
    exitCode = e.status ?? 1;
    stdout = e.stdout ?? '';
  }
  const durationMs = Date.now() - start;

  let outputStructure = 'text';
  const trimmed = (stdout || '').trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && 'schema_version' in parsed) outputStructure = 'envelope';
      else outputStructure = 'json';
    } catch {
      if (/^\s*[{\[]/.test(trimmed)) outputStructure = 'mixed';
    }
  }

  executions.push({
    cmd: spec.cmd,
    args: spec.args.join(' '),
    durationMs,
    exitCode,
    outputSize: (stdout || '').length,
    outputStructure,
  });
}

// Aggregate into mining-run.json format
const grouped = new Map<string, typeof executions>();
for (const e of executions) {
  const key = `${e.cmd}|${e.args}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key)!.push(e);
}

const commandEntries: Execution[] = [];
for (const [key, group] of grouped) {
  const [cmd, args] = key.split('|');
  const durations = group.map(g => g.durationMs).sort((a, b) => a - b);
  const exitCodes: Record<string, number> = {};
  for (const g of group) exitCodes[g.exitCode] = (exitCodes[g.exitCode] ?? 0) + 1;

  commandEntries.push({
    cmd,
    args: args || undefined as any,
    count: group.length,
    avgDurationMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    medianDurationMs: durations[Math.floor(durations.length / 2)],
    minDurationMs: durations[0],
    maxDurationMs: durations[durations.length - 1],
    exitCodes,
    contexts: [{ nodeId: 'usage-mine', dagId: 'metaflow-cli-quality' }],
  });
}

const miningRun = {
  timestamp: new Date().toISOString(),
  totalCommands: executions.length,
  commands: commandEntries,
  summary: {
    totalDurationMs: executions.reduce((a, e) => a + e.durationMs, 0),
    avgCommandDurationMs: Math.round(executions.reduce((a, e) => a + e.durationMs, 0) / executions.length),
    errorCount: executions.filter(e => e.exitCode !== 0).length,
    successRate: executions.filter(e => e.exitCode === 0).length / executions.length,
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'mining-run.json'), JSON.stringify(miningRun, null, 2) + '\n');
console.log(`mining-run.json: ${miningRun.totalCommands} commands, ${miningRun.summary.avgCommandDurationMs}ms avg`);

// Extract trail sequences from .roadmap/trail.jsonl
const trailPath = join(ROOT, '.roadmap/trail.jsonl');
const trailLines = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean);

interface TrailEntry { ts?: string; cmd?: string; timestamp?: string; type?: string }
const entries: TrailEntry[] = trailLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// Window by 5-minute intervals
const windows = new Map<string, string[]>();
for (const e of entries) {
  const ts = e.ts || e.timestamp;
  if (!ts) continue;
  const cmd = e.cmd || e.type || 'unknown';
  const d = new Date(ts);
  const windowKey = new Date(Math.floor(d.getTime() / 300000) * 300000).toISOString();
  if (!windows.has(windowKey)) windows.set(windowKey, []);
  windows.get(windowKey)!.push(cmd);
}

const sequences = Array.from(windows.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([window, cmds]) => ({ window, commands: cmds, count: cmds.length }));

const trailSequences = {
  sequences,
  windowDurationMinutes: 5,
  totalSequences: sequences.length,
};

writeFileSync(join(OUT, 'trail-sequences.json'), JSON.stringify(trailSequences, null, 2) + '\n');
console.log(`trail-sequences.json: ${trailSequences.totalSequences} windows`);
