// @module cli/loop
// @description Loop lifecycle CLI: start, generate, mine, close
// @exports run
// @entry roadmap

import { execSync } from 'node:child_process';
import { loadFleetContext } from '../runtime/fleet.ts';
import { writeLoopReceipt, readLoopHistory, verifyLoopChain } from '../runtime/loop.ts';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';
import type { LoopReceipt, MiningFindings } from '../lib/fleet-types.ts';

function getHeadCommit(repoRoot: string): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch { return null; }
}

function parseJsonArg(args: string[], flag: string): unknown | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return JSON.parse(args[idx + 1]);
}

async function loopStart(args: string[], repoRoot: string, note: string, outputOpts: OutputOpts): Promise<void> {
  const history = readLoopHistory(repoRoot);
  const iteration = history.length > 0
    ? Math.max(...history.map(r => r.iteration)) + 1
    : 0;

  const compilerCommit = getHeadCommit(repoRoot) ?? 'unknown';
  const receipt: LoopReceipt = {
    iteration,
    startedAt: new Date().toISOString(),
    compilerCommit,
    generations: [],
    previousSha: history.length > 0 ? (history[history.length - 1].sha ?? null) : null,
  };

  const written = writeLoopReceipt(repoRoot, receipt);
  emit({ ok: true, cmd: outputOpts.cmd, data: {
    action: 'start',
    iteration,
    compilerCommit,
    sha: written.sha,
    message: `Loop iteration ${iteration} started`,
    note,
  } }, outputOpts);
}

async function loopGenerate(args: string[], repoRoot: string, note: string, outputOpts: OutputOpts): Promise<void> {
  const repoFlag = args.indexOf('--repo');
  if (repoFlag === -1 || repoFlag + 1 >= args.length) {
    emit({ ok: false, cmd: outputOpts.cmd, error: { code: 'MISSING_REPO', message: '--repo <name> required' } }, outputOpts);
    process.exit(1);
  }
  const repoName = args[repoFlag + 1];

  const fleet = loadFleetContext(repoRoot);
  const target = fleet.repos.find(r => r.entry.name === repoName);
  if (!target) {
    emit({ ok: false, cmd: outputOpts.cmd, error: { code: 'REPO_NOT_FOUND', message: `repo "${repoName}" not in fleet.json` } }, outputOpts);
    process.exit(1);
  }

  const headCommit = target.resolvedPath ? getHeadCommit(target.resolvedPath) : null;
  const history = readLoopHistory(repoRoot);
  if (history.length === 0) {
    emit({ ok: false, cmd: outputOpts.cmd, error: { code: 'NO_LOOP', message: 'No active loop. Run `roadmap loop start` first.' } }, outputOpts);
    process.exit(1);
  }

  const current = history[history.length - 1];
  current.generations.push({
    repo: repoName,
    dagId: 'unknown',
    headCommit,
    status: 'active',
  });

  writeLoopReceipt(repoRoot, current);
  emit({ ok: true, cmd: outputOpts.cmd, data: {
    action: 'generate',
    repo: repoName,
    headCommit,
    iteration: current.iteration,
    note,
  } }, outputOpts);
}

async function loopMine(args: string[], repoRoot: string, note: string, outputOpts: OutputOpts): Promise<void> {
  const history = readLoopHistory(repoRoot);
  if (history.length === 0) {
    emit({ ok: false, cmd: outputOpts.cmd, error: { code: 'NO_LOOP', message: 'No active loop.' } }, outputOpts);
    process.exit(1);
  }

  const current = history[history.length - 1];
  const mining = parseJsonArg(args, '--findings') as MiningFindings | undefined;
  if (!mining) {
    emit({ ok: false, cmd: outputOpts.cmd, error: {
      code: 'MISSING_FINDINGS',
      message: '--findings \'{"extracted":[],"requestFixes":[],"stalled":[]}\' required',
    } }, outputOpts);
    process.exit(1);
  }

  current.mining = mining;
  writeLoopReceipt(repoRoot, current);
  emit({ ok: true, cmd: outputOpts.cmd, data: {
    action: 'mine',
    iteration: current.iteration,
    mining,
    note,
  } }, outputOpts);
}

async function loopClose(args: string[], repoRoot: string, note: string, outputOpts: OutputOpts): Promise<void> {
  const history = readLoopHistory(repoRoot);
  if (history.length === 0) {
    emit({ ok: false, cmd: outputOpts.cmd, error: { code: 'NO_LOOP', message: 'No active loop.' } }, outputOpts);
    process.exit(1);
  }

  const current = history[history.length - 1];
  const force = args.includes('--force');

  if (!force) {
    const fleet = loadFleetContext(repoRoot);
    const incomplete = fleet.repos.filter(r => r.context !== null).filter(r => {
      // Check if repo's DAG is complete — rough check via context
      return true; // Full check would need orient per repo; for now rely on --force or manual verification
    });
    // loopReady gate is advisory for now
  }

  current.closedAt = new Date().toISOString();
  const written = writeLoopReceipt(repoRoot, current);

  const chainResult = verifyLoopChain(history);

  emit({ ok: true, cmd: outputOpts.cmd, data: {
    action: 'close',
    iteration: current.iteration,
    sha: written.sha,
    chainValid: chainResult.valid,
    note,
  } }, outputOpts);
}

export async function run(
  args: string[],
  repoRoot: string,
  note: string,
  outputOpts: OutputOpts,
): Promise<void> {
  const sub = args[1];

  switch (sub) {
    case 'start':    return loopStart(args.slice(2), repoRoot, note, outputOpts);
    case 'generate': return loopGenerate(args.slice(2), repoRoot, note, outputOpts);
    case 'mine':     return loopMine(args.slice(2), repoRoot, note, outputOpts);
    case 'close':    return loopClose(args.slice(2), repoRoot, note, outputOpts);
    case '--help':
    case undefined:
      emit({ ok: true, cmd: outputOpts.cmd, data: {
        usage: 'roadmap loop {start|generate|mine|close}',
        subcommands: {
          start: 'Begin loop iteration — records compiler commit',
          generate: 'Record generation for a repo (--repo <name>)',
          mine: 'Record mining findings (--findings <json>)',
          close: 'Close loop iteration — writes receipt',
        },
      } }, outputOpts);
      return;
    default:
      emit({ ok: false, cmd: outputOpts.cmd, error: {
        code: 'UNKNOWN_SUBCOMMAND',
        message: `Unknown loop subcommand: ${sub}`,
        fix: ['roadmap loop {start|generate|mine|close}'],
      } }, outputOpts);
      process.exit(1);
  }
}
