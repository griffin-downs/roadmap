#!/usr/bin/env npx tsx
// Discoverability audit: analyze mining + trail data, produce scored audit + score

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/home/griffin/src/roadmap';
const OUT = join(ROOT, '.roadmap/cli-quality');

const miningRun = JSON.parse(readFileSync(join(OUT, 'mining-run.json'), 'utf-8'));
const trailSeqs = JSON.parse(readFileSync(join(OUT, 'trail-sequences.json'), 'utf-8'));

// Known commands
const KNOWN_COMMANDS = new Set([
  'orient', 'advance', 'complete', 'describe', 'validate', 'expand',
  'branch', 'parallel', 'chart', 'show', 'claim', 'trail', 'help',
  'retire', 'import', 'init', 'report', 'iter-id', 'propagate',
  'checkpoint', 'diff', 'merge', 'sync', 'locate', 'plan select',
  'compile-brief', 'compile-prompts', 'plan overlay', 'gate merge',
  'env-audit', 'spec init', 'spec generate', 'spec compile',
  'intake absorb', 'install', 'install-hooks', 'explore', 'dag.reject',
  'commit',
]);

// Known flags
const KNOWN_FLAGS = [
  '--note', '--check', '--json', '--quiet', '--dry-run', '--assign',
  '--next', '--ready', '--repo', '--depth', '--cascade', '--undo',
  '--list', '--global', '--deps', '--critical-path', '--graph',
];

// 1. Unknown command rate
const allTrailCmds: string[] = [];
for (const seq of trailSeqs.sequences) {
  allTrailCmds.push(...seq.commands);
}
const unknownCmds = allTrailCmds.filter(c => !KNOWN_COMMANDS.has(c));
const unknownCommandRate = allTrailCmds.length > 0 ? unknownCmds.length / allTrailCmds.length : 0;

// 2. Error without retry rate
const miningCmds = miningRun.commands || [];
const errorCmds = miningCmds.filter((c: any) => {
  const codes = c.exitCodes || {};
  return Object.keys(codes).some(k => k !== '0' && codes[k] > 0);
});
// Check if error commands are followed by a retry of the same command
let errorsWithoutRetry = 0;
for (let i = 0; i < miningCmds.length; i++) {
  const c = miningCmds[i];
  const hasError = Object.keys(c.exitCodes || {}).some((k: string) => k !== '0' && c.exitCodes[k] > 0);
  if (!hasError) continue;
  const next = miningCmds[i + 1];
  if (!next || next.cmd !== c.cmd) errorsWithoutRetry++;
}
const totalErrors = errorCmds.length;
const errorWithoutRetryRate = totalErrors > 0 ? errorsWithoutRetry / totalErrors : 0;

// 3. Workflow abandon rate: orient commands followed by another orient (without meaningful action between)
let abandonedOrients = 0;
let totalOrients = 0;
for (const seq of trailSeqs.sequences) {
  for (let i = 0; i < seq.commands.length; i++) {
    if (seq.commands[i] === 'orient') {
      totalOrients++;
      if (i + 1 < seq.commands.length && seq.commands[i + 1] === 'orient') {
        abandonedOrients++;
      }
    }
  }
}
const workflowAbandonRate = totalOrients > 0 ? abandonedOrients / totalOrients : 0;

// 4. Unused flag penalty: how many known flags were never observed in mining
const observedFlags = new Set<string>();
for (const c of miningCmds) {
  const args = (c.args || '').split(' ');
  for (const a of args) {
    if (a.startsWith('--')) observedFlags.add(a);
  }
}
const unusedFlags = KNOWN_FLAGS.filter(f => !observedFlags.has(f));
const unusedFlagPenalty = KNOWN_FLAGS.length > 0 ? unusedFlags.length / KNOWN_FLAGS.length : 0;

// Score: 100 - (unknownCommandRate*30) - (errorWithoutRetryRate*20) - (workflowAbandonRate*30) - (unusedFlagPenalty*20)
const unknownPenalty = Math.round(unknownCommandRate * 30 * 100) / 100;
const errorPenalty = Math.round(errorWithoutRetryRate * 20 * 100) / 100;
const abandonPenalty = Math.round(workflowAbandonRate * 30 * 100) / 100;
const flagPenalty = Math.round(unusedFlagPenalty * 20 * 100) / 100;
const score = Math.round(Math.max(0, Math.min(100, 100 - unknownPenalty - errorPenalty - abandonPenalty - flagPenalty)));

// Findings
const findings: any[] = [];
if (totalErrors > 0) {
  findings.push({
    category: 'error-handling',
    severity: totalErrors > 5 ? 'high' : 'medium',
    description: `${(errorCmds.length / miningRun.totalCommands * 100).toFixed(1)}% of commands exit with errors`,
    errorCount: totalErrors,
    totalCommands: miningRun.totalCommands,
    recommendation: 'Investigate error conditions (invalid node IDs, missing DAG, permission issues)',
  });
}

if (workflowAbandonRate > 0.3) {
  findings.push({
    category: 'workflow',
    severity: 'high',
    description: `${(workflowAbandonRate * 100).toFixed(1)}% of orient commands followed directly by another orient (without reading output)`,
    abandonedOrients,
    totalOrients,
    recommendation: 'After orient, users often re-orient without reading output. Add context hints or next-step prompts.',
  });
}

if (unusedFlags.length > 5) {
  findings.push({
    category: 'discoverability',
    severity: 'medium',
    description: `${unusedFlags.length} documented flags are never used in observed workflows`,
    unusedFlags,
    recommendation: 'Improve flag visibility in help text, add examples in README, or consider removing/aliasing unused flags',
  });
}

if (errorWithoutRetryRate > 0.3) {
  findings.push({
    category: 'error-recovery',
    severity: 'medium',
    description: `${(errorWithoutRetryRate * 100).toFixed(1)}% of errors are not immediately retried`,
    recommendation: 'Provide clearer error messages with recovery suggestions',
  });
}

const audit = {
  timestamp: new Date().toISOString(),
  metrics: {
    unknownCommandRate: Math.round(unknownCommandRate * 10000) / 10000,
    unknownCommandCount: unknownCmds.length,
    totalCommandsObserved: miningRun.totalCommands,
    errorWithoutRetryRate: Math.round(errorWithoutRetryRate * 10000) / 10000,
    workflowAbandonRate: Math.round(workflowAbandonRate * 10000) / 10000,
    abandonedOrientCount: abandonedOrients,
    totalOrientCount: totalOrients,
    unusedFlagPenalty: Math.round(unusedFlagPenalty * 10000) / 10000,
    unusedFlags,
    totalKnownFlags: KNOWN_FLAGS.length,
  },
  findings,
  summary: {
    overallHealthy: score >= 70,
    primaryGaps: findings.map(f => f.category),
    commandErrorRate: `${(totalErrors / miningRun.totalCommands * 100).toFixed(1)}%`,
  },
};

writeFileSync(join(OUT, 'discoverability-audit.json'), JSON.stringify(audit, null, 2) + '\n');

const scoreDoc = {
  score,
  timestamp: new Date().toISOString(),
  components: {
    unknownCommandRate: { rate: Math.round(unknownCommandRate * 10000) / 10000, penalty: unknownPenalty, maxPenalty: 30 },
    errorWithoutRetryRate: { rate: Math.round(errorWithoutRetryRate * 10000) / 10000, penalty: errorPenalty, maxPenalty: 20 },
    workflowAbandonRate: { rate: Math.round(workflowAbandonRate * 10000) / 10000, penalty: abandonPenalty, maxPenalty: 30 },
    unusedFlagPenalty: { rate: Math.round(unusedFlagPenalty * 10000) / 10000, penalty: flagPenalty, maxPenalty: 20 },
  },
  baseline: 100,
  formula: '100 - (unknownCommandRate * 30) - (errorWithoutRetryRate * 20) - (workflowAbandonRate * 30) - (unusedFlagPenalty * 20)',
};

writeFileSync(join(OUT, 'discoverability-score.json'), JSON.stringify(scoreDoc, null, 2) + '\n');

console.log(`discoverability-audit.json: ${findings.length} findings`);
console.log(`discoverability-score.json: score=${score}`);
console.log(`  unknownCmd: ${unknownPenalty}/${30}, errorRetry: ${errorPenalty}/${20}, abandon: ${abandonPenalty}/${30}, flags: ${flagPenalty}/${20}`);
