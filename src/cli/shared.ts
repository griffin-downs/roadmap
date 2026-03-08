// @module cli/shared
// @description Shared CLI infrastructure extracted from bin/roadmap.ts.
// @exports loadDAG, appendTrail, recordTrailError, enforceMainBranch, safeReadFile,
//          extractNote, hasFlag, json, retiredSet, crossOrientWithState, loadSpecGoal,
//          initGitsafe, getCurrentBranch, isWorktree, loadDAGSync

import { readFileSync, existsSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { createGitSafeLoader } from '../lib/gitsafe-loader.ts';
import { orient } from '../core/orient.ts';
import { RoadmapError } from '../errors.ts';
import { CompletionStore } from '../runtime/completion.ts';
import { loadDAGWithAutoMerge } from '../lib/roadmap/cli-auto-merge.ts';
import { ensureConsolidated } from '../lib/roadmap/cli-consolidation-init.ts';
import { migrateSingleHead } from '../lib/multi-dag.ts';
import { emit, setRepoRoot, type OutputOpts } from '../lib/cli-envelope.ts';
import type { Graph } from '../lib/protocol/types.ts';

// ── Gitsafe ─────────────────────────────────────────────────────────────

let _gitsafe: ReturnType<typeof createGitSafeLoader> | null = null;

/** Initialize gitsafe loader for a repo root. Call once at CLI entry. */
export function initGitsafe(repoRoot: string): void {
  _gitsafe = createGitSafeLoader(repoRoot);
}

function getGitsafe(repoRoot: string): ReturnType<typeof createGitSafeLoader> {
  if (!_gitsafe) _gitsafe = createGitSafeLoader(repoRoot);
  return _gitsafe;
}

// ── Branch enforcement ──────────────────────────────────────────────────

export function getCurrentBranch(repoRoot: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export function isWorktree(repoRoot: string): boolean {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
    return gitDir.includes('worktrees');
  } catch {
    return false;
  }
}

export function enforceMainBranch(repoRoot: string): void {
  if (isWorktree(repoRoot)) return;

  const branch = getCurrentBranch(repoRoot);
  if (branch === 'main' || branch === 'HEAD'
      || branch.startsWith('feat/') || branch.startsWith('wip/')) {
    return;
  }

  console.error(JSON.stringify({
    error: 'gitsafe: DAG-mutating operations require main, feat/*, or wip/* branch',
    currentBranch: branch,
    fix: `Switch branch: git checkout main (or use feat/${branch} / wip/${branch})`,
  }));
  process.exit(1);
}

// ── Safe file reading ───────────────────────────────────────────────────

export function safeReadFile(path: string, repoRoot: string): string {
  const gitsafe = getGitsafe(repoRoot);
  const relative = path.startsWith(repoRoot)
    ? path.slice(repoRoot.length + 1)
    : path;
  if (!gitsafe.isAllowed(relative)) {
    throw new Error(`gitsafe: file access denied (denylist): ${relative}`);
  }
  return readFileSync(path, 'utf-8');
}

// ── Arg parsing ─────────────────────────────────────────────────────────

export function extractNote(argv: string[]): { note: string | undefined; positional: string[] } {
  const idx = argv.indexOf('--note');
  if (idx === -1) return { note: undefined, positional: argv };
  const note = argv[idx + 1];
  const positional = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { note, positional };
}

export function hasFlag(flags: string[], haystack: string[]): boolean {
  for (const flag of flags) {
    if (haystack.includes(flag)) return true;
  }
  return false;
}

// ── Trail recording ─────────────────────────────────────────────────────

let _roadmapSha: string | undefined;

function getRoadmapSha(): string | undefined {
  if (_roadmapSha !== undefined) return _roadmapSha || undefined;
  try {
    const binDir = dirname(new URL(import.meta.url).pathname);
    const pkgDir = resolve(binDir, '..');
    _roadmapSha = execSync('git rev-parse --short HEAD', { cwd: pkgDir, encoding: 'utf-8' }).trim();
  } catch { _roadmapSha = ''; }
  return _roadmapSha || undefined;
}

function stampEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const sha = getRoadmapSha();
  return sha ? { ...entry, roadmapSha: sha } : entry;
}

function appendToTrailFiles(stamped: Record<string, unknown>, repoRoot: string): void {
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  const trailPath = join(roadmapDir, 'trail.jsonl');
  appendFileSync(trailPath, JSON.stringify(stamped) + '\n', 'utf-8');

  const globalDir = join(homedir(), '.roadmap');
  if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });
  const globalTrailPath = join(globalDir, 'trail.jsonl');
  appendFileSync(globalTrailPath, JSON.stringify(stamped) + '\n', 'utf-8');
}

export function appendTrail(entry: Record<string, unknown>, repoRoot: string): void {
  appendToTrailFiles(stampEntry(entry), repoRoot);
}

export function recordTrailError(
  cmd: string, code: string, message: string, repoRoot: string, note?: string,
): void {
  try {
    appendToTrailFiles(stampEntry({
      ts: new Date().toISOString(),
      type: 'error',
      cmd,
      code,
      message,
      note: note ?? '',
      repo: basename(repoRoot),
    }), repoRoot);
  } catch { /* trail write must never crash the CLI */ }
}

// ── Retired nodes ───────────────────────────────────────────────────────

export function retiredSet(repoRoot: string): Set<string> {
  const retired = new Set<string>();
  const retiredPath = join(repoRoot, '.roadmap', 'retired.jsonl');
  if (existsSync(retiredPath)) {
    const lines = readFileSync(retiredPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.nodeId) retired.add(record.nodeId);
      } catch { /* skip malformed */ }
    }
  }
  return retired;
}

// ── Spec goal loading ───────────────────────────────────────────────────

export function loadSpecGoal(
  dagId: string, repoRoot: string,
): { statement: string; satisfied_when?: string; known_remaining?: string[] } | null {
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) return null;
  try {
    for (const file of readdirSync(roadmapDir)) {
      if (!file.endsWith('-spec.json') || file === 'spec-origin.json') continue;
      try {
        const spec = JSON.parse(readFileSync(join(roadmapDir, file), 'utf-8'));
        if (spec?.dag_id === dagId && spec?.goal && typeof spec.goal.statement === 'string') {
          return spec.goal;
        }
      } catch { /* skip */ }
    }
  } catch { /* roadmap dir unreadable */ }
  return null;
}

// ── DAG loading ─────────────────────────────────────────────────────────

export async function loadDAG(repoRoot: string): Promise<Graph<string>> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: headPath,
      fix: 'Initialize roadmap: create .roadmap/head.json or use: roadmap make <spec> --note "..."',
      entry: 'roadmap orient',
    }, 'No .roadmap/head.json found.');
  }

  try {
    const result = await loadDAGWithAutoMerge(repoRoot);
    return result.graph;
  } catch {
    return JSON.parse(safeReadFile(headPath, repoRoot));
  }
}

export function loadDAGSync(repoRoot: string): Graph<string> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: headPath,
      fix: 'Initialize roadmap: create .roadmap/head.json or use: roadmap make <spec> --note "..."',
      entry: 'roadmap orient',
    }, 'No .roadmap/head.json found.');
  }
  return JSON.parse(safeReadFile(headPath, repoRoot));
}

/** Consolidation: ensure multi-head DAGs are merged. Non-fatal on failure. */
export async function ensureDAGConsolidated(repoRoot: string): Promise<void> {
  try {
    await ensureConsolidated(repoRoot);
  } catch { /* non-fatal */ }
}

/** Migrate single head.json to heads/ directory if needed. */
export { migrateSingleHead } from '../lib/multi-dag.ts';

// ── Orient with completion state ────────────────────────────────────────

export async function crossOrientWithState(dag: Graph<string>, repoRoot: string) {
  const completion = CompletionStore.loadOrEmpty(repoRoot);
  const retired = retiredSet(repoRoot);
  const dagFiltered = completion.filterByDagId(dag.id);
  const pos = orient(dag, (id) => dagFiltered.hasPassing(id), retired);

  const allNodeIds = Object.keys(dag.nodes);
  const remainingIds = allNodeIds.filter(nid => !retired.has(nid) && !dagFiltered.hasPassing(nid));

  // Surface legacy completions (passing without evidence)
  const legacyIds = dagFiltered.legacyIds();
  const legacyCompletions = [...legacyIds].filter(id => id in dag.nodes);

  return { ...pos, remaining: remainingIds, legacyCompletions };
}

// ── Output helpers ──────────────────────────────────────────────────────

export function json(obj: unknown, outputOpts: OutputOpts): void {
  const hasError = typeof obj === 'object' && obj !== null && 'error' in obj;
  if (hasError) {
    emit({ ok: false, cmd: outputOpts.cmd, error: obj } as any, outputOpts);
  } else {
    emit({ ok: true, cmd: outputOpts.cmd, data: obj }, outputOpts);
  }
}

// ── Re-exports for convenience ──────────────────────────────────────────

export { setRepoRoot } from '../lib/cli-envelope.ts';
export { findRepoRoot } from '../predicates.ts';
